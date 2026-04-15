"""
Analytics models module.

All analytics-related Beanie documents live here for high cohesion.
Each document maps to a dedicated MongoDB collection for loose coupling
from core business models (users, courses, graphs, etc.).
"""

from app.models.analytics.event import AnalyticsEvent
from app.models.analytics.aggregate import AnalyticsAggregate
from app.models.analytics.user_profile import AnalyticsUserProfile
from app.models.analytics.node_metrics import AnalyticsNodeMetrics
from app.models.analytics.llm_usage import AnalyticsLLMUsage
from app.models.analytics.rag_performance import AnalyticsRAGPerformance

__all__ = [
    "AnalyticsEvent",
    "AnalyticsAggregate",
    "AnalyticsUserProfile",
    "AnalyticsNodeMetrics",
    "AnalyticsLLMUsage",
    "AnalyticsRAGPerformance",
]
