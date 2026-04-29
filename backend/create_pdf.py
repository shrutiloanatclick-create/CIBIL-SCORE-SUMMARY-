from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_dummy_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    
    # 1. Personal & Summary Info
    c.drawString(100, 750, "Experian Credit Report")
    c.drawString(100, 730, "Name: Deepak Rastogi")
    c.drawString(100, 710, "Date of Birth: 15-08-1985")
    c.drawString(100, 690, "Mobile: 9876543210")
    c.drawString(100, 670, "Experian Credit Score: 774")
    c.drawString(100, 650, "Total Current Bal. amt: 6,28,671")
    
    # 2. Account Information Section
    c.drawString(100, 610, "ACCOUNT INFORMATION")
    
    # Active Loan 1
    c.drawString(100, 580, "Lender Name: HDFC Bank")
    c.drawString(100, 565, "Account Number: 987654321")
    c.drawString(100, 550, "Loan Type: Personal Loan")
    c.drawString(100, 535, "Sanctioned Amount: 5,00,000")
    c.drawString(100, 520, "Current Balance: 4,50,000")
    c.drawString(100, 505, "Date Opened: 12-05-2022")
    c.drawString(100, 490, "Amount Overdue: 0")
    
    # Active Loan 2
    c.drawString(100, 450, "Lender Name: ICICI Bank")
    c.drawString(100, 435, "Account Number: 112233445")
    c.drawString(100, 420, "Loan Type: Credit Card")
    c.drawString(100, 405, "Sanctioned Amount: 2,00,000")
    c.drawString(100, 390, "Current Balance: 1,78,671")
    c.drawString(100, 375, "Date Opened: 01-10-2021")
    c.drawString(100, 360, "Amount Overdue: 0")
    
    # Closed Loan 1
    c.drawString(100, 320, "Lender Name: SBI")
    c.drawString(100, 305, "Account Number: 554433221")
    c.drawString(100, 290, "Loan Type: Auto Loan")
    c.drawString(100, 275, "Sanctioned Amount: 8,00,000")
    c.drawString(100, 260, "Current Balance: 0")
    c.drawString(100, 245, "Date Opened: 15-03-2018")
    c.drawString(100, 230, "Date Closed: 20-04-2023")

    # 3. Enquiry Information Section
    c.drawString(100, 190, "ENQUIRY INFORMATION")
    c.drawString(100, 170, "Lender: Axis Bank | Date: 10-04-2024 | Amount: 3,00,000")
    c.drawString(100, 150, "Lender: Bajaj Finance | Date: 15-01-2024 | Amount: 50,000")
    
    c.showPage()
    c.save()

if __name__ == "__main__":
    create_dummy_pdf("dummy_report.pdf")
    print("Created dummy_report.pdf")
