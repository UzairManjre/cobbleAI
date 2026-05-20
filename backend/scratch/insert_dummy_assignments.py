import asyncio
import sys
import os
import uuid
from datetime import datetime, timedelta, timezone

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.db import connect_to_mongo, close_mongo_connection
from app.models.course import Course
from app.models.test import Test, Question
from app.models.user import User

async def main():
    await connect_to_mongo()

    # Find the professor
    prof = await User.find_one(User.email == "pal@gmail.com")
    if not prof:
        print("Professor pal@gmail.com not found!")
        await close_mongo_connection()
        return

    print(f"Found professor: {prof.name} ({prof.id})")

    # Find or create courses
    courses = {
        "MAT10": {
            "title": "Mathematics - Grade 10",
            "code": "MAT10",
            "description": "Foundational high school mathematics."
        },
        "PHY11": {
            "title": "Physics - Grade 11",
            "code": "PHY11",
            "description": "Introduction to classical mechanics and electromagnetism."
        },
        "SOC10": {
            "title": "Social Studies - Grade 10",
            "code": "SOC10",
            "description": "Introduction to democracy, civil rights, and history."
        }
    }

    course_docs = {}
    for code, info in courses.items():
        existing = await Course.find_one(Course.code == code, Course.professor_id == prof.id)
        if not existing:
            doc = Course(
                id=uuid.uuid4(),
                professor_id=prof.id,
                title=info["title"],
                code=info["code"],
                description=info["description"],
                schedule="Mon, Wed • 10:00 AM"
            )
            await doc.insert()
            print(f"Created course: {doc.title} ({doc.code})")
            course_docs[code] = doc
        else:
            print(f"Course already exists: {existing.title}")
            course_docs[code] = existing

    # Find Big Data course
    big_data_course = await Course.find_one(Course.code == "CSE601", Course.professor_id == prof.id)
    if big_data_course:
        course_docs["CSE601"] = big_data_course

    # Clean existing tests of type 'assignment' for these courses to avoid duplicates
    course_uuids = [c.id for c in course_docs.values()]
    deleted = await Test.find(
        {"course_id": {"$in": course_uuids}, "test_type": "assignment"}
    ).delete()
    print(f"Cleaned up {deleted} existing assignments.")

    now = datetime.now(timezone.utc)

    # Insert Assignments
    assignments = [
        {
            "course": "MAT10",
            "title": "Quadratic Equations Worksheet",
            "description": "Solve quadratic equations using factoring, completing the square, and the quadratic formula.",
            "status": "published",
            "due_in_days": 3
        },
        {
            "course": "PHY11",
            "title": "Lab Report - Motion",
            "description": "Document results from the inclined plane experiment, analyzing friction and gravity.",
            "status": "published",
            "due_in_days": 5
        },
        {
            "course": "SOC10",
            "title": "Essay on Democracy",
            "description": "Write a 1000-word essay detailing the structural differences between direct democracy and representative republic.",
            "status": "published",
            "due_in_days": 9
        },
        {
            "course": "CSE601",
            "title": "Big Data Project Part 1",
            "description": "Submit HDFS setup scripts and preliminary data ingestion map-reduce flows.",
            "status": "draft",
            "due_in_days": 12
        }
    ]

    for ass in assignments:
        course_doc = course_docs.get(ass["course"])
        if not course_doc:
            continue

        test_doc = Test(
            id=uuid.uuid4(),
            course_id=course_doc.id,
            professor_id=prof.id,
            title=ass["title"],
            description=ass["description"],
            test_type="assignment",
            status=ass["status"],
            available_from=now - timedelta(days=1),
            available_until=now + timedelta(days=ass["due_in_days"]),
            questions=[
                Question(
                    type="essay",
                    question_text="Provide your detailed answer below.",
                    marks=10.0
                )
            ],
            total_marks=10.0
        )
        await test_doc.insert()
        print(f"Inserted assignment: {test_doc.title} (Status: {test_doc.status}, Due in: {ass['due_in_days']} days)")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
