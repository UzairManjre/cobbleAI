from fastapi import APIRouter, Depends
from app.api.auth import current_active_user
from app.models.user import User
from app.schemas.test import SubmitTestRequest, GenerateMockTestRequest
from app.services.test_service import TestService
from fastapi.encoders import jsonable_encoder

router = APIRouter(prefix="/tests", tags=["tests (student)"])

@router.post("/{test_id}/start")
async def start_test(test_id: str, user: User = Depends(current_active_user)):
    attempt, test, resumed = await TestService.start_test(user, test_id)
    return {
        "attempt": jsonable_encoder(attempt),
        "test": jsonable_encoder(test),
        "message": "Resuming existing attempt" if resumed else "Test started. Good luck!"
    }

@router.post("/attempt/{attempt_id}/submit")
async def submit_test(attempt_id: str, req: SubmitTestRequest, user: User = Depends(current_active_user)):
    attempt, total_marks, total_possible = await TestService.submit_test(user, attempt_id, req)
    if attempt.status == "submitted":
        return {"attempt": jsonable_encoder(attempt), "message": "Already submitted"}
    return {
        "attempt": jsonable_encoder(attempt),
        "total_marks": total_marks,
        "total_possible": total_possible,
        "percentage": attempt.percentage,
        "status": attempt.status,
        "message": "Test submitted successfully"
    }

@router.get("/attempt/{attempt_id}")
async def get_attempt(attempt_id: str, user: User = Depends(current_active_user)):
    # Not fully abstracted to service yet, but simple enough to query directly or use a quick service method
    from app.models.test import TestAttempt
    import uuid
    from fastapi import HTTPException
    try:
        attempt_uuid = uuid.UUID(attempt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    attempt = await TestAttempt.get(attempt_uuid)
    if not attempt or attempt.student_id != user.id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return {"attempt": jsonable_encoder(attempt)}

@router.get("/attempts/my")
async def get_my_attempts(user: User = Depends(current_active_user)):
    from app.models.test import TestAttempt
    from fastapi import HTTPException
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Only for students")
    attempts = await TestAttempt.find(TestAttempt.student_id == user.id).sort(-TestAttempt.started_at).to_list()
    return {"attempts": jsonable_encoder(attempts)}
