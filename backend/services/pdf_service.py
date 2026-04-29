import httpx
import os
import asyncio
import io
import re
import pdfplumber
import fitz  # PyMuPDF


# ─────────────────────────────────────────────────────────────
# STEP 1: Local PDF Standardizer & Extraction
# ─────────────────────────────────────────────────────────────

def _detect_pdf_type(raw_text: str) -> str:
    """
    Detect which kind of CIBIL PDF we're dealing with.
    Returns: 'quadruplication' | 'web_printed' | 'native'
    """
    sample = raw_text[:2000]

    # Count runs of 4 identical chars (e.g. CCCC IIII BBBB IIII LLLL)
    # Common in some CIBIL dashboard PDFs where font characters are stacked
    quad_matches = len(re.findall(r'(.)\1{3}', sample))
    if quad_matches > 15:
        return "quadruplication"

    # Check for browser print header artifacts
    if "myscore.cibil.com" in sample or "Score Report | Cibil Dashboard" in sample or "https://" in sample:
        return "web_printed"

    return "native"


def _fix_quadruplication(text: str) -> str:
    """Fix fonts that render each character 4x: CCCC→C, 1111→1"""
    return re.sub(r'(.)\1{3}', r'\1', text)


def _fix_web_printed(text: str) -> str:
    """Remove browser print artifacts: URLs, timestamps, page-number lines"""
    # Remove URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove Timestamps (e.g. 12/05/2023, 11:30 AM)
    text = re.sub(r'\d{1,2}/\d{1,2}/\d{2,4},?\s+\d{1,2}:\d{2}\s*[AP]M', '', text)
    # Remove Header titles
    text = re.sub(r'Score Report\s*\|\s*Cibil Dashboard', '', text, flags=re.I)
    # Remove standalone page numbers
    text = re.sub(r'^\s*\d+/\d+\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    return text


def _common_cleanup(text: str) -> str:
    """Normalise whitespace — applied after all type-specific fixes"""
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = '\n'.join(line.rstrip() for line in text.splitlines())
    return text.strip()


def _extract_with_pdfplumber(pdf_bytes: bytes) -> str:
    """
    Extract and standardize text using pdfplumber with table-layout awareness.
    """
    try:
        pages_text = []
        found_accounts = False
        found_enquiries = False
        
        account_keywords = ["ACCOUNT INFORMATION", "ACCOUNT SUMMARY", "ACCOUNTS", "TRADE LINES", "TRADE LINE"]
        enquiry_keywords = ["ENQUIRY INFORMATION", "ENQUIRIES", "CREDIT ENQUIRIES", "RECENT ENQUIRIES"]

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                # layout=True is essential for maintaining columns in account tables
                text = page.extract_text(layout=True) or ""
                
                if not text.strip():
                    continue

                # Auto-detect and fix the PDF type per page (in case of mixed types)
                pdf_type = _detect_pdf_type(text)
                
                if pdf_type == "quadruplication":
                    text = _fix_quadruplication(text)
                    text = _fix_web_printed(text)
                elif pdf_type == "web_printed":
                    text = _fix_web_printed(text)
                
                text = _common_cleanup(text)
                
                header = f"--- Page {i + 1} ---"
                # Insert markers for the LLM chunking service
                if not found_accounts and i > 0 and any(k in text.upper() for k in account_keywords):
                    header = f"[[ACCOUNT_SECTION_START]]\n{header}"
                    found_accounts = True
                
                if not found_enquiries and i > 5 and any(k in text.upper() for k in enquiry_keywords):
                    header = f"[[ACCOUNT_SECTION_END]]\n{header}"
                    found_enquiries = True
                    
                pages_text.append(f"{header}\n{text}")

        return "\n\n".join(pages_text)

    except Exception as e:
        print(f"DEBUG: pdfplumber extraction failed: {e}")
        return ""


# ─────────────────────────────────────────────────────────────
# STEP 2: PyMuPDF fallback
# ─────────────────────────────────────────────────────────────

def _extract_with_pymupdf(pdf_bytes: bytes) -> str:
    """
    Fallback extractor using PyMuPDF (fitz).
    Also applies the same standardization fixes.
    """
    try:
        pages_text = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for i, page in enumerate(doc):
            text = page.get_text()
            if not text.strip():
                continue
                
            pdf_type = _detect_pdf_type(text)
            if pdf_type == "quadruplication":
                text = _fix_quadruplication(text)
                text = _fix_web_printed(text)
            elif pdf_type == "web_printed":
                text = _fix_web_printed(text)
            
            text = _common_cleanup(text)
            pages_text.append(f"--- Page {i + 1} ---\n{text}")
        doc.close()

        return "\n\n".join(pages_text)

    except Exception as e:
        print(f"DEBUG: PyMuPDF extraction failed: {e}")
        return ""


# ─────────────────────────────────────────────────────────────
# STEP 3: LlamaParse cloud fallback (scanned / image PDFs only)
# ─────────────────────────────────────────────────────────────

async def _extract_with_llamaparse(pdf_bytes: bytes) -> str:
    """
    Cloud OCR via LlamaParse REST API.
    Used only when local extraction returns < 20 chars.
    Using direct httpx instead of library to avoid Pydantic conflicts.
    """
    api_key = os.getenv("LLAMA_CLOUD_API_KEY")
    if not api_key:
        print("ERROR: LLAMA_CLOUD_API_KEY not found — cannot use LlamaParse")
        return ""

    base_url = "https://api.cloud.llamaindex.ai/api/v1"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            print("DEBUG: Uploading PDF to LlamaParse API...")
            files = {"file": ("report.pdf", pdf_bytes, "application/pdf")}
            payload = {"result_type": "markdown"}

            response = await client.post(
                f"{base_url}/parsing/upload", headers=headers, files=files, data=payload
            )

            if response.status_code != 200:
                print(f"LlamaParse Upload Failed ({response.status_code}): {response.text}")
                return ""

            job_id = response.json().get("id")
            if not job_id: return ""

            print(f"DEBUG: LlamaParse job started (ID: {job_id}). Polling...")
            for i in range(90):  # 3-minute timeout
                await asyncio.sleep(2)
                status_resp = await client.get(f"{base_url}/parsing/job/{job_id}", headers=headers)
                if status_resp.status_code != 200: continue

                job_data = status_resp.json()
                status = job_data.get("status")

                if status == "SUCCESS":
                    print("DEBUG: LlamaParse job SUCCESS.")
                    break
                elif status in ["FAILED", "CANCELLED"]:
                    print(f"LlamaParse job {status}")
                    return ""
            else:
                return ""

            result_resp = await client.get(
                f"{base_url}/parsing/job/{job_id}/result/markdown", headers=headers
            )
            if result_resp.status_code != 200: return ""

            data = result_resp.json()
            return data.get("markdown") or data.get("text", "")

    except Exception as e:
        print(f"Critical error in LlamaParse REST call: {e}")
        return ""


# ─────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────

async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Main extraction pipeline. Tries local methods first, falls back to cloud.
    """

    # 1. Try pdfplumber (Best for layouts)
    print("DEBUG: Trying pdfplumber extraction...")
    text = _extract_with_pdfplumber(pdf_bytes)

    if text and len(text.strip()) >= 50:
        print(f"DEBUG: pdfplumber succeeded. Chars: {len(text)}")
        _save_debug(text)
        return text

    # 2. Try PyMuPDF (Reliable fallback)
    print("DEBUG: pdfplumber insufficient. Trying PyMuPDF...")
    text = _extract_with_pymupdf(pdf_bytes)

    if text and len(text.strip()) >= 50:
        print(f"DEBUG: PyMuPDF succeeded. Chars: {len(text)}")
        _save_debug(text)
        return text

    # 3. Try LlamaParse Cloud (For scanned PDFs)
    print("DEBUG: Local methods failed. Trying LlamaParse cloud OCR...")
    text = await _extract_with_llamaparse(pdf_bytes)

    if text and len(text.strip()) >= 50:
        print(f"DEBUG: LlamaParse succeeded. Chars: {len(text)}")
        _save_debug(text)
        return text

    return ""


def _save_debug(text: str):
    """Save extracted text snapshot for debugging."""
    try:
        debug_path = os.path.join(
            os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt"
        )
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(text[:50000])
    except Exception:
        pass
