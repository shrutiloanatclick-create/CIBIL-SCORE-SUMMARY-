import fitz  # PyMuPDF
import pdfplumber
import io
import re
import os

def clean_text(text: str) -> str:
    """Preprocess extracted text: keep structure by preserving leading indentation."""
    # Replace tabs with multiple spaces
    text = text.replace('\t', '    ')
    # Remove only trailing whitespace from each line to preserve table structure
    lines = [line.rstrip() for line in text.split('\n')]
    return '\n'.join(lines)

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text using PyMuPDF with fallback to pdfplumber or Vision."""
    try:
        # Try PyMuPDF first (faster)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if doc.is_encrypted:
            doc.close()
            raise ValueError("The PDF is password protected. Please provide a decrypted version.")
            
        print(f"DEBUG: fitz opened PDF with {len(doc)} pages")
        extracted_text = ""
        for i, page in enumerate(doc):
            text = page.get_text("text", sort=True)
            extracted_text += text + "\n---\n"
            if i == 0:
                print(f"DEBUG: Page 1 sample: {text[:50]}...")
        
        doc.close()
        
        # Fallback to pdfplumber if fitz didn't get enough text OR if key markers are missing
        # CIBIL/Experian reports almost always have "ACCOUNT" and "ENQUIRY" sections.
        has_markers = any(m in extracted_text.upper() for m in ["ACCOUNT", "ENQUIRY", "TRADE LINE", "CREDIT SUMMARY"])
        
        if len(extracted_text.strip()) < 100 or not has_markers:
            print(f"DEBUG: PyMuPDF extraction insufficient (Length: {len(extracted_text)}, Markers: {has_markers}). Trying pdfplumber fallback...")
            extracted_text = ""
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                # For very large PDFs, we might want to limit pdfplumber to critical sections,
                # but for robustness let's try the whole thing first.
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text += page_text + "\n"
            print(f"DEBUG: pdfplumber extraction complete. Length: {len(extracted_text)}")
            
        # Final check: if still empty, it might be a scanned PDF
        if len(extracted_text.strip()) < 50:
            print("DEBUG: Standard extraction failed (scanned PDF?). Triggering Vision fallback...")
            # Vision fallback handles first 15 pages for large reports
            from services.llm_service import summarize_scanned_pdf
            return summarize_scanned_pdf(pdf_bytes, max_pages=15)
            
        final_text = clean_text(extracted_text)
        
        # DEBUG: Save to file for the agent to inspect
        try:
            debug_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt")
            with open(debug_path, "w", encoding="utf-8") as f:
                f.write(final_text[:2000] + "\n... [TRUNCATED] ...\n")
            print(f"DEBUG: Saved extraction sample to {os.path.abspath(debug_path)}")
        except Exception as de:
            print(f"DEBUG: Failed to save debug file: {de}")
            
        return final_text
        
    except ValueError as ve:
        raise ve
    except Exception as e:
        print(f"Error extracting PDF: {e}")
        return ""
