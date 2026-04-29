import os
import io
import asyncio
from services.pdf_service import extract_text_from_pdf
from services.llm_service import summarize_cibil_report, summarize_cibil_report_vision

async def process_pdf_report(file_path: str):
    """
    Complete pipeline: 
    1. Read PDF
    2. Extract & Fix (using pdfplumber with specialized fixes)
    3. Summarize (using LLM)
    """
    print(f"--- Processing: {os.path.basename(file_path)} ---")
    
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    # 1. Read PDF bytes
    with open(file_path, "rb") as f:
        pdf_bytes = f.read()

    # 2. Extract Text (with automated fixing logic inside pdf_service)
    print("Step 1: Extracting and fixing PDF text...")
    text = await extract_text_from_pdf(pdf_bytes)
    
    if not text or len(text.strip()) < 100:
        print("Warning: Local extraction returned very little text. Attempting Vision OCR fallback...")
        summary = summarize_cibil_report_vision(pdf_bytes)
    else:
        print(f"Step 2: Summarizing extracted text ({len(text)} chars)...")
        summary = summarize_cibil_report(text)

    # 3. Output results
    if "error" in summary:
        print(f"Processing Failed: {summary['error']}")
    else:
        print("\n--- Summary Result ---")
        s = summary.get("summary", {})
        print(f"Name: {s.get('name')}")
        print(f"CIBIL Score: {s.get('cibil_score')}")
        print(f"Total Loans: {s.get('total_loans')}")
        print(f"Risk Level: {summary.get('risk_level')}")
        print(f"Risk Reasons: {summary.get('risk_reasons')}")
        print("----------------------\n")
        
    return summary

if __name__ == "__main__":
    # Test with dummy report if it exists
    dummy_path = "dummy_report.pdf"
    if not os.path.exists(dummy_path):
        from create_pdf import create_dummy_pdf
        create_dummy_pdf(dummy_path)
        
    asyncio.run(process_pdf_report(dummy_path))
