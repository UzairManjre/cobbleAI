from beanie import Document
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Any
import uuid
from datetime import datetime, timezone

def _utcnow():
    return datetime.now(timezone.utc)

class RubricCriterion(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    description: str
    max_points: float

class Rubric(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    assignment_id: uuid.UUID
    criteria: List[RubricCriterion]
    created_at: datetime = Field(default_factory=_utcnow)

class CriterionDraft(BaseModel):
    criterion_id: uuid.UUID
    suggested_score: float
    suggested_feedback: str
    ai_reasoning: str
    override_score: Optional[float] = None
    override_feedback: Optional[str] = None
    evidence_quote: Optional[str] = None  # verified quote from the submission supporting the score
    confidence: Optional[float] = None  # model's 0-1 confidence; 0 when its output could not be parsed

class EditHistoryRecord(BaseModel):
    timestamp: datetime = Field(default_factory=_utcnow)
    editor_id: uuid.UUID
    field: str
    old_value: Any
    new_value: Any

class GradingDraft(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    submission_id: uuid.UUID
    rubric_id: uuid.UUID
    status: Literal['drafting', 'needs_review', 'anomaly_flagged', 'approved', 'published']
    anomaly_reason: Optional[str] = None
    criteria_evaluations: List[CriterionDraft]
    total_score: float = 0.0
    approved_by_professor_id: Optional[uuid.UUID] = None
    edit_history: List[EditHistoryRecord] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

class RegradeRequest(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    grading_draft_id: uuid.UUID
    criterion_id: uuid.UUID
    student_comment: str
    status: Literal['pending', 'resolved_score_changed', 'resolved_score_maintained'] = 'pending'
    professor_reply: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by_id: Optional[uuid.UUID] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
