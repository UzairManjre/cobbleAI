"""
AnalyticsNodeMetrics — Per-node analytics for concept difficulty scoring.

Allows teachers to see which concepts students struggle with most.
Aggregated from raw navigation and chat events by scheduled Celery jobs.
"""

from beanie import Document
from pymongo import IndexModel
from typing import Optional, Dict
from datetime import datetime, timezone
from pydantic import Field
import uuid


def _utcnow():
    return datetime.now(timezone.utc)


class AnalyticsNodeMetrics(Document):
    # ── Identity ─────────────────────────────────────
    graph_id: uuid.UUID
    node_id: str
    node_label: str  # Denormalized for easy querying
    course_id: Optional[uuid.UUID] = None

    # ── Visit metrics ────────────────────────────────
    total_visits: int = 0
    unique_students: int = 0
    total_time_spent_sec: int = 0
    avg_time_per_visit_sec: float = 0.0
    avg_dwell_time_sec: float = 0.0
    revisit_rate: float = 0.0  # % of students who came back to this node

    # ── Engagement metrics ───────────────────────────
    total_questions_asked: int = 0
    avg_questions_per_student: float = 0.0

    # ── Difficulty indicators ────────────────────────
    confusion_score: float = 0.0  # Derived: high revisits + high time + many questions
    position_in_graph: int = 0  # Average BFS depth from root

    # ── RAG metrics ──────────────────────────────────
    retrieval_count: int = 0  # How many times RAG pulled context for this node's topic

    # ── Time distribution ────────────────────────────
    hour_distribution: Dict = {}       # {0: 2, 1: 0, ... 23: 15} — visits per hour
    day_of_week_distribution: Dict = {}  # {0: 10, 1: 15, ... 6: 8}

    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "analytics_node_metrics"
        indexes = [
            IndexModel("graph_id"),
            IndexModel("node_id"),
            IndexModel("course_id"),
            # Unique: one doc per (graph, node)
            IndexModel([("graph_id", 1), ("node_id", 1)], unique=True),
            # For ranking by confusion/difficulty
            IndexModel([("course_id", 1), ("confusion_score", -1)]),
            IndexModel([("graph_id", 1), ("total_visits", -1)]),
            IndexModel([("graph_id", 1), ("total_questions_asked", -1)]),
        ]

    def __repr__(self):
        return (
            f"<AnalyticsNodeMetrics node={self.node_label} "
            f"visits={self.total_visits} confusion={self.confusion_score:.2f}>"
        )
