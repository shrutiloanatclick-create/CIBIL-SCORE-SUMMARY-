import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.llm_service import summarize_cibil_report
import json

test_text = """Experian Credit Report
Name: Deepak Rastogi
Experian Credit Score: 750
Active Accounts: 5
Total Current Bal. amt: 6,28,671
"""

print("Starting test...")
result = summarize_cibil_report(test_text)
print("Saving result to test_output.json")
with open("test_output.json", "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)
print("Done.")
