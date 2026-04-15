"""
AnalyticsUserProfile — Persistent per-student learning profile.

Grows over time as the student interacts with the platform.
Updated by scheduled Celery jobs and by event tracking in real-time.
Used by professors to understand individual learning patterns
and by the recommendation engine to suggest next topics.
"""

from beanie import Document
from pymongo import IndexModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
from pydantic import Field
import uuid


def _utcnow():
    return datetime.now(timezone.utc)


class AnalyticsUserProfile(Document):
    user_id: uuid.UUID

    # ── Lifetime stats ───────────────────────────────
    lifetime_stats: Dict = {}
    # {
    #   "total_sessions": 45,
    #   "total_study_time_sec": 86400,
    #   "total_questions_asked": 312,
    #   "total_nodes_visited": 67,
    #   "total_graphs_explored": 8,
    #   "total_courses_enrolled": 3,
    #   "first_session_date": "2025-03-01",
    #   "last_active_date": "2025-04-08",
    #   "study_streak_days": 12,
    #   "avg_session_duration_sec": 1920,
    #   "preferred_study_time": "evening",
    #   "learning_style": "exploratory",
    #   "struggle_concepts": ["Backpropagation", "Gradient Descent"],
    #   "strong_concepts": ["Python Basics", "Data Structures"]
    # }

    # ── Topic interests (derived from questions + nodes visited) ──
    topic_interests: List[Dict] = []
    # [{ "topic": "Machine Learning", "engagement_score": 0.85, "questions_asked": 45 }]

    # ── Performance indicators (for teachers) ─────────
    performance_indicators: Dict = {}
    # {
    #   "engagement_level": "high",
    #   "risk_of_dropout": "low",
    #   "knowledge_coverage_pct": 0.72,
    #   "question_sophistication_trend": "increasing"
    # }

    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "analytics_user_profiles"
        indexes = [
            IndexModel("user_id", unique=True),
            IndexModel([("lifetime_stats.last_active_date", -1)]),
            IndexModel([("performance_indicators.engagement_level", 1)]),
            IndexModel([("performance_indicators.risk_of_dropout", 1)]),
        ]

    def __repr__(self):
        return (
            f"<AnalyticsUserProfile user={self.user_id} "
            f"engagement={self.performance_indicators.get('engagement_level', 'unknown')}>"
        )
