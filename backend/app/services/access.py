"""Course-level access checks shared by routers."""

import uuid
from fastapi import HTTPException

from app.models.course import Course, Enrolment
from app.models.user import User


async def ensure_course_access(user: User, course_id: uuid.UUID) -> Course:
    """Professors must own the course; students must be enrolled in it."""
    course = await Course.get(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if user.role == "professor":
        if course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")
    else:
        enrolment = await Enrolment.find_one(
            Enrolment.student_id == user.id,
            Enrolment.course_id == course_id,
        )
        if not enrolment:
            raise HTTPException(status_code=403, detail="Not enrolled in this course")
    return course


async def ensure_course_owner(user: User, course_id: uuid.UUID) -> Course:
    course = await Course.get(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.professor_id != user.id:
        raise HTTPException(status_code=403, detail="Not your course")
    return course
