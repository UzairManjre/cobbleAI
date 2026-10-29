"""Tutor run log — one document per tutor answer (live or evaluation).

Every number the evaluation reports must be traceable to logged runs, so a run
stores the question, the retrieval config and its hash, every candidate's
signals, the policy in force, the prompt version, model options and the outcome.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


def _utcnow():
    return datetime.now(timezone.utc)


class TutorRun(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    message_id: Optional[uuid.UUID] = None  # assistant ChatMessage this run produced

    # Who / where
    user_id: Optional[uuid.UUID] = None
    user_role: Optional[str] = None
    course_id: Optional[uuid.UUID] = None
    graph_id: Optional[uuid.UUID] = None
    session_id: Optional[uuid.UUID] = None
    node_id: Optional[str] = None
    endpoint: str = "session_ask"  # session_ask | course_ask | eval
    eval_run: Optional[str] = None  # evaluation harness run folder, when not live

    # Request
    mode: str = "teach"
    hint_level: Optional[str] = None
    question: str
    scope: Dict = {}

    # Retrieval
    expanded_queries: List[str] = []
    retrieval_config: Dict = {}
    config_hash: Optional[str] = None
    collection: Optional[str] = None
    candidates_considered: int = 0
    sources: List[Dict] = []  # chosen evidence, each with its per-signal scores
    top_support: float = 0.0
    retrieval_error: Optional[str] = None

    # Policy and generation
    policy: Dict = {}
    prompt_version: Optional[str] = None
    model: Optional[str] = None
    llm_options: Dict = {}

    # Outcome
    decision: str = "answered"  # answered | declined | error
    decline_reason: Optional[str] = None
    support_level: Optional[str] = None  # strong | weak | none
    cited_sids: List[str] = []
    answer: str = ""
    error: Optional[str] = None
    latency_ms: Dict[str, int] = {}
    tokens: Dict[str, int] = {}

    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "tutor_runs"
        indexes = [
            IndexModel("course_id"),
            IndexModel("created_at"),
            IndexModel("decision"),
            IndexModel("message_id"),
            IndexModel("eval_run"),
        ]


HINT_LEVELS = ["nudge", "guiding_question", "worked_step", "full_answer"]


class TopicPolicyOverride(BaseModel):
    node_id: str
    max_hint_level: Optional[str] = None
    allow_full_answers: Optional[bool] = None


class TutorPolicy(Document):
    """Instructor-controlled tutor boundaries for one course (with per-topic overrides)."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    max_hint_level: str = "full_answer"
    default_hint_level: str = "guiding_question"
    allow_full_answers: bool = True
    # Answer reveals are switched off while assessment mode is on...
    assessment_mode: bool = False
    # ...and automatically for a student who has a test attempt in progress
    auto_assessment_mode: bool = True
    scope: str = "course_materials"  # course_materials | selected_documents
    allowed_doc_ids: List[str] = []
    cite_or_decline: bool = True
    topic_overrides: List[TopicPolicyOverride] = []
    updated_by: Optional[uuid.UUID] = None
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "tutor_policies"
        indexes = [IndexModel("course_id", unique=True)]


class AnswerFeedback(Document):
    """One-click rating on a tutor answer; 'wrong' and 'not_in_notes' go to the instructor's review list."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    message_id: uuid.UUID
    run_id: Optional[uuid.UUID] = None
    student_id: uuid.UUID
    course_id: Optional[uuid.UUID] = None
    node_id: Optional[str] = None
    rating: str  # helpful | wrong | not_in_notes
    comment: Optional[str] = None
    question: Optional[str] = None
    status: str = "open"  # open | resolved (instructor reviewed it)
    resolved_by: Optional[uuid.UUID] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "answer_feedback"
        indexes = [
            IndexModel([("message_id", 1), ("student_id", 1)], unique=True),
            IndexModel("course_id"),
            IndexModel("rating"),
        ]
