from fastapi import APIRouter, Depends
from app.api.auth import current_active_user
from app.models.user import User
from app.schemas.test import CreateTestRequest, GenerateTestRequest
from app.services.test_service import TestService
from fastapi.encoders import jsonable_encoder

router = APIRouter(prefix="/tests", tags=["tests (professor)"])

@router.post("/create")
async def create_test(req: CreateTestRequest, user: User = Depends(current_active_user)):
    test = await TestService.create_test(user, req)
    return {
        "test": jsonable_encoder(test),
        "test_id": str(test.id),
        "message": "Test created successfully"
    }

@router.post("/{test_id}/generate-questions")
async def generate_test_questions(test_id: str, req: GenerateTestRequest, user: User = Depends(current_active_user)):
    test, num_questions = await TestService.generate_questions(user, test_id, req)
    return {
        "test_id": str(test.id),
        "questions_generated": num_questions,
        "total_marks": test.total_marks,
        "message": "Questions generated successfully"
    }

@router.post("/{test_id}/publish")
async def publish_test(test_id: str, user: User = Depends(current_active_user)):
    test = await TestService.publish_test(user, test_id)
    return {"test": jsonable_encoder(test), "message": "Test published successfully"}

@router.get("/all")
async def get_all_professor_tests(user: User = Depends(current_active_user)):
    tests, course_map = await TestService.get_all_professor_tests(user)
    serialized = []
    for t in tests:
        serialized.append({
            "id": str(t.id),
            "course_id": str(t.course_id),
            "course_title": course_map.get(t.course_id, "Unknown Course"),
            "title": t.title,
            "description": t.description,
            "duration_minutes": t.duration_minutes,
            "passing_percentage": t.passing_percentage,
            "test_type": t.test_type,
            "status": t.status,
            "questions": [],
            "question_count": len(t.questions) if t.questions else 0,
            "total_marks": t.total_marks,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "available_until": t.available_until.isoformat() if t.available_until else None,
        })
    return {"tests": serialized}

@router.get("/{test_id}")
async def get_test(test_id: str, user: User = Depends(current_active_user)):
    test = await TestService.get_test(user, test_id)
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
            "questions": [q.model_dump() if hasattr(q, 'model_dump') else q.dict() for q in test.questions] if test.questions else [],
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
    return jsonable_encoder(res)
