import asyncio
import sys
import os

# Add parent directory to path so app package is importable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.db import connect_to_mongo, close_mongo_connection
from app.models.course import Course, Enrolment
from app.models.user import User

async def main():
    await connect_to_mongo()
    
    print("\n--- USERS ---")
    users = await User.find_all().to_list()
    for u in users:
        print(f"Name: {u.name}, Email: {u.email}, ID: {u.id}, Role: {u.role}")
        
    print("\n--- COURSES ---")
    courses = await Course.find_all().to_list()
    for c in courses:
        print(f"Title: {c.title}, Code: {c.code}, Professor_ID: {c.professor_id}, ID: {c.id}")
        
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
