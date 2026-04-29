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
        # Use an absolute workspace-relative path to ensure it's found
        log_path = r"c:\Users\dell\Downloads\CIBIL-SUMMARY-\CIBIL-SUMMARY-\backend_audit.log"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{os.getpid()}] {msg}\n")
    except Exception as e:
        # If writing to the main log fails, try a very simple local file
        try:
            with open("simple_audit.log", "a") as f2:
                f2.write(f"{str(e)}\n")
        except:
            pass
        # Print to stderr if log writing fails so it shows up in terminal logs
        import sys
        print(f"DEBUG: log_to_file failed: {e}", file=sys.stderr)

def safe_int(val, default=0):
    """Safely convert a value to an integer, handling None, empty strings, and formatted numbers."""
    if val is None:
        return default
    
    if isinstance(val, (int, float)):
        return int(val)

    s_val = str(val).strip().upper()
    if s_val in ["NIL", "NA", "ZERO", "NONE", "", "*"]:
        return 0
    
    try:
        # More robust numeric extraction: keep only digits and decimal points
        cleaned = re.sub(r'[^\d.]', '', s_val)
        if not cleaned:
            return default
        # Use round() to match frontend Math.round() logic
        return int(round(float(cleaned)))
    except (ValueError, TypeError):
        return default

def parse_date(date_str):
    """Helper to parse various Indian date formats (DD-MM-YYYY, DD/MM/YYYY, DD MMM YYYY)."""
    if not date_str or not isinstance(date_str, str): return None
    import datetime
    
    # Normalize
    clean = date_str.strip().upper().replace('/', '-').replace(' ', '-')
    
    # Month mapping for alpha months
    months = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
        'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12',
        'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04', 'JUNE': '06',
        'JULY': '07', 'AUGUST': '08', 'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
    }
    
    try:
        parts = [p for p in clean.split('-') if p]
        if len(parts) == 3:
            d, m, y = parts[0], parts[1], parts[2]
            
            # Handle alpha month
            if m in months:
                m = months[m]
            
            if len(y) == 2: 
                y = "20" + y # Fix 23 -> 2023
            
            return datetime.datetime(int(y), int(m), int(d))
    except:
        pass
    return None

def calculate_enquiry_counts(enq_list, report_date_str):
    """Calculates 30d and 90d enquiry buckets based on the report date."""
    import datetime
    count_30 = 0
    count_90 = 0
    
    report_date = parse_date(report_date_str) or datetime.datetime.now()
    
    for enq in enq_list:
        if not isinstance(enq, dict): continue
        dt = parse_date(enq.get("date"))
        if dt:
            # Calculate days difference, ensuring we don't count future dates as "recent" unless they are near
            delta = (report_date - dt).days
            if 0 <= delta <= 30: count_30 += 1
            if 0 <= delta <= 90: count_90 += 1
            
    return count_30, count_90

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

