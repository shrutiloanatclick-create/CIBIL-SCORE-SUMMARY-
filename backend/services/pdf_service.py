import httpx
import os
import asyncio


async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract text from a PDF using LlamaParse REST API.
    For small (KB-sized) PDFs where LlamaParse returns too little text,
    automatically falls back to local PyMuPDF extraction.
    """
    api_key = os.getenv("LLAMA_CLOUD_API_KEY")
    if not api_key:
        print("ERROR: LLAMA_CLOUD_API_KEY not found. Using PyMuPDF fallback.")
        return _extract_with_pymupdf(pdf_bytes)

    base_url = "https://api.cloud.llamaindex.ai/api/v1"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # 1. Upload File to Start Parsing
            print("DEBUG: Uploading PDF to LlamaParse API...")
            files = {"file": ("report.pdf", pdf_bytes, "application/pdf")}
            payload = {"result_type": "markdown"}

            response = await client.post(
                f"{base_url}/parsing/upload",
                headers=headers,
                files=files,
                data=payload,
            )

            if response.status_code != 200:
                print(f"LlamaParse Upload Failed ({response.status_code}): {response.text}")
                print("DEBUG: Falling back to PyMuPDF due to upload failure.")
                return _extract_with_pymupdf(pdf_bytes)

            job_id = response.json().get("id")
            if not job_id:
                print("LlamaParse failed to return a Job ID. Using PyMuPDF fallback.")
                return _extract_with_pymupdf(pdf_bytes)

            # 2. Poll for Completion
            print(f"DEBUG: Job started (ID: {job_id}). Polling for results...")
            max_retries = 60  # 2 minutes max
            for i in range(max_retries):
                await asyncio.sleep(2)

                status_resp = await client.get(
                    f"{base_url}/parsing/job/{job_id}", headers=headers
                )
                if status_resp.status_code != 200:
                    continue

                job_data = status_resp.json()
                status = job_data.get("status")

                if status == "SUCCESS":
                    print("DEBUG: LlamaParse Job SUCCESS.")
                    break
                elif status in ["FAILED", "CANCELLED"]:
                    print(f"LlamaParse Job {status}: {job_data.get('error', 'Unknown Error')}")
                    print("DEBUG: Falling back to PyMuPDF due to job failure.")
                    return _extract_with_pymupdf(pdf_bytes)

                if i % 5 == 0:
                    print(f"DEBUG: Polling... (Status: {status})")
            else:
                print("LlamaParse Polling Timed Out. Using PyMuPDF fallback.")
                return _extract_with_pymupdf(pdf_bytes)

            # 3. Retrieve Final Markdown
            print("DEBUG: Fetching results...")
            result_resp = await client.get(
                f"{base_url}/parsing/job/{job_id}/result/markdown", headers=headers
            )

            if result_resp.status_code != 200:
                print(f"Failed to fetch result: {result_resp.text}. Using PyMuPDF fallback.")
                return _extract_with_pymupdf(pdf_bytes)

            data = result_resp.json()
            full_text = data.get("markdown", "") or data.get("text", "")

            # Log snippet for debugging
            try:
                debug_path = os.path.join(
                    os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt"
                )
                with open(debug_path, "w", encoding="utf-8") as f:
                    f.write(full_text[:50000])
            except Exception:
                pass

            # KEY FIX: If LlamaParse returned too little text (common for small KB PDFs),
            # fall back to PyMuPDF which works reliably on any size PDF.
            if len(full_text.strip()) < 200:
                print(
                    f"DEBUG: LlamaParse returned only {len(full_text.strip())} chars "
                    f"(file size: {len(pdf_bytes)} bytes). "
                    f"Falling back to PyMuPDF local extraction..."
                )
                pymupdf_text = _extract_with_pymupdf(pdf_bytes)
                if pymupdf_text and len(pymupdf_text.strip()) > len(full_text.strip()):
                    full_text = pymupdf_text

            print(f"DEBUG: Final extracted text length: {len(full_text)} chars")
            return full_text

    except Exception as e:
        print(f"Critical error in LlamaParse integration: {str(e)}. Falling back to PyMuPDF...")
        import traceback
        traceback.print_exc()
        return _extract_with_pymupdf(pdf_bytes)


def _extract_with_pymupdf(pdf_bytes: bytes) -> str:
    """
    Local PDF text extraction using PyMuPDF (fitz).
    Works on ALL PDF sizes including small KB files — no API call needed.
    Used as a fallback when LlamaParse returns insufficient text.
    """
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_text = []
        for page_num, page in enumerate(doc):
            # Use "text" layout for clean line-by-line extraction
            text = page.get_text("text")
            if text.strip():
                pages_text.append(f"--- Page {page_num + 1} ---\n{text}")
        doc.close()

        full_text = "\n\n".join(pages_text)
        print(
            f"DEBUG: PyMuPDF extracted {len(full_text)} chars "
            f"from {len(pages_text)} pages (file: {len(pdf_bytes)} bytes)."
        )
        return full_text

    except Exception as e:
        print(f"ERROR: PyMuPDF fallback also failed: {e}")
        return ""
