from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid

class QuizQuestion(BaseModel):
    question_id: str
    type: str # mcq, short_answer, true_false
    question_text: str
    options: Optional[List[str]] = None
    correct_answer: str
    student_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    explanation: str
    source_chunk_id: str

class QuizAttempt(BaseModel):
    id: uuid.UUID = Field(alias="_id")
    student_id: uuid.UUID
    course_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None
    questions: List[QuizQuestion]
    score: Optional[float] = None
    started_at: datetime
    submitted_at: Optional[datetime] = None
    time_taken_sec: Optional[int] = None
