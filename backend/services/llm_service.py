import os
import json
import base64
import re
import fitz # PyMuPDF
from groq import Groq
from dotenv import load_dotenv

load_dotenv() # Load from current dir
# Also try to load from root if started from backend/
load_dotenv(dotenv_path=os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", ".env"))

# Initialize Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def log_to_file(msg):
    try:
        log_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "backend_audit.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{os.getpid()}] {msg}\n")
    except:
        pass

def safe_int(val, default=0):
    """Safely convert a value to an integer, handling None, empty strings, and formatted numbers."""
    if val is None:
        return default
    try:
        # Remove commas, currency symbols, and spaces
        s_val = str(val).replace(',', '').replace('₹', '').strip()
        # Extract the first sequence of digits
        match = re.search(r'(\d+)', s_val)
        if match:
            return int(match.group(1))
        return default
    except (ValueError, TypeError):
        return default

def calculate_deterministic_risk(data: dict) -> tuple:
    """
    Calculates risk level and specific reasons based on strict business rules.
    Returns (risk_level, reasons_list, delinquency_details)
    """
    reasons = []
    delinquency_details = []
    summary = data.get("summary") or {}
    score = safe_int(summary.get("cibil_score"), 0)
    enq_30 = safe_int(summary.get("enquiries_30d"), 0)
    enq_90 = safe_int(summary.get("enquiries_90d"), 0)
    
    # 1. Collect Specific Delinquency Events from Payment History
    payment_hist = data.get("payment_history")
    if not isinstance(payment_hist, list):
        payment_hist = []
        
    seen_events = set()
    for entry in payment_hist:
        if not isinstance(entry, dict): continue
        status = str(entry.get("status", "")).strip().upper()
        # Non-standard statuses: anything not STD, 000, 0, or ACT
        # We also ignore common placeholders like "*", "NULL", "NONE", "ACTUAL"
        if status and status not in ["STD", "000", "0", "ACT", "STANDARD", "NULL", "NONE", "*", "ACTUAL", "ACT"]:
            lender = entry.get("lender", "Unknown Lender")
            period = entry.get("month_year", "Unknown Period")
            event_str = f"{lender} at {period} (Status: {status})"
            if event_str not in seen_events:
                delinquency_details.append(event_str)
                seen_events.add(event_str)

    # 2. Check for loans flagged with has_late_payments but might not be in payment_history list
    active_loans = data.get("active_loan_details")
    if not isinstance(active_loans, list): active_loans = []
    
    closed_loans = data.get("closed_loan_details")
    if not isinstance(closed_loans, list): closed_loans = []
    
    for loan in active_loans + closed_loans:
        if not isinstance(loan, dict): continue
        if loan.get("has_late_payments"):
            lender = loan.get("lender_name", "Unknown Lender")
            event_str = f"{lender} (Reported DPD/Late Payment)"
            # Only add if we don't already have specific month-wise data for this lender
            if not any(lender in e for e in delinquency_details):
                if event_str not in seen_events:
                    delinquency_details.append(event_str)
                    seen_events.add(event_str)

    has_overdue = len(delinquency_details) > 0
    
    # Rule 4 & 5: Enquiry Load (High Priority)
    is_high_enquiry = False
    if enq_30 > 6:
        reasons.append(f"High enquiry volume ({enq_30}) in last 30 days (Threshold: 6)")
        is_high_enquiry = True
    if enq_90 > 9:
        reasons.append(f"Excessive enquiries ({enq_90}) in last 90 days (Threshold: 9)")
        is_high_enquiry = True

    # Rule 2: Overdue override for high scores
    is_overdue_flag = False
    if has_overdue:
        reasons.append("Account history shows non-standard payment status (DPD > 0)")
        is_overdue_flag = True

    # Determine Base Risk based on Score (Rule 1)
    if score >= 750: # Includes 750 as requested
        base_level = "Very Good"
    elif 700 <= score <= 749:
        base_level = "Good"
    elif 675 <= score <= 699:
        base_level = "Average"
        reasons.append(f"Score {score} falls in the high-risk bracket (675-699)")
    else:
        base_level = "Average"
        reasons.append(f"CIBIL Score {score} is below the critical threshold (< 675)")

    # Final Classification with overrides
    if is_high_enquiry or is_overdue_flag or base_level == "Average":
        final_level = "Average"
        # Special check for Rule 2: Score 750+ but overdue
        if score >= 750 and is_overdue_flag:
            reasons.append("Risk Escalated: Payment delays observed despite strong CIBIL score")
    elif base_level == "Good":
        final_level = "Good"
    else:
        # Check Rule 3: No overdue observed
        if not is_overdue_flag:
            reasons.append("Excellent payment discipline: No DPD/Overdue observed in recent records")
            final_level = "Very Good"
        else:
            final_level = "Good"

    return final_level, reasons, delinquency_details

