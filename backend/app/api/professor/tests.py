from fastapi import APIRouter, Depends
from app.api.auth import current_active_user, require_role
from app.models.user import User
from app.schemas.test import CreateTestRequest, GenerateTestRequest
from app.services.test_service import TestService
from fastapi.encoders import jsonable_encoder

router = APIRouter(prefix="/tests", tags=["tests (professor)"])

@router.post("/create")
async def create_test(req: CreateTestRequest, user: User = Depends(require_role("professor"))):
    test = await TestService.create_test(user, req)
    return {
        "test": jsonable_encoder(test),
        "test_id": str(test.id),
        "message": "Test created successfully"
    }

@router.post("/{test_id}/generate-questions")
async def generate_test_questions(test_id: str, req: GenerateTestRequest, user: User = Depends(require_role("professor"))):
    test, num_questions = await TestService.generate_questions(user, test_id, req)
    return {
        "test_id": str(test.id),
        "questions_generated": num_questions,
        "total_marks": test.total_marks,
        "message": "Questions generated successfully"
    }

@router.post("/{test_id}/publish")
async def publish_test(test_id: str, user: User = Depends(require_role("professor"))):
    test = await TestService.publish_test(user, test_id)
    return {"test": jsonable_encoder(test), "message": "Test published successfully"}

@router.post("/{test_id}/release-results")
async def release_results(test_id: str, user: User = Depends(require_role("professor"))):
    """Show results to students: attempts with nothing left to review are released now,
    later submissions and finished reviews are released automatically."""
    return await TestService.release_results(user, test_id)

@router.get("/all")
async def get_all_professor_tests(user: User = Depends(require_role("professor"))):
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
            "show_results_immediately": t.show_results_immediately,
            "results_released": t.results_released,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "available_until": t.available_until.isoformat() if t.available_until else None,
        })
    return {"tests": serialized}

@router.get("/course/{course_id}")
async def get_course_tests(course_id: str, user: User = Depends(require_role("professor"))):
    tests = await TestService.get_course_tests(user, course_id)
    return jsonable_encoder([{
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "duration_minutes": t.duration_minutes,
        "passing_percentage": t.passing_percentage,
        "test_type": t.test_type,
        "status": t.status,
        "question_count": len(t.questions) if t.questions else 0,
        "total_marks": t.total_marks,
        "show_results_immediately": t.show_results_immediately,
        "results_released": t.results_released,
    } for t in tests])

@router.get("/analytics/{test_id}")
async def get_test_analytics(test_id: str, user: User = Depends(require_role("professor"))):
    from app.models.test import TestAnalytics
    import uuid
    try:
        test_uuid = uuid.UUID(test_id)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid UUID")
    analytics = await TestAnalytics.find_one(TestAnalytics.test_id == test_uuid)
    if not analytics:
        return jsonable_encoder({"total_attempts": 0, "average_score": 0, "highest_score": 0, "lowest_score": 0, "median_score": 0})
    return jsonable_encoder(analytics)

@router.get("/{test_id}")
async def get_test(test_id: str, user: User = Depends(require_role("professor"))):
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
            "results_released": test.results_released,
            "allow_retakes": test.allow_retakes,
            "max_attempts": test.max_attempts,
            "available_from": test.available_from.isoformat() if test.available_from else None,
            "available_until": test.available_until.isoformat() if test.available_until else None,
            "created_at": test.created_at.isoformat() if test.created_at else None,
            "published_at": test.published_at.isoformat() if test.published_at else None
        }
    }
    return jsonable_encoder(res)


from typing import List, Optional
from pydantic import BaseModel


class QuestionUpdate(BaseModel):
    cognitive_level: Optional[str] = None
    rubric: Optional[List[str]] = None
    node_id: Optional[str] = None


@router.patch("/{test_id}/questions/{question_id}")
async def update_question(test_id: str, question_id: str, req: QuestionUpdate, user: User = Depends(require_role("professor"))):
    """Edit the grading metadata of a question: Bloom level, rubric key points, linked concept."""
    import uuid
    from datetime import datetime, timezone
    from fastapi import HTTPException
    from app.services.test_generator import COGNITIVE_LEVELS
    test = await TestService.get_test(user, test_id)
    question = next((q for q in test.questions if str(q.id) == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if req.cognitive_level is not None:
        if req.cognitive_level and req.cognitive_level not in COGNITIVE_LEVELS:
            raise HTTPException(status_code=400, detail=f"cognitive_level must be one of {', '.join(COGNITIVE_LEVELS)}")
        question.cognitive_level = req.cognitive_level or None
    if req.rubric is not None:
        question.rubric = [p.strip() for p in req.rubric if p.strip()][:10]
    if req.node_id is not None:
        question.node_id = req.node_id or None
    test.updated_at = datetime.now(timezone.utc)
    await test.save()
    return jsonable_encoder(question)
