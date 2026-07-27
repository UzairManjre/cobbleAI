from typing import List
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.models.user import User
from app.models.course import Course, Enrolment, CourseInvite
from app.schemas.course import CourseCreate, InviteCreate
from app.models.study_plan import StudyPlan, StudyProgress
from app.models.graph import KnowledgeGraph
from beanie.operators import In
import hashlib

class CourseService:
    @staticmethod
    async def create_course(user: User, course_in: CourseCreate) -> Course:
        course = Course(
            professor_id=user.id,
            title=course_in.title,
            code=course_in.code,
            description=course_in.description,
            schedule=course_in.schedule
        )
        await course.insert()
        return course

    @staticmethod
    async def list_courses(user: User) -> List[Course]:
        if user.role == "professor":
            return await Course.find(Course.professor_id == user.id).to_list()
        else:
            enrolments = await Enrolment.find(Enrolment.student_id == user.id).to_list()
            course_ids = [e.course_id for e in enrolments]
            return await Course.find(In(Course.id, course_ids)).to_list()

    @staticmethod
    async def get_course(user: User, course_id: str) -> dict:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
        course = await Course.get(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
            
        if user.role == "professor" and course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")
            
        if user.role == "student":
            enrolment = await Enrolment.find_one(
                Enrolment.course_id == course_uuid,
                Enrolment.student_id == user.id
            )
            if not enrolment and str(course.professor_id) != str(user.id):
                raise HTTPException(status_code=403, detail="Not enrolled")
                
        graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
        graph_id = str(graph.id) if graph else None
        
        return {
            "id": course.id,
            "professor_id": course.professor_id,
            "title": course.title,
            "code": course.code,
            "description": course.description,
            "schedule": course.schedule,
            "created_at": course.created_at,
            "graph_id": graph_id
        }

    @staticmethod
    async def create_invite(user: User, course_id: uuid.UUID, invite_in: InviteCreate) -> CourseInvite:
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
        return invite

    @staticmethod
    async def join_course(user: User, code: str) -> dict:
        invite = await CourseInvite.find_one(CourseInvite.code == code)
        if not invite:
            raise HTTPException(404, "Invalid invite code")

        expires_at = invite.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
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
        return {"message": "Successfully enrolled", "course_id": invite.course_id}

    @staticmethod
    async def get_professor_students(user: User) -> List[dict]:
        if user.role != "professor":
            raise HTTPException(status_code=403, detail="Not enough permissions")

        courses = await Course.find(Course.professor_id == user.id).to_list()
        course_map = {c.id: c.title for c in courses}
        course_ids = list(course_map.keys())
        if not course_ids:
            return []

        enrolments = await Enrolment.find(In(Enrolment.course_id, course_ids)).to_list()
        student_course_map = {}
        for e in enrolments:
            if e.student_id not in student_course_map:
                student_course_map[e.student_id] = []
            student_course_map[e.student_id].append(e.course_id)
            
        student_ids = list(student_course_map.keys())
        if not student_ids:
            return []

        students = await User.find(In(User.id, student_ids)).to_list()
        student_details = {s.id: s for s in students}

        study_plans = await StudyPlan.find(
            In(StudyPlan.course_id, course_ids),
            In(StudyPlan.student_id, student_ids),
            StudyPlan.status == "active"
        ).to_list()
        
        plan_map = {p.id: p for p in study_plans}
        plan_ids = list(plan_map.keys())
        progress_records = await StudyProgress.find(In(StudyProgress.study_plan_id, plan_ids)).to_list()
        
        progress_map = {}
        for pr in progress_records:
            plan = plan_map.get(pr.study_plan_id)
            if plan:
                progress_map[(pr.student_id, plan.course_id)] = {
                    "progress": pr,
                    "total_topics": plan.total_topics
                }

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
