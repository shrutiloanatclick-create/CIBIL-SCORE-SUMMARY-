import fitz  # PyMuPDF
import pdfplumber
import io
import re
import os

def clean_text(text: str) -> str:
    """Preprocess extracted text: keep structure by preserving leading indentation."""
    text = text.replace('\t', '    ')
    lines = [line.rstrip() for line in text.split('\n')]
    return '\n'.join(lines)

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text surgically: PyMuPDF for speed/discovery, pdfplumber for high-precision account tables."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if doc.is_encrypted:
            doc.close()
            raise ValueError("The PDF is password protected. Please provide a decrypted version.")
            
        total_pages = len(doc)
        print(f"DEBUG: fitz opened PDF with {total_pages} pages")
        
        # 1. Page Discovery: Find where the massive Account section is
        account_start_pg = -1
        enquiry_start_pg = -1
        
        for i in range(total_pages):
            p_text = doc[i].get_text().upper()
            account_markers = ["ACCOUNT DETAILS", "TRADE LINE", "ACCOUNT INFORMATION", "DETAILS OF ACCOUNTS", "TRADELINE", "ACCOUNT SUMMARY", "CREDIT FACILITIES"]
            if account_start_pg == -1 and any(m in p_text for m in account_markers):
                account_start_pg = i
            enquiry_markers = ["ENQUIRY INFORMATION", "ENQUIRIES", "CREDIT ENQUIRIES", "ENQUIRY DETAILS", "ENQUIRY SUMMARY"]
            if enquiry_start_pg == -1 and any(m in p_text for m in enquiry_markers):
                enquiry_start_pg = i
        
        print(f"DEBUG: Discovery Result -> Account Start: Pg {account_start_pg + 1}, Enquiry Start: Pg {enquiry_start_pg + 1}")
        
        # 2. Extract Header (from start up to account_start_pg) with fitz (fast)
        head_text = ""
        header_end = account_start_pg if account_start_pg != -1 else min(total_pages, 5)
        for i in range(header_end):
            head_text += doc[i].get_text() + "\n"
            
        # 3. Extract Detailed Account Section with pdfplumber (precise layout)
        account_block_text = ""
        end_pg = total_pages
        if account_start_pg != -1:
            # We take from account_start up to the end (or enquiry if it's after)
            end_pg = enquiry_start_pg if (enquiry_start_pg > account_start_pg) else total_pages
            
            print(f"DEBUG: Precisely extracting pages {account_start_pg + 1} to {end_pg} for accounts...")
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for pg_idx in range(account_start_pg, end_pg):
                    if pg_idx >= len(pdf.pages): break
                    pg = pdf.pages[pg_idx]
                    # Extract with layout=True for columnar alignment
                    account_block_text += pg.extract_text(layout=True) or ""
                    account_block_text += "\n--- PAGE BREAK ---\n"
        else:
            print("DEBUG: No account marker found, using fast fitz fallback for all pages.")
            for i in range(total_pages):
                account_block_text += doc[i].get_text() + "\n"
            end_pg = total_pages

        # 4. Extract Everything Else (Enquiries, Remainder) from end_pg onwards
        remainder_text = ""
        if end_pg < total_pages:
            print(f"DEBUG: Extracting remaining pages {end_pg + 1} to {total_pages} with fitz...")
            for i in range(end_pg, total_pages):
                remainder_text += doc[i].get_text() + "\n"

        doc.close()
        
        # Assemble full text
        full_text = head_text + "\n[[ACCOUNT_SECTION_START]]\n" + account_block_text + "\n[[ACCOUNT_SECTION_END]]\n" + remainder_text
        
        # Validation
        if len(full_text.strip()) < 100:
            return "ERROR: EMPTY_EXTRACTION"

        final_text = clean_text(full_text)
        
        # Log a large sample for debugging
        try:
            debug_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt")
            with open(debug_path, "w", encoding="utf-8") as f:
                f.write(final_text[:50000] + "\n... [TRUNCATED] ...\n")
        except: pass
        
        return final_text

    except Exception as e:
        print(f"Error in extract_text_from_pdf: {e}")
        return ""
