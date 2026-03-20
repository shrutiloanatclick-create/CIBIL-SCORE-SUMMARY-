from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_dummy_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    c.drawString(100, 750, "Experian Credit Report")
    c.drawString(100, 730, "Name: Deepak Rastogi")
    c.drawString(100, 710, "Experian Credit Score: 750")
    c.drawString(100, 690, "Active Accounts: 5")
    c.drawString(100, 670, "Total Current Bal. amt: 6,28,671")
    c.showPage()
    c.save()

if __name__ == "__main__":
    create_dummy_pdf("dummy_report.pdf")
    print("Created dummy_report.pdf")
