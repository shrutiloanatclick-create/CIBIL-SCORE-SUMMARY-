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
    """
    Extract text from a PDF file buffer. 
    It first tries using PyMuPDF, falls back to pdfplumber if text is empty.
    """
    extracted_text = ""
    try:
        # Try PyMuPDF first (faster)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if doc.needs_pass:
             raise Exception("The PDF is password protected. Please remove the password before uploading.")
        
        print(f"DEBUG: fitz opened PDF with {len(doc)} pages")
        for i, page in enumerate(doc):
            text = page.get_text("text", sort=True)
            extracted_text += text + "\n---\n"
            if i == 0:
                print(f"DEBUG: Page 1 sample: {text[:50]}...")
        
        doc.close()
        
        # Fallback to pdfplumber if fitz didn't get anything
        if len(extracted_text.strip()) < 50:
            print("DEBUG: PyMuPDF yielded little text, trying pdfplumber fallback...")
            extracted_text = ""
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text += page_text + "\n"
            print(f"DEBUG: pdfplumber extraction complete. Length: {len(extracted_text)}")
                        
    except Exception as e:
        print(f"Error extracting PDF: {e}")
        if "password" in str(e).lower():
            raise e
        
    # Clean up the text
    cleaned = clean_text(extracted_text)
    
    # DEBUG Audit
    try:
        log_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "backend_audit.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{os.getpid()}] PDF Extraction Complete. Chars: {len(cleaned)}\n")
    except:
        pass
        
    # DEBUG: Save to file for the agent to inspect
    try:
        import os
        debug_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt")
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(cleaned)
        print(f"DEBUG: Saved extraction to {os.path.abspath(debug_path)}")
    except Exception as e:
        print(f"DEBUG: Failed to save debug file: {e}")
        
    return cleaned
