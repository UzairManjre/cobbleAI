"""Professor insights: weekly question clusters and the course FAQ built from them.

Insights store aggregates and LLM paraphrases only, never student names or raw chats.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


def _utcnow():
    return datetime.now(timezone.utc)


class QuestionCluster(BaseModel):
    cluster_id: int
    size: int
    topic: str
    misconception: Optional[str] = None
    representative_question: Optional[str] = None  # LLM paraphrase, never a student's own words
    node_ids: List[str] = []
    node_labels: List[str] = []
    declined: int = 0  # questions in this cluster the tutor could not answer from the materials
    weak_support: int = 0
    labelled_by: str = "llm"  # llm | keywords


class QuestionInsight(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    period_start: datetime
    period_end: datetime
    n_questions: int = 0
    n_students: int = 0
    clusters: List[QuestionCluster] = []
    method: Dict = {}  # embedding model, linkage, distance threshold, labeller
    generated_by: str = "on_demand"  # on_demand | weekly_task
    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "question_insights"
        indexes = [IndexModel([("course_id", 1), ("created_at", -1)])]


class FAQEntry(Document):
    """An FAQ item drafted from a question cluster; students only see it once published."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    question: str
    answer: str = ""
    citations: List[Dict] = []
    status: str = "draft"  # draft | published
    order: int = 0
    insight_id: Optional[uuid.UUID] = None
    cluster_topic: Optional[str] = None
    cluster_size: Optional[int] = None
    run_id: Optional[uuid.UUID] = None  # tutor run that drafted the answer
    support_level: Optional[str] = None
    edited: bool = False  # the professor changed the drafted text
    created_by: Optional[uuid.UUID] = None
    updated_by: Optional[uuid.UUID] = None
    published_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "faq_entries"
        indexes = [IndexModel([("course_id", 1), ("status", 1), ("order", 1)])]
