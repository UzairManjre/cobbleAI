from pydantic import BaseModel
from typing import List, Optional

class CreateTestRequest(BaseModel):
    course_id: str
    title: str
    description: str
    instructions: Optional[str] = None
    duration_minutes: int = 60
    passing_percentage: float = 40.0
    test_type: str = "assignment"
    available_from: Optional[str] = None
    available_until: Optional[str] = None
    shuffle_questions: bool = False
    show_results_immediately: bool = False

class GenerateTestRequest(BaseModel):
    course_id: str
    question_count: int = 10
    question_types: List[str] = ["mcq", "short_answer", "true_false"]
    difficulty_distribution: dict = {"easy": 0.3, "medium": 0.5, "hard": 0.2}
    document_context: Optional[str] = None
    topics_filter: List[str] = []

class SubmitAnswerRequest(BaseModel):
    question_id: str
    answer_type: str
    answer_text: Optional[str] = None
    selected_option_id: Optional[str] = None
    selected_options: List[str] = []
    time_spent_seconds: int = 0

class SubmitTestRequest(BaseModel):
    attempt_id: str
    answers: List[SubmitAnswerRequest]
    last_saved_at: Optional[str] = None
    is_auto_save: bool = False

class GenerateMockTestRequest(BaseModel):
    course_id: str
    question_count: int = 10
    focus_topics: List[str] = []
