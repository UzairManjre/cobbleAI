"""
AnalyticsAggregate   Pre-computed roll-up tables for fast dashboard queries.

Updated by scheduled Celery jobs (hourly/daily/weekly).
These aggregates power the analytics dashboards without scanning
the raw event log every time.
"""

from beanie import Document
from pymongo import IndexModel
from typing import Optional, Dict
from datetime import datetime, date, timezone
from pydantic import Field
import uuid


def _utcnow():
    return datetime.now(timezone.utc)


class AnalyticsAggregate(Document):
    #   What kind of aggregate  
    aggregate_type: str  # "user_daily" | "user_weekly" | "course_daily" | "node_daily" | "global_daily"

    #   Dimension keys (which slice this covers)  
    user_id: Optional[uuid.UUID] = None
    course_id: Optional[uuid.UUID] = None
    node_id: Optional[str] = None
    date: date  # The day this aggregate covers

    #   Pre-computed metrics  
    metrics: Dict = {}
    # Examples:
    # {
    #   "sessions_count": 5,
    #   "total_time_sec": 1800,
    #   "questions_asked": 23,
    #   "nodes_visited": 12,
    #   "unique_nodes_visited": 8,
    #   "avg_question_length": 45,
    #   "avg_response_latency_ms": 1200,
    #   "rag_success_rate": 0.92,
    #   "most_active_hour": 14,
    #   "topics_asked_about": ["ML", "Neural Networks"],
    #   "documents_retrieved": ["doc1.pdf", "doc2.pdf"]
    # }

    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "analytics_aggregates"
        indexes = [
            IndexModel("aggregate_type"),
            IndexModel("user_id"),
            IndexModel("course_id"),
            IndexModel("node_id"),
            IndexModel("date"),
            # Composite: query by type + date range
            IndexModel([("aggregate_type", 1), ("date", -1)]),
            IndexModel([("aggregate_type", 1), ("user_id", 1), ("date", -1)]),
            IndexModel([("aggregate_type", 1), ("course_id", 1), ("date", -1)]),
            IndexModel([("aggregate_type", 1), ("node_id", 1), ("date", -1)]),
        ]

    def __repr__(self):
        return (
            f"<AnalyticsAggregate type={self.aggregate_type} "
            f"date={self.date}>"
        )
