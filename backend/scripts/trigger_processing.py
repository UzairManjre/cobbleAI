import asyncio
import requests

async def trigger_processing():
    # Get token from localStorage equivalent - let's just login first
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    # Login to get token
    login_data = {
        "username": input("Email: "),
        "password": input("Password: ")
    }
    
    response = requests.post(
        "http://127.0.0.1:8000/auth/jwt/login",
        data=login_data
    )
    
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return
    
    token = response.json()["access_token"]
    print(f"✅ Logged in\n")
    
    # Call process-all-pending endpoint
    response = requests.post(
        "http://127.0.0.1:8000/documents/process-all-pending",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

asyncio.run(trigger_processing())
