import os

async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Direct, high-performance PDF text extraction using PyMuPDF (fitz).
    This avoids external API calls (LlamaParse) which can be slow or fail
    due to environment-specific dependency issues (Pydantic v1 vs v2).
    """
    return _extract_with_pymupdf(pdf_bytes)


def _extract_with_pymupdf(pdf_bytes: bytes) -> str:
    """
    Local PDF text extraction using PyMuPDF (fitz).
    Optimized for Indian Credit Reports (CIBIL/Experian).
    Includes section markers to assist LLM chunking/deduplication.
    """
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_text = []
        found_accounts = False
        found_enquiries = False
        
        # Keywords to detect significant sections
        account_keywords = ["ACCOUNT INFORMATION", "ACCOUNT SUMMARY", "ACCOUNTS", "TRADE LINES", "TRADE LINE"]
        enquiry_keywords = ["ENQUIRY INFORMATION", "ENQUIRIES", "CREDIT ENQUIRIES", "RECENT ENQUIRIES"]
        
        for page_num, page in enumerate(doc):
            # Use "text" layout for clean line-by-line extraction
            text = page.get_text("text")
            if text.strip():
                header = f"--- Page {page_num + 1} ---"
                
                # Logic to help the LLM identify the start of the account list
                # We skip page 1 (0) as it often contains Table of Contents with these keywords
                if not found_accounts and page_num > 0 and any(k in text.upper() for k in account_keywords):
                    header = f"[[ACCOUNT_SECTION_START]]\n{header}"
                    found_accounts = True
                
                # Logic to help detect start of enquiries (which usually marks end of accounts)
                if not found_enquiries and page_num > 5 and any(k in text.upper() for k in enquiry_keywords):
                    header = f"[[ACCOUNT_SECTION_END]]\n{header}"
                    found_enquiries = True
                
                pages_text.append(f"{header}\n{text}")
        doc.close()

        full_text = "\n\n".join(pages_text)
        
        # Write debug log for transparency
        try:
            debug_path = os.path.join(
                os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt"
            )
            with open(debug_path, "w", encoding="utf-8") as f:
                f.write(full_text[:50000]) # Log head for debugging
        except Exception:
            pass

        print(
            f"DEBUG: PyMuPDF extracted {len(full_text)} chars "
            f"from {len(pages_text)} pages (file: {len(pdf_bytes)} bytes)."
        )
        return full_text

    except Exception as e:
        print(f"ERROR: PyMuPDF extraction failed: {e}")
        return ""
