from typing import List, Optional
import uuid
from beanie.operators import In
from app.models.test import Test, TestAttempt, MockTest
from app.repositories.base import BaseRepository

class TestRepository(BaseRepository[Test]):
    def __init__(self):
        super().__init__(model=Test)
        
    async def find_by_course(self, course_id: uuid.UUID) -> List[Test]:
        return await self.model.find(self.model.course_id == course_id).to_list()
        
    async def find_published_by_course(self, course_id: uuid.UUID) -> List[Test]:
        return await self.model.find(
            self.model.course_id == course_id, 
            self.model.status == "published"
        ).to_list()
        
    async def find_by_courses(self, course_ids: List[uuid.UUID]) -> List[Test]:
        if not course_ids:
            return []
        return await self.model.find(In(self.model.course_id, course_ids)).to_list()

class TestAttemptRepository(BaseRepository[TestAttempt]):
    def __init__(self):
        super().__init__(model=TestAttempt)
        
    async def find_by_student(self, student_id: uuid.UUID) -> List[TestAttempt]:
        return await self.model.find(self.model.student_id == student_id).sort(-self.model.started_at).to_list()
        
    async def find_by_test_and_student(self, test_id: uuid.UUID, student_id: uuid.UUID) -> List[TestAttempt]:
        return await self.model.find(
            self.model.test_id == test_id,
            self.model.student_id == student_id
        ).to_list()

class MockTestRepository(BaseRepository[MockTest]):
    def __init__(self):
        super().__init__(model=MockTest)
        
    async def find_by_student(self, student_id: uuid.UUID) -> List[MockTest]:
        return await self.model.find(self.model.student_id == student_id).to_list()
