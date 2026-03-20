import os
from groq import Groq
from dotenv import load_dotenv

# Load from both possible locations
load_dotenv()
load_dotenv(dotenv_path=os.path.join("backend", ".env"))

api_key = os.getenv("GROQ_API_KEY")
print(f"API Key found: {'Yes' if api_key else 'No'}")
if api_key:
    print(f"API Key prefix: {api_key[:10]}...")

try:
    client = Groq(api_key=api_key)
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Say hello in one word",
            }
        ],
        model="llama3-8b-8192",
    )
    print(f"Connection successful! Response: {chat_completion.choices[0].message.content}")
except Exception as e:
    print(f"Connection failed: {str(e)}")
