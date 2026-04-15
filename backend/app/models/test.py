from beanie import Document
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import Field, BaseModel
import uuid

def _utcnow():
    return datetime.now(timezone.utc)

# ── Question Models ──────────────────────────────────────────────────────────

class MCQOption(BaseModel):
    id: str
    text: str
    is_correct: bool = False

class Question(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    type: str  # mcq, short_answer, code, matching, true_false, essay
    question_text: str
    marks: float = 1.0
    difficulty: str = "medium"  # easy, medium, hard
    topic: Optional[str] = None  # Related graph node label
    
    # MCQ specific
    options: List[MCQOption] = []
    
    # Code specific
    starter_code: Optional[str] = None
    test_cases: List[Dict[str, Any]] = []  # [{input: ..., expected: ...}]
    
    # True/False specific
    correct_answer: Optional[bool] = None
    
    # Metadata
    explanation: Optional[str] = None  # Explanation of correct answer
    hints: List[str] = []
    document_references: List[str] = []  # Related filenames

# ── Test Model ───────────────────────────────────────────────────────────────

class Test(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    professor_id: uuid.UUID
    
    title: str
    description: str
    instructions: Optional[str] = None
    
    questions: List[Question] = []
    total_marks: float = 0.0
    
    # Settings
    duration_minutes: int = 60
    passing_percentage: float = 40.0
    shuffle_questions: bool = False
    shuffle_options: bool = False
    show_results_immediately: bool = False
    allow_retakes: bool = False
    max_attempts: int = 1
    
    # Scheduling
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    
    # Status
    status: str = "draft"  # draft, published, completed, archived
    
    # Type
    test_type: str = "assignment"  # assignment, mock_test, quiz, exam
    
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    published_at: Optional[datetime] = None
    
    class Settings:
        name = "tests"
        indexes = [
            "course_id",
            "professor_id",
            "status",
            "test_type",
        ]

# ── Student Attempt Models ──────────────────────────────────────────────────

class Answer(BaseModel):
    question_id: uuid.UUID
    question_type: str
    answer_text: Optional[str] = None  # For text/code answers
    selected_option_id: Optional[str] = None  # For MCQ
    selected_options: List[str] = []  # For multiple select
    time_spent_seconds: int = 0
    is_correct: Optional[bool] = None  # Auto-graded
    marks_awarded: Optional[float] = None
    graded_by: Optional[str] = None  # auto, professor_id
    feedback: Optional[str] = None  # For manual grading

class TestAttempt(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    test_id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    
    answers: List[Answer] = []
    total_marks_awarded: float = 0.0
    percentage: float = 0.0
    
    # Timing
    started_at: datetime = Field(default_factory=_utcnow)
    submitted_at: Optional[datetime] = None
    time_taken_seconds: Optional[int] = None

    # Status
    status: str = "in_progress"  # in_progress, submitted, graded

    # Auto-save tracking
    last_saved_at: datetime = Field(default_factory=_utcnow)
    is_auto_saved: bool = False
    
    class Settings:
        name = "test_attempts"
        indexes = [
            "test_id",
            "student_id",
            "course_id",
            "status",
        ]

# ── Mock Test Model (for practice) ──────────────────────────────────────────

class MockTest(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    student_id: uuid.UUID
    graph_id: Optional[uuid.UUID] = None
    
    title: str
    questions: List[Question] = []
    total_marks: float = 0.0
    duration_minutes: int = 30
    
    # Generated from
    generated_from: str = "graph"  # graph, documents, topics
    topics_included: List[str] = []  # node_ids
    
    created_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None
    
    # Result
    marks_obtained: Optional[float] = None
    percentage: Optional[float] = None
    answers: List[Answer] = []
    
    class Settings:
        name = "mock_tests"
        indexes = [
            "course_id",
            "student_id",
        ]

# ── Analytics Models ────────────────────────────────────────────────────────

class TestAnalytics(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    test_id: uuid.UUID
    course_id: uuid.UUID
    
    total_attempts: int = 0
    average_score: float = 0.0
    median_score: float = 0.0
    highest_score: float = 0.0
    lowest_score: float = 0.0
    
    # Question difficulty analysis
    question_stats: List[Dict[str, Any]] = []  # [{question_id, correct_percentage, avg_time}]
    
    # Score distribution
    score_distribution: List[Dict[str, Any]] = []  # [{range: "0-20", count: 5}]
    
    # Topic-wise performance
    topic_performance: List[Dict[str, Any]] = []  # [{topic, avg_score, question_count}]
    
    updated_at: datetime = Field(default_factory=_utcnow)
    
    class Settings:
        name = "test_analytics"
        indexes = [
            "test_id",
            "course_id",
        ]
