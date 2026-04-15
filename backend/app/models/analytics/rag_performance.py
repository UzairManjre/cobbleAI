"""
AnalyticsRAGPerformance — Monitor retrieval quality and pipeline health.

Tracks every RAG query to answer:
- Are we retrieving useful context?
- Which documents are most often retrieved?
- How fast is the retrieval pipeline?
- Does retrieval quality correlate with student satisfaction?
"""

from beanie import Document
from pymongo import IndexModel
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import Field
import uuid


def _utcnow():
    return datetime.now(timezone.utc)


class AnalyticsRAGPerformance(Document):
    # ── Context ──────────────────────────────────────
    course_id: uuid.UUID
    query_text: str  # First 200 chars
    query_embedding_preview: Optional[List[float]] = None  # First 10 dims for debugging

    # ── Retrieval ────────────────────────────────────
    retrieved_count: int = 0  # How many docs Qdrant returned
    rerank_applied: bool = False
    final_context_count: int = 0  # After reranking

    # ── Latency breakdown ────────────────────────────
    embedding_latency_ms: int = 0
    qdrant_search_latency_ms: int = 0
    reranker_latency_ms: int = 0
    total_retrieval_latency_ms: int = 0

    # ── Source quality ───────────────────────────────
    source_doc_ids: List[str] = []
    source_relevance_scores: List[float] = []
    avg_relevance_score: float = 0.0

    # ── Downstream impact ────────────────────────────
    led_to_successful_answer: bool = True  # Did LLM produce a good answer?
    follow_up_question_asked: bool = False  # Student asked again (signal of poor answer)

    timestamp: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "analytics_rag_performance"
        indexes = [
            IndexModel("course_id"),
            IndexModel("timestamp"),
            IndexModel("retrieved_count"),
            IndexModel("avg_relevance_score"),
            # For document effectiveness analysis
            IndexModel([("course_id", 1), ("source_doc_ids", 1)]),
            # For pipeline health
            IndexModel([("timestamp", -1), ("led_to_successful_answer", 1)]),
            # For latency monitoring
            IndexModel([("timestamp", -1), ("total_retrieval_latency_ms", 1)]),
        ]

    def __repr__(self):
        return (
            f"<AnalyticsRAGPerformance course={self.course_id} "
            f"retrieved={self.retrieved_count} score={self.avg_relevance_score:.2f}>"
        )
