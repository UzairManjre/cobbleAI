import requests
import uuid

# Mock a user or use a known one if possible
# Since I can't easily get a token here, I'll just check if the endpoint exists and what it returns for 401
try:
    resp = requests.get("http://localhost:8000/api/analytics/dashboard")
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text[:500]}")
except Exception as e:
    print(f"Error: {e}")
