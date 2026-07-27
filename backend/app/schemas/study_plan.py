from pydantic import BaseModel
from typing import List, Optional

class GeneratePlanRequest(BaseModel):
    course_id: str
    goals: List[str] = []
    time_commitment_hours_per_week: int = 5
    duration_weeks: int = 4

class CompleteTopicRequest(BaseModel):
    topic_id: str

class CompleteExerciseRequest(BaseModel):
    topic_id: str
    exercise_index: int

class UpdateTopicProgressRequest(BaseModel):
    topic_id: str
    time_spent_minutes: int
    completed: bool
