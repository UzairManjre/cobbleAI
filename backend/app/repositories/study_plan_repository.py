from typing import List
import uuid
from beanie.operators import In
from app.models.study_plan import StudyPlan, StudyProgress
from app.repositories.base import BaseRepository

class StudyPlanRepository(BaseRepository[StudyPlan]):
    def __init__(self):
        super().__init__(model=StudyPlan)
        
    async def find_active_plan(self, course_id: uuid.UUID, student_id: uuid.UUID) -> StudyPlan:
        return await self.model.find_one(
            self.model.course_id == course_id,
            self.model.student_id == student_id,
            self.model.status == "active"
        )

    async def find_active_for_courses_and_students(self, course_ids: List[uuid.UUID], student_ids: List[uuid.UUID]) -> List[StudyPlan]:
        if not course_ids or not student_ids:
            return []
        return await self.model.find(
            In(self.model.course_id, course_ids),
            In(self.model.student_id, student_ids),
            self.model.status == "active"
        ).to_list()

class StudyProgressRepository(BaseRepository[StudyProgress]):
    def __init__(self):
        super().__init__(model=StudyProgress)
        
    async def find_by_study_plan_and_student(self, study_plan_id: uuid.UUID, student_id: uuid.UUID) -> StudyProgress:
        return await self.model.find_one(
            self.model.study_plan_id == study_plan_id,
            self.model.student_id == student_id
        )

    async def find_by_study_plans(self, study_plan_ids: List[uuid.UUID]) -> List[StudyProgress]:
        if not study_plan_ids:
            return []
        return await self.model.find(In(self.model.study_plan_id, study_plan_ids)).to_list()
