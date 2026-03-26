from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import pandas as pd
from io import BytesIO
from fastapi.responses import StreamingResponse

from services.pdf_service import extract_text_from_pdf
from services.llm_service import summarize_cibil_report, summarize_cibil_report_vision, ask_cibil_question
from api.export import router as export_router

load_dotenv()

app = FastAPI(title="CIBIL Report Summarizer")

# In production, set ALLOWED_ORIGINS to your Vercel frontend URL, e.g.:
# ALLOWED_ORIGINS=https://your-app.vercel.app
# Multiple origins can be comma-separated.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = ["*"] if _raw_origins == "*" else [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(export_router, prefix="/api/export", tags=["export"])


@app.get("/")
def read_root():
    return {"message": "CIBIL Report Summarizer API is running"}


@app.post("/api/upload")
async def upload_cibil_report(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    try:
        # Read file content
        content = await file.read()
        print(f"DEBUG: Received upload request for {file.filename} ({len(content)} bytes)")
        
        try:
            print("DEBUG: Starting PDF text extraction...")
            extracted_text = extract_text_from_pdf(content)
            print(f"DEBUG: Extraction complete. Length: {len(extracted_text)} chars")
        except Exception as e:
             print(f"DEBUG: Extraction failed: {str(e)}")
             raise HTTPException(status_code=400, detail=str(e))
             
        if not extracted_text or len(extracted_text.strip()) < 20:
             # Fallback to Vision Model for Scanned PDFs
             print("DEBUG: Scanned/Empty PDF detected. Falling back to Groq Vision OCR...")
             summary_data = summarize_cibil_report_vision(content)
        else:
             # 2. Process with standard LLM
             print(f"DEBUG: Processing with standard LLM. First 100 chars: {extracted_text[:100]}...")
             from services.llm_service import log_to_file as audit_log
             audit_log(f"Processing in main.py. Filename: {file.filename}, Size: {len(content)}, Extracted Chars: {len(extracted_text)}")
             summary_data = summarize_cibil_report(extracted_text)
        
        print(f"DEBUG: Summary data received. Type: {type(summary_data)}")
        
        if isinstance(summary_data, dict) and "error" in summary_data:
            print(f"DEBUG: LLM returned error structure: {summary_data['error']}")
            raise HTTPException(status_code=500, detail=summary_data["error"])
        
        if not isinstance(summary_data, dict):
            print(f"DEBUG: LLM returned non-dict data: {summary_data}")
            raise HTTPException(status_code=500, detail="Model failed to return structured data")

        # We attach the extracted text so the frontend can use it for subsequent chat questions
        # For scanned PDFs (empty extracted_text), we provide basic context from the summary
        if not extracted_text or len(extracted_text.strip()) < 20:
             s = summary_data.get("summary") or {}
             if isinstance(s, dict) and s:
                 synthetic = f"Summary of Scanned CIBIL Report:\nName: {s.get('name')}\nScore: {s.get('cibil_score')}\nCity: {s.get('city')}\nActive Loans: {s.get('active_loans')}\nOutstanding: {s.get('outstanding_amount')}"
                 summary_data["extracted_text"] = synthetic
             else:
                 summary_data["extracted_text"] = "Analyzed Scanned CIBIL Report."
        else:
            summary_data["extracted_text"] = extracted_text
        
        print(f"DEBUG: Returning successful summary data. Keys: {list(summary_data.keys())}")
        if "summary" in summary_data:
            print(f"DEBUG: Summary keys: {list(summary_data['summary'].keys())}")
        return summary_data
        
    except Exception as e:
        print(f"CRITICAL: Error processing upload: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")


class ChatRequest(BaseModel):
    extracted_text: str
    question: str

@app.post("/api/chat")
async def chat_with_report(request: ChatRequest):
    if not request.extracted_text or not request.question:
        raise HTTPException(status_code=400, detail="Missing text or question")
    
    result = ask_cibil_question(request.extracted_text, request.question)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return result
