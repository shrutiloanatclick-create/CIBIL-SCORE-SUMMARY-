import sys
import os

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

try:
    from backend.services.llm_service import calculate_deterministic_risk
except ImportError:
    # Fallback if the path structure is different
    sys.path.append(os.path.abspath(os.path.join("c:/Users/punit/Desktop/summarization/backend")))
    from services.llm_service import calculate_deterministic_risk

def test_risk():
    test_cases = [
        {"score": 800, "expected": "Very Good"},
        {"score": 750, "expected": "Very Good"},
        {"score": 720, "expected": "Good"},
        {"score": 680, "expected": "Average"},
        {"score": 600, "expected": "Average"},
    ]
    
    for case in test_cases:
        data = {"summary": {"cibil_score": case["score"]}}
        risk, reasons, _ = calculate_deterministic_risk(data)
        print(f"Score: {case['score']} -> Risk: {risk} (Expected: {case['expected']})")
        if risk != case["expected"]:
            print(f"FAILED: Expected {case['expected']}, got {risk}")
        else:
            print("PASSED")

if __name__ == "__main__":
    test_risk()
