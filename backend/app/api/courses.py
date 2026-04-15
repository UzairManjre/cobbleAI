from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.api.auth import current_active_user
from app.models.user import User
from app.models.course import Course, Enrolment, CourseInvite
from app.schemas.course import CourseRead, CourseCreate, InviteRead, InviteCreate, JoinCourseRequest
import uuid
import secrets
import asyncio
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/courses", tags=["courses"])


def _safe_track_event(event_type, event_category, user_id, user_role, **kwargs):
    """Fire-and-forget event tracking that never breaks the route handler."""
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=event_type,
                event_category=event_category,
                user_id=user_id,
                user_role=user_role,
                **kwargs,
            )
        except Exception:
            pass
    asyncio.create_task(_track())


def require_role(required_role: str):
    def role_checker(user: User = Depends(current_active_user)):
        if user.role != required_role:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return user
    return role_checker

@router.post("/", response_model=CourseRead)
async def create_course(
    course_in: CourseCreate,
    user: User = Depends(require_role("professor"))
):
    course = Course(
        professor_id=user.id,
        title=course_in.title,
        code=course_in.code
    )
    await course.insert()

    # Track event
    _safe_track_event(
        "course_created", "course", user.id, user.role,
        course_id=course.id,
        payload={"title": course_in.title, "code": course_in.code},
    )

    return CourseRead(
        id=course.id,
        professor_id=course.professor_id,
        title=course.title,
        code=course.code,
        created_at=course.created_at,
        docs_count=course.docs_count,
        status="ready"
    )

@router.get("/", response_model=List[CourseRead])
async def list_courses(user: User = Depends(current_active_user)):
    if user.role == "professor":
        courses = await Course.find(Course.professor_id == user.id).to_list()
    else:
        enrolments = await Enrolment.find(Enrolment.student_id == user.id).to_list()
        course_ids = [e.course_id for e in enrolments]
        courses = await Course.find({"_id": {"$in": course_ids}}).to_list()

    return [
        CourseRead(
            id=c.id,
            professor_id=c.professor_id,
            title=c.title,
            code=c.code,
            created_at=c.created_at,
            docs_count=c.docs_count,
            status="ready"
        ) for c in courses
    ]

@router.get("/{course_id}")
async def get_course(course_id: str, user: User = Depends(current_active_user)):
    """Get a single course by ID."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = await Course.get(course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check access
    if user.role == "student":
        enrolment = await Enrolment.find_one(
            Enrolment.course_id == course_uuid,
            Enrolment.student_id == user.id
        )
        if not enrolment and str(course.professor_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not enrolled in this course")
    
    # Find associated graph
    from app.models.graph import KnowledgeGraph
    graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
    graph_id = str(graph.id) if graph else None
    
    return {
        "id": course.id,
        "professor_id": course.professor_id,
        "title": course.title,
        "code": course.code,
        "created_at": course.created_at,
        "graph_id": graph_id,
    }

@router.post("/{course_id}/invite", response_model=InviteRead)
async def create_invite(
    course_id: uuid.UUID,
    invite_in: InviteCreate,
    user: User = Depends(require_role("professor"))
):
    course = await Course.get(course_id)
    if not course or course.professor_id != user.id:
        raise HTTPException(404, "Course not found")

    code = secrets.token_urlsafe(6).upper()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=invite_in.expires_in_hours)

    invite = CourseInvite(
        course_id=course.id,
        code=code,
        expires_at=expires_at
    )
    await invite.insert()

    return InviteRead(code=invite.code, expires_at=invite.expires_at)

@router.post("/join")
async def join_course(
    req: JoinCourseRequest,
    user: User = Depends(require_role("student"))
):
    invite = await CourseInvite.find_one(CourseInvite.code == req.code)
    if not invite:
        raise HTTPException(404, "Invalid invite code")

    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Invite code expired")

    existing = await Enrolment.find_one(
        Enrolment.student_id == user.id,
        Enrolment.course_id == invite.course_id
    )
    if existing:
        return {"message": "Already enrolled", "course_id": invite.course_id}

    enrolment = Enrolment(
        course_id=invite.course_id,
        student_id=user.id
    )
    await enrolment.insert()

    # Track event
    _safe_track_event(
        "course_joined", "course", user.id, user.role,
        course_id=invite.course_id,
        payload={"invite_code": req.code},
    )

    return {"message": "Successfully enrolled", "course_id": invite.course_id}

@router.get("/{course_id}/students")
async def get_course_students(
    course_id: str,
    user: User = Depends(current_active_user)
):
    """Get all students enrolled in a course."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    course = await Course.get(course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check access - must be professor or enrolled student
    if user.role == "student":
        enrolment = await Enrolment.find_one(
            Enrolment.course_id == course_uuid,
            Enrolment.student_id == user.id
        )
        if not enrolment:
            raise HTTPException(status_code=403, detail="Not enrolled in this course")
    elif str(course.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Get all enrolments
    enrolments = await Enrolment.find(Enrolment.course_id == course_uuid).to_list()
    
    # Get user details for each student
    students = []
    for enrolment in enrolments:
        student_user = await User.get(enrolment.student_id)
        if student_user:
            students.append({
                "id": student_user.id,
                "name": student_user.name,
                "email": student_user.email,
                "enrolled_at": enrolment.created_at
            })

    return students