def extract_loans_from_chunk(chunk_text: str) -> dict:
    """Helper to extract active and closed loans from a specific text chunk."""
    prompt = f"""
    SYSTEM: Financial data extractor for CIBIL/EXPERIAN reports. 
    Extract EVERY loan/account found in the text fragment below. 
    
    - account_no: Full string if available.
    
    EXPERIAN COLUMN IDENTIFICATION:
    - "Sanctioned Amount" or "High Credit" -> 'loan_amount'
    - "Current Balance" or "Net Balance" -> 'outstanding_balance' (THIS IS THE PRIMARY OBLIGATION)
    - "Monthly Payment" or "Installment Amt" -> 'emi'
    - "Amount Overdue" -> 'overdue_amount'
    - "Date Opened" -> 'loan_start_date'
    - "Account Number" -> 'account_no'
    
    CRITICAL RULES:
    1. Extract EVERY SINGLE LOAN. If there are 3 similar loans from the same bank, extract ALL THREE as separate entries. DO NOT CONSOLIDATE.
    2. ZERO OMISSION: If the text shows 10 loans, your JSON must have 10 loans.
    3. BALANCE GUARD: Always use 'Current Balance' for 'outstanding_balance'. NEVER use 'Sanctioned Amount' for outstanding balance.
    4. DATA FIDELITY: Preserve the full Lender Name and Account Number string. 
    
    OUTPUT: A JSON object with "active_loan_details" and "closed_loan_details" arrays.
    SCHEMA: {{
      "active_loan_details": [
        {{ "lender_name": "", "account_no": "", "loan_type": "", "loan_amount": "", "outstanding_balance": "", "overdue_amount": "", "emi": "", "loan_start_date": "", "payment_history": "" }}
      ],
      "closed_loan_details": [
        {{ "lender_name": "", "account_no": "", "loan_type": "", "loan_amount": "", "loan_start_date": "", "date_closed": "" }}
      ]
    }}
    
    TEXT FRAGMENT:
    \"\"\"{chunk_text}\"\"\"
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=8000 
        )
        result_content = response.choices[0].message.content.strip()
        
        try:
            return json.loads(result_content)
        except Exception as je:
            log_to_file(f"Truncated/Mangled JSON in chunk. Attempting Recovery... Error: {je}")
            # PARTIAL RECOVERY: Extract objects using regex if JSON is truncated
            recovered_active = []
            recovered_closed = []
            
            # Find all objects that look like active/closed loan records
            # We look for common keys to identify loan objects
            loan_objects = re.findall(r'\{[^{}]*?"lender_name"[^{}]*?\}', result_content, re.S)
            for obj_str in loan_objects:
                try:
                    if not obj_str.endswith('}'): obj_str += '}'
                    loan = json.loads(obj_str)
                    if loan.get("lender_name"):
                        # Logic to sort into active/closed if truncated
                        if loan.get("date_closed") or "closed" in str(loan).lower():
                            recovered_closed.append(loan)
                        else:
                            recovered_active.append(loan)
                except: continue
            
            if recovered_active or recovered_closed:
                log_to_file(f"RECOVERED {len(recovered_active)} active and {len(recovered_closed)} closed loans via Regex.")
                return {"active_loan_details": recovered_active, "closed_loan_details": recovered_closed}
            raise je

    except Exception as e:
        log_to_file(f"Chunk extraction failed completely: {e}")
        return {"active_loan_details": [], "closed_loan_details": []}

def summarize_cibil_report(text: str) -> dict:
    """
    Send text to Groq Llama 3 for extraction.
    For large reports, we process the account information section in chunks to avoid truncation.
    """
    original_text = text # Keep for regex fallbacks
    
    # 1. Identify Account section start (if markers exist)
    custom_start = text.find("[[ACCOUNT_SECTION_START]]")
    custom_end = text.find("[[ACCOUNT_SECTION_END]]")
    
    # 2. Chunking Logic for Large Reports
    all_active_loans = []
    all_closed_loans = []
    
    # If the report is large (>80k chars) or markers are present, chunk it.
    if len(text) > 80000 or custom_start != -1:
        log_to_file(f"Large report ({len(text)} chars). Starting full-stream chunked extraction.")
        
        # Focus on the account section if markers were found, otherwise use full text
        account_block = text[custom_start:] if custom_start != -1 else text
        
        # 40k chunks with 20k overlap to ensure no loan is split across chunks
        chunk_size = 40000
        overlap = 20000
        
        chunks = []
        for start in range(0, len(account_block), chunk_size - overlap):
            chunks.append(account_block[start:start + chunk_size])
        
        log_to_file(f"Parallelizing {len(chunks)} chunks covering the entire report...")
        
        from concurrent.futures import ThreadPoolExecutor
        import time
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=min(len(chunks), 10)) as executor:
            chunk_results = list(executor.map(extract_loans_from_chunk, chunks))
        
        end_time = time.time()
        log_to_file(f"Parallel chunk extraction complete in {end_time - start_time:.2f} seconds.")
        
        # Robust ID: Mask-resilient and Normalization-aware
        def get_loan_id(loan):
            if not isinstance(loan, dict): return "invalid"
            # NORMALIZE LENDER: Remove spaces, non-alphanumeric, and common noise
            lender_raw = str(loan.get('lender_name', '')).strip().upper()
            lender = re.sub(r'[^A-Z0-9]', '', lender_raw).replace('BANK', '').replace('NBFC', '')
            
            # Use only last 4 digits of account to handle varying mask patterns
            acc_raw = str(loan.get('account_no', '')).strip()
            acc_suffix = acc_raw[-4:] if len(acc_raw) >= 4 else acc_raw
            
            # NORMALIZE DATE: Key for deduplication across chunks
            date_raw = str(loan.get('loan_start_date', '')).strip()
            parsed_date = parse_date(date_raw)
            date_key = parsed_date.strftime('%Y%m') if parsed_date else date_raw.upper()
            
            lid = f"{lender}-{acc_suffix}-"
            lid += f"{safe_int(loan.get('loan_amount', 0))}-"
            lid += f"{safe_int(loan.get('outstanding_balance', 0))}-"
            lid += f"{date_key}"
            return lid

        # Merge results from all chunks
        for result in chunk_results:
            batch_active = result.get("active_loan_details", [])
            batch_closed = result.get("closed_loan_details", [])
            
            if not isinstance(batch_active, list): batch_active = []
            if not isinstance(batch_closed, list): batch_closed = []
            
            all_active_loans.extend(batch_active)
            all_closed_loans.extend(batch_closed)

        # Unified Deduplication
        seen_ids = set()
        unique_active = []
        unique_closed = []
        
        # First pass for active
        for l in all_active_loans:
            lid = get_loan_id(l)
            if lid not in seen_ids:
                # Double-check status (sometimes Model mis-categorizes)
                if not (l.get("date_closed") or "closed" in str(l).lower() or "settled" in str(l).lower()):
                    unique_active.append(l)
                    seen_ids.add(lid)
                else:
                    all_closed_loans.append(l) # Move to potentially closed if mis-categorized
        
        # Second pass for closed
        seen_closed_ids = set()
        for l in all_closed_loans:
            lid = get_loan_id(l)
            if lid not in seen_closed_ids:
                unique_closed.append(l)
                seen_closed_ids.add(lid)

        all_active_loans = unique_active
        all_closed_loans = unique_closed
        
        log_to_file(f"Final Deduplicated Counts -> Active: {len(all_active_loans)}, Closed: {len(all_closed_loans)}")

    # 2. Main Prompt for Summary Data (Using first 100k + tail 50k)
    # This captures Personal Info/Score (Head) and Enquiries (Tail) perfectly.
    head = text[:100000]
    tail = text[-50000:] if len(text) > 150000 else ""
    
    truncated_text = head + "\n... [MIDDLE CONTENT OMITTED] ...\n" + tail
    
    prompt = f"""
    SYSTEM: Financial data extractor for Indian CIBIL and EXPERIAN reports. Extract data with zero hallucination. Numeric fields must be pure numbers.
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
       - payment_history: summary string (e.g. "Last 24 months all OK")
    
    IMPORTANT: If there are many accounts (>50), prioritize ALL active ones and provide only the most recent Closed ones if needed to stay within JSON limits.
    
    Ensure all JSON is valid and terminates correctly.

    4. CLOSED LOANS (closed_loan_details): Extract every closed/settled account.
       - Use same structure as active loans.
       - Add field: "date_closed": "DD-MM-YYYY" or "MM-YYYY".

    5. REQUIRED JSON STRUCTURE:
    {{
        "summary": {{ 
            "name": "", "dob": "", "date_reported": "", "mobile": "", "city": "", "state": "", "company": null, "address": "",
            "cibil_score": 0, "active_loans": 0, "closed_loans": 0, "total_loans": 0,
            "outstanding_amount": "Total outstanding. Search for 'Total Current Bal. amt', 'Total Current Balance', or 'Account Summary' / 'SUMMARY OF ACCOUNTS' table. Do not return ₹0 if a total is present.", 
            "enquiries_30d": 0, "enquiries_90d": 0, "total_enquiries": 0 
        }},
        "active_loan_details": [{{ ...above fields... }}],
        "closed_loan_details": [{{ ...above fields... }}],
        "enquiry_list": [{{ "lender": "", "date": "", "purpose": "", "amount": "" }}],
        "loan_history": {{ "personal_loans": [], "credit_cards": [], "home_loans": [], "gold_loans": [], "overdrafts": [] }},
        "payment_history": [{{ "lender": "", "month_year": "", "status": "" }}]
    }}

    CRITICAL:
    - has_late_payments: true if any DPD (Days Past Due) > 0 is found in payment_history or account status.
    - enquiry_list must contain EVERY enquiry found in the "ENQUIRY INFORMATION" section.
    - account_no: Extract full account number/string if available.
    - Extract ALL loan records found, even if they seem redundant.
    - If a field is missing, use null (for strings) or 0 (for numbers). Do not hallucinate.
    - For payment_history status: Use "STD" for Standard, "000" for 0 DPD, or the actual DPD number (e.g., "030", "060", "090").

    REPORT TEXT:
    """ + truncated_text + "\n"

    try:
        log_to_file(f"Starting Groq call. Text length: {len(text)}")
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that strictly outputs JSON. Your output must be a single valid JSON object following the requested schema."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=8000, # Further increased for massive reports (100+ loans)
            timeout=180, # Increased for huge input and 70b model
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
            # If truncated JSON, try to fix it by closing braces
            if "Unterminated string" in str(je) or "Expecting value" in str(je):
                log_to_file("Attempting to fix truncated JSON...")
                try:
                    # Very simple recovery: try to find the last complete object in the list if possible
                    # but for now, we'll just raise a clearer error
                    pass
                except:
                    pass
            log_to_file(f"OFFENDING CONTENT START >>>\n{result_content[:1000]}... [TRUNCATED] ...{result_content[-1000:]}\n<<< OFFENDING CONTENT END")
            raise je
        
        if not isinstance(data, dict):
            # Fallback for LLMs returning lists or other types
            data = {"summary": {}, "error": "Model failed to return a valid dictionary"}

        # --- MERGE CHUNKED LOANS ---
        def get_loan_id(loan):
            if not isinstance(loan, dict): return "invalid"
            lid = f"{str(loan.get('lender_name', '')).strip().upper()}-"
            lid += f"{str(loan.get('account_no', '')).strip().upper()}-"
            lid += f"{safe_int(loan.get('loan_amount', 0))}-"
            lid += f"{safe_int(loan.get('outstanding_balance', 0))}-"
            lid += f"{str(loan.get('loan_start_date', '')).strip()}"
            return lid

        existing_active_ids = {get_loan_id(l) for l in all_active_loans}
        main_active = data.get("active_loan_details", [])
        if not isinstance(main_active, list): main_active = []
        for l in main_active:
            if get_loan_id(l) not in existing_active_ids:
                all_active_loans.append(l)
                existing_active_ids.add(get_loan_id(l))
        data["active_loan_details"] = all_active_loans

        existing_closed_ids = {get_loan_id(l) for l in all_closed_loans}
        main_closed = data.get("closed_loan_details", [])
        if not isinstance(main_closed, list): main_closed = []
        for l in main_closed:
            if get_loan_id(l) not in existing_closed_ids:
                all_closed_loans.append(l)
                existing_closed_ids.add(get_loan_id(l))
        data["closed_loan_details"] = all_closed_loans

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
                r"(?:Name|Consumer Name|Applicant Name|CONSUMER INFORMATION|APPLICANT)\s*[:\-]?\s*([A-Z\.\s]{3,60})",
                r"Name\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", # Mixed case fallback
                r"NAME:\s*([A-Z\s]+)",
            ]
            for pat in name_pats:
                m = re.search(pat, text, re.I)
                if m:
                    val = m.group(1).split('\n')[0].strip()
                    # Filter out noise like "REPORT" or "DATE"
                    if len(val) > 3 and not any(x in val.upper() for x in ["REPORT", "CIBIL", "DATE", "SCORE", "CONTROL"]):
                        summary["name"] = val
                        break
        
        # 2. DOB Extraction
        if is_bad(summary.get("dob"), "DD-MM-YYYY"):
            dob_pats = [
                r"(?:Date Of Birth|DOB|Birth Date|Birthdate)\s*[:\-]?\s*(\d{2}[-/\s]\d{2}[-/\s]\d{4})",
                r"(\d{2}-\d{2}-\d{4})", # Naked date search
                r"DOB:\s*(\d{2}-\d{2}-\d{4})",
            ]
            for pat in dob_pats:
                m = re.search(pat, text, re.I)
                if m:
                    summary["dob"] = m.group(1).strip().replace('/', '-').replace(' ', '-')
                    break
        
        # 2.5 SCORE Extraction Fallback
        if is_bad(summary.get("cibil_score"), 0) or int(summary.get("cibil_score") or 0) < 300:
            score_pats = [
                r"Your CIBIL Score is\s*(\d{3})",
                r"(?:CIBIL|EXPERIAN|Credit)\s*Score\s*[:\-]?\s*(\d{3})",
                r"Score\s*[:\-]?\s*(\d{3})",
                r"Score[:\s]+(\d{3})\s",
                r"(\d{3})\s*/\s*900",
            ]
            for pat in score_pats:
                m = re.search(pat, text, re.I)
                if m:
                    summary["cibil_score"] = int(m.group(1))
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
                    val = m.group(1).split('\n')[0].strip()
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

        # --- 2. ENQUIRY BUCKETING & COUNT RECONCILIATION ---
        enq_list = data.get("enquiry_list", [])
        if not isinstance(enq_list, list): enq_list = []
        
        # Determine buckets deterministically
        c30, c90 = calculate_enquiry_counts(enq_list, summary.get("date_reported"))
        summary["enquiries_30d"] = c30
        summary["enquiries_90d"] = c90
        summary["total_enquiries"] = len(enq_list)

        # Trust actual list lengths as source of truth for counts
        active_list = data.get("active_loan_details", [])
        if not isinstance(active_list, list): active_list = []
        
        # FINAL GLOBAL DEDUPLICATION (Fuzzy/Multi-Key)
        # Sometimes even with good IDs, minor variations slip through.
        # We merge loans with identical amount/balance/date and very similar lender names.
        def get_fuzzy_key(loan):
            amt = safe_int(loan.get("loan_amount"))
            bal = safe_int(loan.get("outstanding_balance"))
            dt = str(loan.get("loan_start_date") or "").strip()[:7] # Just YYYY-MM or MM-YYYY
            lender = re.sub(r'[^A-Z0-9]', '', str(loan.get("lender_name") or "").upper())
            # Use last 4 of lender to handle "HDFC BANK" vs "HDFC"
            l_suffix = lender[-4:] if len(lender) >= 4 else lender
            return f"{l_suffix}-{amt}-{bal}-{dt}"

        final_active = []
        active_keys = set()
        for l in active_list:
            fk = get_fuzzy_key(l)
            if fk not in active_keys:
                final_active.append(l)
                active_keys.add(fk)
        
        data["active_loan_details"] = final_active
        summary["active_loans"] = len(final_active)
        
        closed_list = data.get("closed_loan_details", [])
        if not isinstance(closed_list, list): closed_list = []
        final_closed = []
        closed_keys = set()
        for l in closed_list:
            fk = get_fuzzy_key(l)
            if fk not in closed_keys:
                final_closed.append(l)
                closed_keys.add(fk)
        
        data["closed_loan_details"] = final_closed
        summary["closed_loans"] = len(final_closed)
            
        summary["total_loans"] = summary["active_loans"] + summary["closed_loans"]

        # Debug Logging for Large Reports
        try:
            abs_workspace_root = r"c:\Users\dell\Downloads\CIBIL-SUMMARY-\CIBIL-SUMMARY-"
            debug_log_path = os.path.join(abs_workspace_root, "backend", "debug_last_extraction.txt")
            with open(debug_log_path, "w", encoding="utf-8") as f:
                f.write(text[:10000])
        except Exception as de:
            log_to_file(f"Debug log write failed: {de}")

        # --- DETERMINISTIC RECONCILIATION ---
        total_balance = 0
        active_list = data.get("active_loan_details") or []
        for loan in active_list:
            if isinstance(loan, dict):
                # STRICT: Only sum the actual outstanding balance. 
                # Do NOT fallback to sanctioned amount or others to avoid 'wrong amount' errors.
                bal_str = loan.get("outstanding_balance") or "0"
                bal = safe_int(bal_str)
                total_balance += bal
        
        current_summary_val = safe_int(summary.get("outstanding_amount"))
        if total_balance > 0:
            # We MUST match the itemized sum exactly to avoid visual mismatches on the dashboard
            summary["outstanding_amount"] = f"₹{total_balance:,}"
        
        # --- 3. RISK ASSESSMENT ---
        risk_level, risk_reasons, delinquency_details = calculate_deterministic_risk(data)
        data["risk_level"] = risk_level
        data["risk_reasons"] = risk_reasons
        data["delinquency_details"] = delinquency_details

        if "loan_history" not in data:
            data["loan_history"] = {"personal_loans":[], "credit_cards":[], "home_loans":[], "gold_loans":[], "overdrafts":[]}
        
        data["summary"] = summary
        log_to_file(f"Extraction complete for: {summary.get('name')}. Exposure: {summary.get('outstanding_amount')}")
        return data

    except json.JSONDecodeError as je:
        print(f"JSON Parsing Error: {je}")
        return {"error": f"Failed to parse model output as JSON: {str(je)}"}
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
            except Exception as e:
                log_to_file(f"Standard JSON parse failed for vision response: {e}. Attempting Partial Recovery...")
                json_match = re.search(r"(\{.*\})", result_content, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group(1))
                else:
                    # If no full JSON block, try to recover individual loan objects
                    recovered_active = []
                    recovered_enquiries = []
                    
                    # Find all objects that look like loan records
                    loan_objects = re.findall(r'\{[^{}]*?"lender_name"[^{}]*?\}', result_content, re.S)
                    for obj_str in loan_objects:
                        try:
                            if not obj_str.endswith('}'): obj_str += '}'
                            loan = json.loads(obj_str)
                            if loan.get("lender_name"):
                                recovered_active.append(loan)
                        except: continue
                    
                    # Find all objects that look like enquiry records
                    enquiry_objects = re.findall(r'\{[^{}]*?"lender"[^{}]*?\}', result_content, re.S)
                    for obj_str in enquiry_objects:
                        try:
                            if not obj_str.endswith('}'): obj_str += '}'
                            enquiry = json.loads(obj_str)
                            if enquiry.get("lender"):
                                recovered_enquiries.append(enquiry)
                        except: continue

                    if recovered_active or recovered_enquiries:
                        log_to_file(f"RECOVERED {len(recovered_active)} active loans and {len(recovered_enquiries)} enquiries from truncated vision response.")
                        data = {
                            "active_loan_details": recovered_active,
                            "enquiry_list": recovered_enquiries,
                            "summary": {} # Initialize summary, will be filled by normalization
                        }
                    else:
                        raise ValueError("No JSON block or recoverable objects found in vision response")
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
                "enquiries_30d": calculate_enquiry_counts(enq_extracted, get_f("date_reported"))[0],
                "enquiries_90d": calculate_enquiry_counts(enq_extracted, get_f("date_reported"))[1],
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
