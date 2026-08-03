from fastapi import APIRouter, Depends
from app.api.auth import current_active_user, require_role
from app.models.user import User
from app.schemas.study_plan import GeneratePlanRequest
from app.services.study_plan_service import StudyPlanService

router = APIRouter(prefix="/study-plans", tags=["study-plans (student)"])

@router.post("/generate")
async def generate_study_plan(req: GeneratePlanRequest, user: User = Depends(require_role("student"))):
    return await StudyPlanService.generate_study_plan(user, req)

@router.delete("/active")
async def delete_active_plan(user: User = Depends(require_role("student"))):
    return await StudyPlanService.delete_active_plan(user)

@router.post("/regenerate")
async def regenerate_study_plan(req: GeneratePlanRequest, user: User = Depends(require_role("student"))):
    await StudyPlanService.delete_active_plan(user)
    return await StudyPlanService.generate_study_plan(user, req)

@router.get("/active/{course_id}")
async def get_active_plan(course_id: str, user: User = Depends(require_role("student"))):
    return await StudyPlanService.get_active_plan(user, course_id)

@router.post("/{course_id}/topic/{node_id}/complete")
async def complete_topic(course_id: str, node_id: str, user: User = Depends(require_role("student"))):
    return await StudyPlanService.complete_topic(user, course_id, node_id)

@router.post("/{course_id}/exercise/{exercise_id}/complete")
async def complete_exercise(course_id: str, exercise_id: str, user: User = Depends(require_role("student"))):
    return await StudyPlanService.complete_exercise(user, course_id, exercise_id)
