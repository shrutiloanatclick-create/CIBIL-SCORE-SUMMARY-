from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from typing import Optional, List, Union

router = APIRouter()

class SummaryInfo(BaseModel):
    name: Optional[str] = None
    dob: Optional[str] = None
    date_reported: Optional[str] = None
    mobile: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    cibil_score: Union[int, str, None] = 0
    active_loans: Union[int, str, None] = 0
    closed_loans: Union[int, str, None] = 0
    outstanding_amount: Optional[str] = "₹0"
    total_enquiries: Union[int, str, None] = 0

class LoanDetail(BaseModel):
    lender_name: Optional[str] = None
    loan_type: Optional[str] = None
    loan_amount: Optional[str] = None
    outstanding_balance: Optional[str] = None
    emi: Optional[str] = None
    loan_start_date: Optional[str] = None
    account_no: Optional[str] = None
    date_closed: Optional[str] = None
    has_late_payments: Optional[bool] = False
    status: Optional[str] = None

class EnquiryDetail(BaseModel):
    lender: Optional[str] = None
    date: Optional[str] = None
    purpose: Optional[str] = None
    amount: Optional[str] = None

class CibilData(BaseModel):
    summary: Optional[SummaryInfo] = None
    active_loan_details: Optional[List[LoanDetail]] = []
    closed_loan_details: Optional[List[LoanDetail]] = []
    enquiry_list: Optional[List[EnquiryDetail]] = []
    risk_level: Optional[str] = "Unknown"
    # Legacy fields for backward compatibility if any
    cibil_score: Union[int, str, None] = None
    active_loans: Union[int, str, None] = None
    loan_types: Union[List[str], str, None] = None
    outstanding_amount: Optional[str] = None

