import requests
import json

payload = {
    "model": "gemma4:e2b",
    "messages": [{"role": "user", "content": "Hello, are you there?"}],
    "stream": False
}

try:
    resp = requests.post("http://localhost:11434/api/chat", json=payload, timeout=30)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json().get('message', {}).get('content', '')}")
except Exception as e:
    print(f"Error: {e}")
