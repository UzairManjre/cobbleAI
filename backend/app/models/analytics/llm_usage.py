"""
AnalyticsLLMUsage   Track every LLM call for cost, performance, and quality.

Powers admin dashboards for monitoring LLM health, estimating costs,
and detecting performance degradation over time.
"""

from beanie import Document
from pymongo import IndexModel
from typing import Optional
from datetime import datetime, timezone
from pydantic import Field
import uuid


def _utcnow():
    return datetime.now(timezone.utc)


class AnalyticsLLMUsage(Document):
    #   Context  
    user_id: Optional[uuid.UUID] = None
    session_id: Optional[uuid.UUID] = None

    #   Request details  
    endpoint: str  # "/sessions/{id}/ask" | "/chat/" | "/graph/generate"
    model: str  # "gemma4:e2b"
    prompt_text: Optional[str] = None  # First 200 chars for debugging
    question_topic: Optional[str] = None  # Extracted topic

    #   Performance  
    latency_ms: int = 0
    time_to_first_token_ms: Optional[int] = None
    response_length_chars: int = 0
    estimated_input_tokens: int = 0
    estimated_output_tokens: int = 0

    #   Quality  
    rag_retrieved_count: int = 0
    rag_success: bool = False
    error_message: Optional[str] = None

    #   Cost  
    estimated_cost_usd: Optional[float] = None

    timestamp: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "analytics_llm_usage"
        indexes = [
            IndexModel("user_id"),
            IndexModel("session_id"),
            IndexModel("endpoint"),
            IndexModel("model"),
            IndexModel("timestamp"),
            IndexModel("latency_ms"),
            # For error monitoring
            IndexModel([("error_message", 1), ("timestamp", -1)]),
            # For cost tracking
            IndexModel([("timestamp", -1), ("estimated_cost_usd", 1)]),
            # For performance monitoring
            IndexModel([("endpoint", 1), ("timestamp", -1), ("latency_ms", 1)]),
        ]

    def __repr__(self):
        return (
            f"<AnalyticsLLMUsage endpoint={self.endpoint} "
            f"latency={self.latency_ms}ms cost=${self.estimated_cost_usd}>"
        )
