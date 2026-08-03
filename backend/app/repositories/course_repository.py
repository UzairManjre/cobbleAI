from typing import List
import uuid
from beanie.operators import In
from app.models.course import Course, Enrolment, CourseInvite
from app.repositories.base import BaseRepository

class CourseRepository(BaseRepository[Course]):
    def __init__(self):
        super().__init__(model=Course)
        
    async def find_by_professor(self, professor_id: uuid.UUID) -> List[Course]:
        return await self.model.find(self.model.professor_id == professor_id).to_list()
        
    async def find_by_ids(self, course_ids: List[uuid.UUID]) -> List[Course]:
        if not course_ids:
            return []
        return await self.model.find(In(self.model.id, course_ids)).to_list()

class EnrolmentRepository(BaseRepository[Enrolment]):
    def __init__(self):
        super().__init__(model=Enrolment)
        
    async def find_by_student(self, student_id: uuid.UUID) -> List[Enrolment]:
        return await self.model.find(self.model.student_id == student_id).to_list()
        
    async def find_by_student_and_course(self, student_id: uuid.UUID, course_id: uuid.UUID) -> Enrolment | None:
        return await self.model.find_one(
            self.model.student_id == student_id,
            self.model.course_id == course_id
        )
        
    async def find_by_courses(self, course_ids: List[uuid.UUID]) -> List[Enrolment]:
        if not course_ids:
            return []
        return await self.model.find(In(self.model.course_id, course_ids)).to_list()

class CourseInviteRepository(BaseRepository[CourseInvite]):
    def __init__(self):
        super().__init__(model=CourseInvite)
        
    async def find_by_code(self, code: str) -> CourseInvite | None:
        return await self.model.find_one(self.model.code == code)
