"""
AnalyticsEvent   Immutable append-only event log.

The core warehouse table. Every user action across the platform is recorded
here as an immutable event. Think Snowplow/Segment-style event tracking.

TTL Index: Raw events should be kept for 90 days. Configure in MongoDB:
    db.analytics_events.createIndex({"timestamp": 1}, {expireAfterSeconds: 7776000})
"""

from beanie import Document
from pymongo import IndexModel
from typing import Optional, Dict
from datetime import datetime, timezone
from pydantic import Field
import uuid


def _utcnow():
    return datetime.now(timezone.utc)


class AnalyticsEvent(Document):
    #   Who  
    user_id: uuid.UUID
    user_role: str  # "student" | "professor"

    #   What  
    event_type: str       # e.g. "node_visited", "question_asked"
    event_category: str   # e.g. "navigation", "chat", "llm"

    #   Context (foreign keys, optional per event)  
    course_id: Optional[uuid.UUID] = None
    graph_id: Optional[uuid.UUID] = None
    session_id: Optional[uuid.UUID] = None
    node_id: Optional[str] = None          # Which concept node
    document_id: Optional[uuid.UUID] = None

    #   Flexible payload  
    payload: Dict = {}   # Event-specific metrics (varies by event_type)

    #   When  
    timestamp: datetime = Field(default_factory=_utcnow)

    #   Technical metadata  
    platform: str = "web"
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None

    class Settings:
        name = "analytics_events"
        indexes = [
            IndexModel("user_id"),
            IndexModel("event_type"),
            IndexModel("event_category"),
            IndexModel("course_id"),
            IndexModel("graph_id"),
            IndexModel("session_id"),
            IndexModel("node_id"),
            IndexModel("document_id"),
            IndexModel("timestamp"),
            # Composite indexes for common queries
            IndexModel([("user_id", 1), ("timestamp", -1)]),
            IndexModel([("course_id", 1), ("timestamp", -1)]),
            IndexModel([("event_category", 1), ("timestamp", -1)]),
            IndexModel([("node_id", 1), ("timestamp", -1)]),
        ]

    def __repr__(self):
        return (
            f"<AnalyticsEvent user={self.user_id} "
            f"type={self.event_type} ts={self.timestamp}>"
        )