@router.post("/pdf")
async def export_pdf(data: CibilData):
    try:
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        
        # Helper for common fields
        summary = data.summary if data.summary else SummaryInfo(
            cibil_score=data.cibil_score,
            active_loans=data.active_loans,
            outstanding_amount=data.outstanding_amount
        )

        def draw_header(c, title):
            c.setFont("Helvetica-Bold", 16)
            c.setFillColor(colors.HexColor("#3b82f6")) # Accent color
            c.drawString(50, height - 50, title)
            c.setStrokeColor(colors.grey)
            c.line(50, height - 60, width - 50, height - 60)
            c.setFillColor(colors.black)

        draw_header(c, "CIBIL Intelligence Report")
        
        y_position = height - 90
        line_height = 18

        # --- Section 1: Summary & Risk ---
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y_position, "1. Executive Summary")
        y_position -= line_height * 1.5
        
        c.setFont("Helvetica", 10)
        risk_color = colors.green
        if "High" in (data.risk_level or ""): risk_color = colors.red
        elif "Medium" in (data.risk_level or ""): risk_color = colors.orange

        c.setFillColor(risk_color)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(50, y_position, f"Risk Profile: {data.risk_level}")
        c.setFillColor(colors.black)
        y_position -= line_height

        details = [
            ("CIBIL Score", str(summary.cibil_score or 0)),
            ("Account Holder", summary.name or "N/A"),
            ("Report Date", summary.date_reported or "N/A"),
            ("Active Loans", str(summary.active_loans or 0)),
            ("Outstanding", str(summary.outstanding_amount or "₹0")),
            ("Total Enquiries", str(summary.total_enquiries or 0))
        ]

        for label, val in details:
            c.setFont("Helvetica-Bold", 9)
            c.drawString(60, y_position, f"{label}:")
            c.setFont("Helvetica", 9)
            c.drawString(160, y_position, str(val))
            y_position -= line_height

        y_position -= line_height

        # --- Section 2: Active Loans ---
        if data.active_loan_details:
            if y_position < 150:
                c.showPage()
                y_position = height - 50
            
            c.setFont("Helvetica-Bold", 12)
            c.drawString(50, y_position, "2. Active Loan Breakdown")
            y_position -= line_height * 1.2
            
            headers = ["Lender", "Type", "Amount", "Outstanding", "EMI"]
            c.setFont("Helvetica-Bold", 8)
            col_widths = [140, 100, 80, 80, 80]
            curr_x = 50
            for i, h in enumerate(headers):
                c.drawString(curr_x, y_position, h)
                curr_x += col_widths[i]
            
            y_position -= 5
            c.line(50, y_position, width - 50, y_position)
            y_position -= 12

            c.setFont("Helvetica", 8)
            for loan in data.active_loan_details:
                if y_position < 50:
                    c.showPage()
                    y_position = height - 50
                
                curr_x = 50
                fields = [
                    loan.lender_name or "—", 
                    loan.loan_type or "—", 
                    loan.loan_amount or "—", 
                    loan.outstanding_balance or "—", 
                    loan.emi or "—"
                ]
                for i, f in enumerate(fields):
                    txt = str(f)[:25] if i == 0 else str(f)
                    c.drawString(curr_x, y_position, txt)
                    curr_x += col_widths[i]
                y_position -= 12

        y_position -= line_height

        # --- Section 3: Closed Loans ---
        if data.closed_loan_details:
            if y_position < 150:
                c.showPage()
                y_position = height - 50

            c.setFont("Helvetica-Bold", 12)
            c.drawString(50, y_position, "3. Closed Account History")
            y_position -= line_height * 1.2

            headers = ["Lender", "Account No", "Type", "Amount", "Status"]
            c.setFont("Helvetica-Bold", 8)
            col_widths = [140, 100, 100, 80, 60]
            curr_x = 50
            for i, h in enumerate(headers):
                c.drawString(curr_x, y_position, h)
                curr_x += col_widths[i]

            y_position -= 5
            c.line(50, y_position, width - 50, y_position)
            y_position -= 12

            c.setFont("Helvetica", 8)
            for loan in data.closed_loan_details:
                if y_position < 50:
                    c.showPage()
                    y_position = height - 50

                curr_x = 50
                status_txt = "Delayed" if loan.has_late_payments else "Clean"
                fields = [
                    loan.lender_name or "—", 
                    loan.account_no or "—", 
                    loan.loan_type or "—", 
                    loan.loan_amount or "—", 
                    status_txt
                ]
                for i, f in enumerate(fields):
                    txt = str(f)[:25] if i == 0 else str(f)
                    c.drawString(curr_x, y_position, txt)
                    curr_x += col_widths[i]
                y_position -= 12

        c.save()
        buffer.seek(0)
        
        safe_name = str(summary.name or "report").replace(' ', '_')
        return StreamingResponse(
            buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=cibil_intelligence_{safe_name}.pdf"}
        )
        
    except Exception as e:
        print(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate PDF")

@router.post("/excel")
async def export_excel(data: CibilData):
    try:
        buffer = io.BytesIO()
        summary_info = data.summary if data.summary else SummaryInfo(
            cibil_score=data.cibil_score,
            active_loans=data.active_loans,
            outstanding_amount=data.outstanding_amount
        )

        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            # 1. Summary Sheet
            summary_df = pd.DataFrame({
                "Parameter": ["Name", "DOB", "Mobile", "Company", "CIBIL Score", "Risk Level", "Active Loans", "Outstanding Amount"],
                "Value": [
                    summary_info.name, summary_info.dob, summary_info.mobile, summary_info.company,
                    str(summary_info.cibil_score), data.risk_level, str(summary_info.active_loans), str(summary_info.outstanding_amount)
                ]
            })
            summary_df.to_excel(writer, index=False, sheet_name='Summary')
            
            # 2. Active Loans Sheet
            if data.active_loan_details:
                active_df = pd.DataFrame([l.dict() for l in data.active_loan_details])
                active_df.to_excel(writer, index=False, sheet_name='Active Loans')
            else:
                pd.DataFrame({"Message": ["No active loans found"]}).to_excel(writer, index=False, sheet_name='Active Loans')

            # 3. Closed Loans Sheet
            if data.closed_loan_details:
                closed_df = pd.DataFrame([l.dict() for l in data.closed_loan_details])
                closed_df.to_excel(writer, index=False, sheet_name='Closed Accounts')
            else:
                pd.DataFrame({"Message": ["No closed accounts found"]}).to_excel(writer, index=False, sheet_name='Closed Accounts')

            # 4. Enquiries Sheet
            if data.enquiry_list:
                enq_df = pd.DataFrame([e.dict() for e in data.enquiry_list])
                enq_df.to_excel(writer, index=False, sheet_name='Enquiries')

        buffer.seek(0)
        
        safe_name = str(summary_info.name or "report").replace(' ', '_')
        return StreamingResponse(
            buffer, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=cibil_analysis_{safe_name}.xlsx"}
        )
        
    except Exception as e:
        print(f"Error generating Excel: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate Excel")
