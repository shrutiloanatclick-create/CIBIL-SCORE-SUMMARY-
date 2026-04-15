import httpx
import os
import asyncio
import io

async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text using LlamaParse REST API directly to avoid SDK compatibility issues."""
    api_key = os.getenv("LLAMA_CLOUD_API_KEY")
    if not api_key:
        print("ERROR: LLAMA_CLOUD_API_KEY not found in environment")
        return ""

    base_url = "https://api.cloud.llamaindex.ai/api/v1"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # 1. Upload File to Start Parsing
            print("DEBUG: Uploading PDF to LlamaParse API...")
            files = {'file': ('report.pdf', pdf_bytes, 'application/pdf')}
            # result_type="markdown" is standard for best table handling
            payload = {'result_type': 'markdown'} 
            
            response = await client.post(f"{base_url}/parsing/upload", headers=headers, files=files, data=payload)
            
            if response.status_code != 200:
                print(f"LlamaParse Upload Failed ({response.status_code}): {response.text}")
                return ""
            
            job_id = response.json().get("id")
            if not job_id:
                print("LlamaParse failed to return a Job ID")
                return ""

            # 2. Poll for Completion
            print(f"DEBUG: Job started (ID: {job_id}). Polling for results...")
            max_retries = 60 # 2 minutes max
            for i in range(max_retries):
                await asyncio.sleep(2)
                
                status_resp = await client.get(f"{base_url}/parsing/job/{job_id}", headers=headers)
                if status_resp.status_code != 200:
                    continue
                    
                job_data = status_resp.json()
                status = job_data.get("status")
                
                if status == "SUCCESS":
                    print("DEBUG: LlamaParse Job SUCCESS.")
                    break
                elif status in ["FAILED", "CANCELLED"]:
                    print(f"LlamaParse Job {status}: {job_data.get('error', 'Unknown Error')}")
                    return ""
                
                if i % 5 == 0:
                    print(f"DEBUG: Polling... (Status: {status})")
            else:
                print("LlamaParse Polling Timed Out")
                return ""

            # 3. Retrieve Final Markdown
            print("DEBUG: Fetching results...")
            result_resp = await client.get(f"{base_url}/parsing/job/{job_id}/result/markdown", headers=headers)
            
            if result_resp.status_code != 200:
                print(f"Failed to fetch result: {result_resp.text}")
                return ""
                
            data = result_resp.json()
            full_text = data.get("markdown", "")
            
            if not full_text:
                # Sometimes the structure is different, check for 'text' or other fields
                full_text = data.get("text", "")
            
            # Log snippet for debugging
            try:
                debug_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "debug_last_extraction.txt")
                with open(debug_path, "w", encoding="utf-8") as f:
                    f.write(full_text[:50000])
            except: pass
            
            return full_text

    except Exception as e:
        print(f"Critical error in LlamaParse integration: {str(e)}")
        import traceback
        traceback.print_exc()
        return ""
