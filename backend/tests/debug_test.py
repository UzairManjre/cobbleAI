import asyncio
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.test import Test, Question, MCQOption, TestAnalytics, TestAttempt
from app.models.user import User

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["cobble"]
    await init_beanie(database=db, document_models=[Test, TestAnalytics, TestAttempt, User])
    
    test_id = "2f119e0d-d2fc-48a0-a794-62308231a036"
    test_uuid = uuid.UUID(test_id)
    test = await Test.get(test_uuid)
    print("Test:", test)
    if not test:
        print("Not found")
        return
        
    try:
        res = {
            "test": {
                "id": str(test.id),
                "title": test.title,
                "description": test.description,
                "instructions": test.instructions,
                "duration_minutes": test.duration_minutes,
                "passing_percentage": test.passing_percentage,
                "test_type": test.test_type,
                "status": test.status,
                "questions": [q.model_dump() for q in test.questions] if hasattr(test.questions[0], 'model_dump') else [q.dict() for q in test.questions] if test.questions else [],
                "total_marks": test.total_marks,
                "shuffle_questions": test.shuffle_questions,
                "shuffle_options": test.shuffle_options,
                "show_results_immediately": test.show_results_immediately,
                "allow_retakes": test.allow_retakes,
                "max_attempts": test.max_attempts,
                "available_from": test.available_from.isoformat() if test.available_from else None,
                "available_until": test.available_until.isoformat() if test.available_until else None,
                "created_at": test.created_at.isoformat() if test.created_at else None,
                "published_at": test.published_at.isoformat() if test.published_at else None
            }
        }
        import json
        from fastapi.encoders import jsonable_encoder
        print(jsonable_encoder(res))
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(run())