def summarize_cibil_report(text: str) -> dict:
    """
    Send text to Groq Llama 3 for extraction.
    We ask the model to output exactly JSON so we can parse it reliably.
    """
    
    # Expanded limit: llama-3.1-8b-instant has 128k context. 
    # 50k chars is ~12k tokens, well within limits and covers 99% of reports.
    max_chars = 50000
    if len(text) > max_chars:
        # Keep 30k chars from head (Personal + Summary + active loans)
        # Keep 20k chars from tail (Enquiries + Closed loans usually near end)
        text = text[:30000] + "\n... [TRUNCATED FOR TOKEN LIMIT] ...\n" + text[-20000:]

    prompt = f"""
    SYSTEM: Financial data extractor for Indian CIBIL reports. Extract data with zero hallucination. Numeric fields must be pure numbers.
    OUTPUT: Exact JSON structure following the rules below.

    EXTRACTION RULES:
    1. PERSONAL:
       - NAME: "Consumer/Applicant/CONSUMER INFORMATION". Full string.
       - DOB: "Date of Birth/DOB". DD-MM-YYYY.
       - DATE REPORTED: "Report Date/DATE:". DD-MM-YYYY.
       - MOBILE: "Mobile/Tel/Contact". 10 digits.
       - ADDRESS: "Address/Mailing/Permanent". Complete string.
       - CITY: Extract from address or "City". Extract precisely.
       - STATE: Extract from address or "State". Extract precisely.
       - COMPANY: "Employer/Occupation". Null if not found.

    2. SCORE: 3-digit number (300-900). Labels: "CIBIL/Experian Score". Return as integer.
    3. ACTIVE LOANS (active_loan_details): Extract every active account.
       - lender_name: Bank/NBFC name.
       - loan_type: Normalize to (Personal Loan, Credit Card, Home Loan, Gold Loan, Auto Loan, Consumer Loan, Business Loan).
       - loan_amount: Sanctioned/High Credit. "₹X,XX,XXX".
       - outstanding_balance: Current/Net Balance. "₹X,XX,XXX".
       - emi: Installment amount. "₹X,XXX".
       - loan_start_date: Date Opened. MM-YYYY or DD-MM-YYYY.
       - account_no: Account string or null.
       - overdue_amount: Amount Overdue. "₹0" if none.
       - payment_history: Array of records with: month_year (MM/YY), status (STD/0/DPD), dpd (int).

    4. CLOSED LOANS (closed_loan_details): Extract every closed/settled account.
       - Use same structure as active loans.
       - Add field: "date_closed": "DD-MM-YYYY" or "MM-YYYY".

    5. REQUIRED JSON STRUCTURE:
    {{
        "summary": {{ 
            "name": "", "dob": "", "date_reported": "", "mobile": "", "city": "", "state": "", "company": null, "address": "",
            "cibil_score": 0, "active_loans": 0, "closed_loans": 0, "total_loans": 0,
            "outstanding_amount": "₹0 (sum of active)", "enquiries_30d": 0, "enquiries_90d": 0, "total_enquiries": 0 
        }},
        "active_loan_details": [{{ ...above fields... }}],
        "closed_loan_details": [{{ ...above fields... }}],
        "enquiry_list": [{{ "lender": "", "date": "", "purpose": "", "amount": "" }}],
        "loan_history": {{ "personal_loans": [], "credit_cards": [], "home_loans": [], "gold_loans": [], "overdrafts": [] }},
        "payment_history": [{{ "lender": "", "month_year": "", "status": "" }}]
    }}

    CRITICAL:
    - has_late_payments: true if DPD > 0 or status like LPE/SUB/DBT.
    - enquiry_list must match summary counts.
    - Extract ALL records found.

    REPORT TEXT:
    """ + text + "\n"

    try:
        log_to_file(f"Starting Groq call. Text length: {len(text)}")
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that strictly outputs JSON. Your output must be a single valid JSON object following the requested schema."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=3000, # Increased to capture all accounts and enquiries
            timeout=60, # 1 minute timeout for Groq
        )
        
        result_content = response.choices[0].message.content.strip()
        log_to_file(f"Groq response received. Raw length: {len(result_content)}")
        
        # Attempt to parse JSON with extraction fallback
        try:
            try:
                data = json.loads(result_content)
            except:
                # Fallback: Find the first { and last }
                json_match = re.search(r"(\{.*\})", result_content, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group(1))
                else:
                    raise ValueError("No JSON block found in response")
        except Exception as je:
            log_to_file(f"CRITICAL: JSON Parsing Failed. Error: {str(je)}")
            log_to_file(f"OFFENDING CONTENT START >>>\n{result_content}\n<<< OFFENDING CONTENT END")
            raise je
        
        if not isinstance(data, dict):
            # Fallback for LLMs returning lists or other types
            data = {"summary": {}, "error": "Model failed to return a valid dictionary"}

        # --- HARD FALLBACK: Ultra-Aggressive search for missing personal details ---
        summary = data.get("summary")
        if not isinstance(summary, dict):
            summary = {}
        
        # Helper to check if a value is a placeholder or missing
        def is_bad(val, placeholder):
            if val is None: return True
            s_val = str(val).strip()
            return s_val == "" or s_val == placeholder or "Here" in s_val or "12345" in s_val

        # 1. NAME Extraction
        if is_bad(summary.get("name"), "Full Name Here"):
            # Highly flexible name pattern: Allows dots, spaces, and various prefix labels
            # We look for labels and then capture up to the next newline or common divider
            name_pats = [
                r"(?:Name|Consumer Name|Applicant Name)\s*[:\-]?\s*([A-Z\.\s]{3,50})",
                r"Name\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", # Mixed case fallback
            ]
            for pat in name_pats:
                m = re.search(pat, text, re.I)
                if m:
                    val = m.group(1).split('\n')[0].strip()
                    # Filter out noise like "REPORT" or "DATE"
                    if len(val) > 3 and not any(x in val.upper() for x in ["REPORT", "CIBIL", "DATE", "SCORE"]):
                        summary["name"] = val
                        break
        
        # 2. DOB Extraction
        if is_bad(summary.get("dob"), "DD-MM-YYYY"):
            dob_pats = [
                r"(?:Date Of Birth|DOB|Birth Date)\s*[:\-]?\s*(\d{2}[-/\s]\d{2}[-/\s]\d{4})",
                r"(\d{2}-\d{2}-\d{4})", # Naked date search
            ]
            for pat in dob_pats:
                m = re.search(pat, text, re.I)
                if m:
                    summary["dob"] = m.group(1).strip().replace('/', '-').replace(' ', '-')
                    break

        # 3. DATE REPORTED Extraction
        if is_bad(summary.get("date_reported"), "DD-MM-YYYY"):
            report_pats = [
                r"(?:Date Reported|Report Date|DATE)\s*[:\-]?\s*(\d{2}[-/\s]\d{2}[-/\s]\d{4})",
                r"DATE\s+AS\s+OF\s*[:\-]?\s*(\d{2}[-/\s]\d{2}[-/\s]\d{4})"
            ]
            for pat in report_pats:
                m = re.search(pat, text, re.I)
                if m:
                    summary["date_reported"] = m.group(1).strip().replace('/', '-').replace(' ', '-')
                    break

        # 4. CITY Extraction (from Address or explicit CITY tag)
        if is_bad(summary.get("city"), ""):
            # Often address looks like "..., CITY - PIN" or "City: DELHI"
            city_pats = [
                r"City\s*[:\-]?\s*([A-Z\s]{2,30})",
                r",\s*([A-Z\s]{2,30})\s*-\s*\d{6}" # Indian Pin code pattern after city
            ]
            for pat in city_pats:
                m = re.search(pat, text, re.I)
                if m:
                    val = m.group(1).strip()
                    if len(val) > 2 and not any(x in val.upper() for x in ["STATE", "PIN", "DATE", "MOBILE", "ADDRESS"]):
                        summary["city"] = val
                        break

        # 5. STATE Extraction
        if is_bad(summary.get("state"), ""):
            state_pats = [
                r"State\s*[:\-]?\s*([A-Z\s]{2,30})",
                r",\s*([A-Z\s]{2,30})\s+\d{6}" # City, State Pin pattern
            ]
            for pat in state_pats:
                m = re.search(pat, text, re.I)
                if m:
                    val = m.group(1).strip()
                    if len(val) > 2 and not any(x in val.upper() for x in ["CITY", "PIN", "DATE", "MOBILE", "ADDRESS"]):
                        summary["state"] = val
                        break

        # 4. MOBILE Extraction
        if is_bad(summary.get("mobile"), "1234567890"):
            mob_pats = [
                r"(?:Mobile Phone|Telephone|Mobile|Contact|Phone)\s*[:\-]?\s*([6-9]\d{9})",
                r"\s([6-9]\d{9})\s", # Naked 10-digit number (starting with 6-9 usually in India)
            ]
            for pat in mob_pats:
                m = re.search(pat, text, re.I)
                if m:
                    summary["mobile"] = m.group(1).strip()
                    break
        
        # 4. ADDRESS Extraction
        if is_bad(summary.get("address"), "Full Address Here"):
            addr_pats = [
                r"(?:Address 1|Mailing Address|Permanent Address)\s*[:\-]?\s*(.*?)(?=\n\n|\n[A-Z][a-z]|$|Date Of Birth|PAN|Mobile)",
            ]
            for pat in addr_pats:
                m = re.search(pat, text, re.S | re.I)
                if m:
                    addr_val = m.group(1).strip().replace('\n', ' ')
                    if len(addr_val) > 10:
                        summary["address"] = addr_val
                        break

        # Trust actual list lengths as source of truth for counts
        active_list = data.get("active_loan_details", [])
        if not isinstance(active_list, list): active_list = []
        summary["active_loans"] = len(active_list)
        
        closed_list = data.get("closed_loan_details", [])
        if not isinstance(closed_list, list): closed_list = []
        summary["closed_loans"] = len(closed_list)
            
        summary["total_loans"] = (summary.get("active_loans") or 0) + (summary.get("closed_loans") or 0)

        # Ensure all required keys exist to prevent frontend errors
        if "loan_history" not in data:
            data["loan_history"] = {"personal_loans":[], "credit_cards":[], "home_loans":[], "gold_loans":[], "overdrafts":[]}
        
        data["summary"] = summary
        # --- End Consistency ---
        
        log_to_file(f"Extraction complete for: {summary.get('name')}. Active Count: {summary.get('active_loans')}")

        # Add deterministic Risk Level and Reasons
        risk_level, risk_reasons, delinquency_details = calculate_deterministic_risk(data)
        data["risk_level"] = risk_level
        data["risk_reasons"] = risk_reasons
        data["delinquency_details"] = delinquency_details

        # --- ENQUIRY CONSISTENCY CHECK ---
        # If the summary has counts but list is empty, the frontend might show a mismatch.
        # We try to derive the total_enquiries if it's 0 but list has items.
        enq_list = data.get("enquiry_list", [])
        if not isinstance(enq_list, list): enq_list = []
        
        # Ensure total_enquiries always matches the actual list length
        summary["total_enquiries"] = len(enq_list)
        # ---------------------------------
             
        return data

    except json.JSONDecodeError as je:
        print(f"JSON Parsing Error: {je} - Output was: {result_content}")
        return {"error": "Failed to parse model output as JSON."}
    except Exception as e:
        print(f"LLM Error: {e}")
        return {"error": str(e)}

