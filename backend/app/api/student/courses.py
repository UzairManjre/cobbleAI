from fastapi import APIRouter, Depends
from typing import List
import uuid
from app.api.auth import current_active_user
from app.models.user import User
from app.schemas.course import CourseRead, JoinCourseRequest
from app.services.course_service import CourseService

router = APIRouter(prefix="/courses", tags=["courses (student)"])

def require_role(required_role: str):
    def role_checker(user: User = Depends(current_active_user)):
        from fastapi import HTTPException
        if user.role != required_role:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return user
    return role_checker

@router.get("/", response_model=List[CourseRead])
async def list_courses(user: User = Depends(require_role("student"))):
    courses = await CourseService.list_courses(user)
    return [CourseRead(
        id=c.id,
        professor_id=c.professor_id,
        title=c.title,
        code=c.code,
        description=c.description,
        schedule=c.schedule,
        created_at=c.created_at,
        docs_count=c.docs_count,
        status="ready"
    ) for c in courses]

@router.get("/{course_id}")
async def get_course(course_id: str, user: User = Depends(require_role("student"))):
    return await CourseService.get_course(user, course_id)

@router.post("/join")
async def join_course(req: JoinCourseRequest, user: User = Depends(require_role("student"))):
    return await CourseService.join_course(user, req.code)
