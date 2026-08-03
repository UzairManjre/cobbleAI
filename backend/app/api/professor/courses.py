from fastapi import APIRouter, Depends
from typing import List
import uuid
from app.api.auth import current_active_user, require_role
from app.models.user import User
from app.schemas.course import CourseRead, CourseCreate, InviteRead, InviteCreate
from app.services.course_service import CourseService

router = APIRouter(prefix="/courses", tags=["courses (professor)"])

@router.post("/", response_model=CourseRead)
async def create_course(course_in: CourseCreate, user: User = Depends(require_role("professor"))):
    course = await CourseService.create_course(user, course_in)
    return CourseRead(
        id=course.id,
        professor_id=course.professor_id,
        title=course.title,
        code=course.code,
        description=course.description,
        schedule=course.schedule,
        created_at=course.created_at,
        docs_count=course.docs_count,
        status="ready"
    )

@router.get("/", response_model=List[CourseRead])
async def list_courses(user: User = Depends(require_role("professor"))):
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

@router.get("/students")
async def get_professor_students(user: User = Depends(require_role("professor"))):
    return await CourseService.get_professor_students(user)

@router.get("/{course_id}")
async def get_course(course_id: str, user: User = Depends(require_role("professor"))):
    return await CourseService.get_course(user, course_id)

@router.post("/{course_id}/invite", response_model=InviteRead)
async def create_invite(course_id: uuid.UUID, invite_in: InviteCreate, user: User = Depends(require_role("professor"))):
    invite = await CourseService.create_invite(user, course_id, invite_in)
    return InviteRead(code=invite.code, expires_at=invite.expires_at)
