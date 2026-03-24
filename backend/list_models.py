import os
from groq import Groq
from dotenv import load_dotenv

# Load from both possible locations
load_dotenv()
load_dotenv(dotenv_path=os.path.join("backend", ".env"))

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("API Key not found!")
    exit(1)

try:
    client = Groq(api_key=api_key)
    models = client.models.list()
    print("Saving models to available_models.txt")
    with open("available_models.txt", "w", encoding="utf-8") as f:
        for model in models.data:
            f.write(f"{model.id}\n")
    print("Done.")
except Exception as e:
    print(f"Error: {str(e)}")
