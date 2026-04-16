from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.api.auth import current_active_user
from app.models.user import User
from app.models.course import Course, Enrolment, CourseInvite
from app.schemas.course import CourseRead, CourseCreate, InviteRead, InviteCreate, JoinCourseRequest
from app.models.study_plan import StudyPlan, StudyProgress
from beanie.operators import In
import uuid
import secrets
import asyncio
import hashlib
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

@router.get("/professor/students")
async def get_professor_students(
    user: User = Depends(current_active_user)
):
    """Get all students enrolled in all courses owned by the professor."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # 1. Get all courses owned by this professor
    courses = await Course.find(Course.professor_id == user.id).to_list()
    course_map = {c.id: c.title for c in courses}
    course_ids = list(course_map.keys())

    if not course_ids:
        return []

    # 2. Get all enrolments for these courses
    enrolments = await Enrolment.find(In(Enrolment.course_id, course_ids)).to_list()
    
    # Map student_id -> list of course_ids they are enrolled in
    student_course_map = {}
    for e in enrolments:
        if e.student_id not in student_course_map:
            student_course_map[e.student_id] = []
        student_course_map[e.student_id].append(e.course_id)
        
    student_ids = list(student_course_map.keys())
    if not student_ids:
        return []

    # 3. Get User details for these students
    students = await User.find(In(User.id, student_ids)).to_list()
    student_details = {s.id: s for s in students}

    # 4. Get StudyProgress for these students across these courses
    study_plans = await StudyPlan.find(
        In(StudyPlan.course_id, course_ids),
        In(StudyPlan.student_id, student_ids),
        StudyPlan.status == "active"
    ).to_list()
    
    plan_map = {p.id: p for p in study_plans}
    plan_ids = list(plan_map.keys())
    
    progress_records = await StudyProgress.find(In(StudyProgress.study_plan_id, plan_ids)).to_list()
    
    # Map (student_id, course_id) -> progress_record
    progress_map = {}
    for pr in progress_records:
        plan = plan_map.get(pr.study_plan_id)
        if plan:
            progress_map[(pr.student_id, plan.course_id)] = {
                "progress": pr,
                "total_topics": plan.total_topics
            }

    # 5. Assemble final response
    results = []
    
    for student_id, enrolled_courses in student_course_map.items():
        stu = student_details.get(student_id)
        if not stu:
            continue
            
        hash_val = int(hashlib.md5(str(student_id).encode()).hexdigest(), 16)
        pic_id = (hash_val % 90) + 1
            
        for cid in enrolled_courses:
            course_title = course_map.get(cid, "Unknown Course")
            
            progress_percent = 0
            status = "Not Started"
            
            prog_data = progress_map.get((student_id, cid))
            if prog_data:
                pr = prog_data["progress"]
                total = prog_data["total_topics"]
                
                if total > 0:
                    progress_percent = int((len(pr.completed_topics) / total) * 100)
                else:
                    progress_percent = 100
                    
                if pr.last_accessed_at:
                    days_since_access = (datetime.now(timezone.utc) - pr.last_accessed_at).days
                    if days_since_access > 7:
                        status = "Inactive"
                    else:
                        status = "Learning"
                else:
                    status = "Not Started"

            results.append({
                "id": str(student_id) + "_" + str(cid),
                "name": stu.name,
                "bg": f"{pic_id}.jpg",
                "cls": course_title,
                "progress": progress_percent,
                "status": status,
                "flagIcon": status == "Inactive" or (status == "Learning" and progress_percent < 20)
            })

    return results