def summarize_cibil_report_vision(pdf_bytes: bytes) -> dict:
    """
    Fallback for scanned PDFs. Converts the first 3 pages of the PDF to images,
    then uses Groq's Vision model to visually read and extract the data directly.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        images_content = []
        # Process up to the first 8 pages (CIBIL summaries often span 3-6 pages)
        for i in range(min(8, len(doc))):
            page = doc[i]
            # Render page to an image
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            img_bytes = pix.tobytes("jpeg")
            img_b64 = base64.b64encode(img_bytes).decode("utf-8")
            
            images_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
            })
            
        doc.close()

        prompt_text = """
        You are a Senior Underwriting Expert. Analyze these images of a customer's scanned CIBIL credit report for internal company analysis.
        Extract the following key details. If a specific detail is not found, use "Not Available" or 0 as appropriate.
        
        Extract:
        1. CIBIL Score (integer)
        2. Customer/Contact Details (name, dob, mobile, city, state, address)
        3. Total Active & Closed Loan Counts
        4. ACTIVE LOAN DETAILS: List every open account with lender_name, loan_type, loan_amount, outstanding_balance, overdue_amount, loan_start_date.
        5. ENQUIRY LIST: List recent enquiries with lender, date, and amount.
        
        Return ONLY a valid JSON object exactly like this:
        {
          "summary": { "cibil_score": 750, "name": "", "city": "", "state": "", "active_loans": 2, "closed_loans": 1, "outstanding_amount": "₹50k" },
          "active_loan_details": [{"lender_name": "", "loan_type": "", "loan_amount": "", "outstanding_balance": "", "overdue_amount": "", "loan_start_date": ""}],
          "enquiry_list": [{"lender": "", "date": "", "amount": ""}]
        }
        """
        
        content_list = [{"type": "text", "text": prompt_text}] + images_content
        
        response = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[
                {"role": "user", "content": content_list}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=2048,
        )
        
        result_content = response.choices[0].message.content.strip()
        
        # Robust JSON Extraction for Vision
        try:
            try:
                data = json.loads(result_content)
            except:
                json_match = re.search(r"(\{.*\})", result_content, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group(1))
                else:
                    raise ValueError("No JSON block found in vision response")
        except Exception as e:
            log_to_file(f"Vision JSON Error: {e}\nContent: {result_content}")
            return {"error": "Failed to parse vision model output."}
        
        if not isinstance(data, dict):
            data = {"summary": {}, "error": "Vision model failed to return a valid dictionary"}

        # --- NORMALIZATION ---
        summary_raw = data.get("summary")
        summary = summary_raw if isinstance(summary_raw, dict) else {}
        
        # Helper to get field from either summary sub-dict or root
        def get_f(key, default=None):
            val = summary.get(key)
            if val is None and isinstance(data, dict):
                val = data.get(key)
            return val if val is not None else default

        active_extracted = data.get("active_loan_details", [])
        if not isinstance(active_extracted, list): active_extracted = []
        
        enq_extracted = data.get("enquiry_list", [])
        if not isinstance(enq_extracted, list): enq_extracted = []

        normalized_data = {
            "summary": {
                "cibil_score": safe_int(get_f("cibil_score"), 0),
                "active_loans": len(active_extracted) or safe_int(get_f("active_loans"), 0),
                "closed_loans": safe_int(get_f("closed_loans"), 0),
                "outstanding_amount": get_f("outstanding_amount", "₹0"),
                "total_enquiries": len(enq_extracted) or safe_int(get_f("total_enquiries") or get_f("recent_enquiries"), 0),
                "date_reported": get_f("date_reported", "Not Available"),
                "enquiries_30d": 0,
                "enquiries_90d": 0,
                "name": get_f("name", "Scanned Report"),
                "dob": get_f("dob", "See Image"),
                "mobile": get_f("mobile", "See Image"),
                "city": get_f("city", "Not Available"),
                "state": get_f("state", "Not Available"),
                "company": get_f("company", "Not Available"),
                "address": get_f("address", "See Image")
            },
            "active_loan_details": active_extracted,
            "enquiry_list": enq_extracted,
            "loan_history": {
                "personal_loans": [],
                "credit_cards": [],
                "home_loans": [],
                "gold_loans": [],
                "overdrafts": []
            },
            "payment_history": []
        }
        
        # Add deterministic Risk Level and Reasons
        risk_level, risk_reasons, delinquency_details = calculate_deterministic_risk(normalized_data)
        normalized_data["risk_level"] = risk_level
        normalized_data["risk_reasons"] = risk_reasons
        normalized_data["delinquency_details"] = delinquency_details
             
        return normalized_data

    except json.JSONDecodeError as je:
        print(f"JSON Parsing Error (Vision): {je} - Output was: {result_content}")
        return {"error": "Failed to parse vision model output as JSON. Note: Image may be too blurry."}
    except Exception as e:
        print(f"LLM Vision Error: {e}")
        return {"error": str(e)}

def ask_cibil_question(context: str, question: str) -> dict:
    """
    Answers a specific user question based on the provided CIBIL report text.
    """
    # Truncate context if needed to fit within token limits
    max_chars = 8000
    if len(context) > max_chars:
        context = context[:6000] + "\n... [TRUNCATED] ...\n" + context[-2000:]

    prompt = f"""
    SYSTEM: You are a professional Underwriting Assistant from "Loan At Click". 
    Your goal is to assist a company analyst in evaluating a customer's CIBIL credit report based ONLY on the provided text.

    ORGANIZATION RULES:
    - Use **Markdown Tables** to compare data, list multiple accounts, or show calculations (e.g., Table for list of loans or enquiries).
    - Use **Bold text** for key highlights like bank names, amounts (e.g., **₹2,09,944**), and dates.
    - Use **Bullet points** for short lists.
    - If the answer involves multi-step calculations, show them clearly.
    - **TOTALS**: When listing bank accounts, loans, or amounts, ALWAYS provide a final summary line showing the **Total Outstanding Balance** or **Total Loan Amount** at the end.
    - Make the output "eye-catchy" and extremely easy to read at a glance.

    CONTEXT (CIBIL REPORT TEXT):
    {context}

    USER QUESTION:
    {question}

    ANSWER:
    """

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a helpful financial assistant. Be precise."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=600,
            timeout=30,
        )
        
        answer = response.choices[0].message.content.strip()
        return {"answer": answer}
        
    except Exception as e:
        print(f"Chat Error: {e}")
        return {"error": str(e)}
