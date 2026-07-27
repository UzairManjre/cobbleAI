from fastapi import APIRouter
from . import tests, courses, study_plans, sessions

router = APIRouter(prefix="/student", tags=["student"])
router.include_router(tests.router)
router.include_router(courses.router)
router.include_router(study_plans.router)
router.include_router(sessions.router)
