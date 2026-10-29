"""Learner model v2 (Upgrade B): per-concept mastery, instructor difficulty labels, fitted models."""

from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


def _utcnow():
    return datetime.now(timezone.utc)


class ConceptMastery(Document):
    """Bayesian Knowledge Tracing estimate that a student has mastered one concept."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    student_id: uuid.UUID
    course_id: uuid.UUID
    node_id: str
    p_mastery: float
    n_obs: int = 0
    n_correct: int = 0
    params_version: Optional[str] = None  # which BKT parameters produced the estimate
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "concept_mastery"
        indexes = [
            IndexModel([("student_id", 1), ("course_id", 1), ("node_id", 1)], unique=True),
            IndexModel([("course_id", 1), ("node_id", 1)]),
        ]


class ConceptDifficultyLabel(Document):
    """Instructor judgement of whether students struggle with a concept (ground truth for RQ2/S4).
    A second rater on a subset gives inter-rater agreement."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    node_id: str
    rater_id: uuid.UUID
    rater_slot: str = "primary"  # primary | secondary
    struggling: bool
    difficulty: Optional[str] = None  # easy | medium | hard
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "concept_difficulty_labels"
        indexes = [
            IndexModel([("course_id", 1), ("node_id", 1), ("rater_slot", 1)], unique=True),
        ]


class LearnerModelVersion(Document):
    """A fitted learner-model component, kept so every flag can be traced to its model."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    kind: str  # bkt | confusion
    course_id: Optional[uuid.UUID] = None  # None = global (e.g. BKT fitted on ASSISTments)
    params: Dict = {}  # bkt: p_init, p_learn, p_slip, p_guess
    features: List[str] = []  # confusion: feature order for coefficients/means/stds
    coefficients: List[float] = []
    intercept: float = 0.0
    feature_means: List[float] = []
    feature_stds: List[float] = []
    threshold: float = 0.5
    metrics: Dict = {}  # cross-validated metrics, and the v1 heuristic's on the same labels
    n_labels: int = 0
    trained_on: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "learner_model_versions"
        indexes = [IndexModel([("kind", 1), ("course_id", 1), ("created_at", -1)])]
