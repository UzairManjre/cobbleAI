from beanie import Document
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import Field, BaseModel
import uuid

def _utcnow():
    return datetime.now(timezone.utc)

class Exercise(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    type: str  # code, quiz, hands-on, reflection, reading
    title: str
    description: str
    difficulty: str = "medium"  # easy, medium, hard
    solution: Optional[str] = None
    hints: List[str] = []
    estimated_time_minutes: int = 15

class TopicPlan(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    order: int
    node_id: str
    node_label: str
    node_description: Optional[str] = None
    estimated_time_minutes: int = 30
    difficulty: str = "medium"  # easy, medium, hard
    prerequisites: List[str] = []  # List of node_ids
    learning_objectives: List[str] = []
    key_concepts: List[str] = []
    exercises: List[Exercise] = []
    document_references: List[str] = []  # Filenames
    notes: Optional[str] = None

class StudyPlan(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    graph_id: uuid.UUID
    student_id: uuid.UUID

    title: str
    description: str
    total_topics: int = 0
    estimated_duration_hours: float = 0.0
    topics: List[TopicPlan] = []

    status: str = "draft"  # draft, active, completed, archived

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "study_plans"
        indexes = [
            "course_id",
            "graph_id",
            "student_id",
            "status",
        ]

class StudyProgress(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    study_plan_id: uuid.UUID
    student_id: uuid.UUID

    completed_topics: List[str] = []  # node_ids of completed topics
    completed_exercises: List[uuid.UUID] = []  # exercise ids
    time_spent_minutes: int = 0

    current_topic_index: int = 0
    last_accessed_at: datetime = Field(default_factory=_utcnow)
    started_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "study_progress"
        indexes = [
            "study_plan_id",
            "student_id",
        ]

class TopicStudyPlan(Document):
    """Individual topic-level study plan for deep-dive learning."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    student_id: uuid.UUID
    node_id: str  # The graph node this plan is for

    title: str
    description: str
    estimated_time_minutes: int = 60

    # Deep-dive content
    learning_path: List[Dict[str, Any]] = []  # Ordered steps: [{"step": 1, "type": "read", "title": "...", "content": "..."}]
    exercises: List[Exercise] = []
    related_documents: List[str] = []  # Filenames
    related_topics: List[Dict[str, str]] = []  # [{node_id, label, relation}]

    # Self-assessment
    self_check_questions: List[Dict[str, Any]] = []  # [{question, answer, explanation}]

    status: str = "pending"  # pending, in_progress, completed
    progress: float = 0.0  # 0-100

    created_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "topic_study_plans"
        indexes = [
            "course_id",
            "student_id",
            "node_id",
            "status",
        ]
