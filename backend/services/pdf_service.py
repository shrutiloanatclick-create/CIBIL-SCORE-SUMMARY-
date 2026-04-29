import os
import re
import io

async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Optimized PDF text extraction using pdfplumber with cleaning regex.
    This preserves table layout (layout=True) and removes browser artifacts
    that often confuse LLM parsing.
    """
    try:
        import pdfplumber
        
        full_text = ""
        print(f"DEBUG: Starting pdfplumber extraction ({len(pdf_bytes)} bytes)...")
        
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages_text = []
            found_accounts = False
            found_enquiries = False
            
            # Keywords to detect significant sections
            account_keywords = ["ACCOUNT INFORMATION", "ACCOUNT SUMMARY", "ACCOUNTS", "TRADE LINES", "TRADE LINE"]
            enquiry_keywords = ["ENQUIRY INFORMATION", "ENQUIRIES", "CREDIT ENQUIRIES", "RECENT ENQUIRIES"]
            
            for i, page in enumerate(pdf.pages):
                # extract_text(layout=True) is great for maintaining table structure
                text = page.extract_text(layout=True) or ""
                
                # --- CLEANING (Claude's suggested solution + improvements) ---
                # 1. Remove URLs (browser print footers)
                text = re.sub(r'https?://\S+', '', text)
                # 2. Remove Timestamps (browser print headers) - e.g. 12/05/2023, 11:30 AM
                text = re.sub(r'\d{1,2}/\d{1,2}/\d{2,4},\s+\d{1,2}:\d{2}\s+[AP]M', '', text)
                # 3. Remove Title Artifacts
                text = re.sub(r'Score Report\s*\|\s*Cibil Dashboard', '', text, flags=re.I)
                # 4. Remove Page Numbers (at end of lines)
                text = re.sub(r'\d+/\d+\s*$', '', text, flags=re.MULTILINE)
                
                if text.strip():
                    header = f"--- Page {i + 1} ---"
                    
                    # Logic to help the LLM identify the start of the account list
                    if not found_accounts and i > 0 and any(k in text.upper() for k in account_keywords):
                        header = f"[[ACCOUNT_SECTION_START]]\n{header}"
                        found_accounts = True
                    
                    if not found_enquiries and i > 5 and any(k in text.upper() for k in enquiry_keywords):
                        header = f"[[ACCOUNT_SECTION_END]]\n{header}"
                        found_enquiries = True
                        
                    pages_text.append(f"{header}\n{text}")
            
            full_text = "\n\n".join(pages_text)
            
        if len(full_text.strip()) < 200:
             print("DEBUG: pdfplumber returned insufficient text. Trying PyMuPDF...")
             return _extract_with_pymupdf(pdf_bytes)
             
        print(f"DEBUG: pdfplumber extraction successful. Chars: {len(full_text)}")
        return full_text

    except Exception as e:
        print(f"ERROR: pdfplumber failed: {e}. Falling back to PyMuPDF...")
        return _extract_with_pymupdf(pdf_bytes)


def _extract_with_pymupdf(pdf_bytes: bytes) -> str:
    """
    Local PDF text extraction using PyMuPDF (fitz) as a fast/reliable fallback.
    """
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_text = []
        for page_num, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                pages_text.append(f"--- Page {page_num + 1} ---\n{text}")
        doc.close()
        return "\n\n".join(pages_text)
    except Exception as e:
        print(f"ERROR: PyMuPDF extraction failed: {e}")
        return ""
