"""
AnalyticsService — Central service for all analytics event tracking.

High cohesion: all analytics logic lives here.
Loose coupling: routes call this service; they don't touch models directly.

Usage:
    from app.services.analytics import analytics_service

    await analytics_service.track_event(
        event_type="node_visited",
        event_category="navigation",
        user_id=user.id,
        user_role=user.role,
        course_id=course_id,
        graph_id=graph_id,
        session_id=session_id,
        node_id=node_id,
        payload={"visit_order": 5, "time_since_start_ms": 12000},
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
"""

from typing import Optional, Dict, List
from datetime import datetime, timezone
import uuid

from app.models.analytics.event import AnalyticsEvent
from app.models.analytics.event_taxonomy import EventCategory
from app.models.analytics.user_profile import AnalyticsUserProfile
from app.models.analytics.node_metrics import AnalyticsNodeMetrics
from app.models.analytics.llm_usage import AnalyticsLLMUsage
from app.models.analytics.rag_performance import AnalyticsRAGPerformance


class AnalyticsService:
    """
    Single entry point for all analytics tracking.

    Each method maps to a specific analytics concern:
    - track_event()        → raw event logging
    - track_llm_usage()    → LLM call tracking
    - track_rag_query()    → RAG pipeline tracking
    - update_user_profile() → aggregate user stats
    - update_node_metrics() → aggregate node stats
    """

    # ── Raw Event Tracking ────────────────────────────────────────

    async def track_event(
        self,
        event_type: str,
        event_category: str,
        user_id: uuid.UUID,
        user_role: str,
        course_id: Optional[uuid.UUID] = None,
        graph_id: Optional[uuid.UUID] = None,
        session_id: Optional[uuid.UUID] = None,
        node_id: Optional[str] = None,
        document_id: Optional[uuid.UUID] = None,
        payload: Optional[Dict] = None,
        timestamp: Optional[datetime] = None,
        platform: str = "web",
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> AnalyticsEvent:
        """
        Record a single immutable analytics event.

        This is the primary entry point for all event tracking.
        Every parameter maps to a field on AnalyticsEvent.
        """
        event = AnalyticsEvent(
            user_id=user_id,
            user_role=user_role,
            event_type=event_type,
            event_category=event_category,
            course_id=course_id,
            graph_id=graph_id,
            session_id=session_id,
            node_id=node_id,
            document_id=document_id,
            payload=payload or {},
            timestamp=timestamp or datetime.now(timezone.utc),
            platform=platform,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        await event.insert()
        return event

    async def track_events_batch(
        self, events_data: List[Dict]
    ) -> List[AnalyticsEvent]:
        """
        Record multiple events at once for efficiency.

        Each dict should have the same keys as track_event().
        """
        events = []
        for data in events_data:
            event = AnalyticsEvent(
                user_id=data["user_id"],
                user_role=data.get("user_role", "student"),
                event_type=data["event_type"],
                event_category=data.get("event_category", "ui"),
                course_id=data.get("course_id"),
                graph_id=data.get("graph_id"),
                session_id=data.get("session_id"),
                node_id=data.get("node_id"),
                document_id=data.get("document_id"),
                payload=data.get("payload", {}),
                timestamp=data.get("timestamp", datetime.now(timezone.utc)),
                platform=data.get("platform", "web"),
                user_agent=data.get("user_agent"),
                ip_address=data.get("ip_address"),
            )
            events.append(event)

        if events:
            await AnalyticsEvent.insert_many(events)
        return events

    # ── LLM Usage Tracking ────────────────────────────────────────

    async def track_llm_usage(
        self,
        endpoint: str,
        model: str,
        latency_ms: int,
        response_length_chars: int,
        user_id: Optional[uuid.UUID] = None,
        session_id: Optional[uuid.UUID] = None,
        prompt_text: Optional[str] = None,
        question_topic: Optional[str] = None,
        time_to_first_token_ms: Optional[int] = None,
        estimated_input_tokens: int = 0,
        estimated_output_tokens: int = 0,
        rag_retrieved_count: int = 0,
        rag_success: bool = False,
        error_message: Optional[str] = None,
        estimated_cost_usd: Optional[float] = None,
    ) -> AnalyticsLLMUsage:
        """Track a single LLM API call."""
        usage = AnalyticsLLMUsage(
            user_id=user_id,
            session_id=session_id,
            endpoint=endpoint,
            model=model,
            prompt_text=(prompt_text or "")[:200] if prompt_text else None,
            question_topic=question_topic,
            latency_ms=latency_ms,
            time_to_first_token_ms=time_to_first_token_ms,
            response_length_chars=response_length_chars,
            estimated_input_tokens=estimated_input_tokens,
            estimated_output_tokens=estimated_output_tokens,
            rag_retrieved_count=rag_retrieved_count,
            rag_success=rag_success,
            error_message=error_message,
            estimated_cost_usd=estimated_cost_usd,
        )
        await usage.insert()
        return usage

    # ── RAG Performance Tracking ──────────────────────────────────

    async def track_rag_query(
        self,
        course_id: uuid.UUID,
        query_text: str,
        retrieved_count: int,
        total_retrieval_latency_ms: int,
        rerank_applied: bool = False,
        final_context_count: int = 0,
        embedding_latency_ms: int = 0,
        qdrant_search_latency_ms: int = 0,
        reranker_latency_ms: int = 0,
        source_doc_ids: Optional[List[str]] = None,
        source_relevance_scores: Optional[List[float]] = None,
        avg_relevance_score: float = 0.0,
        led_to_successful_answer: bool = True,
    ) -> AnalyticsRAGPerformance:
        """Track a single RAG retrieval operation."""
        perf = AnalyticsRAGPerformance(
            course_id=course_id,
            query_text=(query_text or "")[:200] if query_text else "",
            retrieved_count=retrieved_count,
            rerank_applied=rerank_applied,
            final_context_count=final_context_count,
            embedding_latency_ms=embedding_latency_ms,
            qdrant_search_latency_ms=qdrant_search_latency_ms,
            reranker_latency_ms=reranker_latency_ms,
            total_retrieval_latency_ms=total_retrieval_latency_ms,
            source_doc_ids=source_doc_ids or [],
            source_relevance_scores=source_relevance_scores or [],
            avg_relevance_score=avg_relevance_score,
            led_to_successful_answer=led_to_successful_answer,
        )
        await perf.insert()
        return perf

    # ── User Profile Updates ──────────────────────────────────────

    async def update_user_profile(
        self, user_id: uuid.UUID, updates: Dict
    ) -> Optional[AnalyticsUserProfile]:
        """
        Update or create a user's analytics profile.

        The updates dict can contain any of:
        - lifetime_stats: Dict with aggregate stats
        - topic_interests: List of topic engagement data
        - performance_indicators: Dict with risk/engagement data
        """
        if not updates:
            return None

        profile = await AnalyticsUserProfile.find_one(
            AnalyticsUserProfile.user_id == user_id
        )

        if not profile:
            profile = AnalyticsUserProfile(user_id=user_id)

        # Merge updates into existing profile
        for key, value in updates.items():
            if key in ("lifetime_stats", "performance_indicators"):
                # Deep merge for nested dicts
                existing = getattr(profile, key, {}) or {}
                existing.update(value)
                setattr(profile, key, existing)
            elif key == "topic_interests":
                # Replace list
                setattr(profile, key, value)
            else:
                setattr(profile, key, value)

        profile.updated_at = datetime.now(timezone.utc)
        await profile.save()
        return profile

    # ── Node Metrics Updates ──────────────────────────────────────

    async def update_node_metrics(
        self,
        graph_id: uuid.UUID,
        node_id: str,
        node_label: str,
        course_id: Optional[uuid.UUID] = None,
        increments: Optional[Dict] = None,
    ) -> Optional[AnalyticsNodeMetrics]:
        """
        Update metrics for a specific graph node.

        Use increments to add to existing counters (e.g. {"total_visits": 1}).
        Existing document is fetched and updated in place.
        """
        if not increments:
            return None

        metrics = await AnalyticsNodeMetrics.find_one(
            AnalyticsNodeMetrics.graph_id == graph_id,
            AnalyticsNodeMetrics.node_id == node_id,
        )

        if not metrics:
            metrics = AnalyticsNodeMetrics(
                graph_id=graph_id,
                node_id=node_id,
                node_label=node_label,
                course_id=course_id,
            )

        # Increment numeric fields
        for key, value in increments.items():
            current = getattr(metrics, key, 0) or 0
            setattr(metrics, key, current + value)

        metrics.updated_at = datetime.now(timezone.utc)

        # Recompute derived fields
        metrics = self._compute_derived_metrics(metrics)

        await metrics.save()
        return metrics

    def _compute_derived_metrics(
        self, metrics: AnalyticsNodeMetrics
    ) -> AnalyticsNodeMetrics:
        """
        Compute derived analytics fields from raw counters.

        Called after increments are applied.
        """
        # Average time per visit
        if metrics.total_visits > 0:
            metrics.avg_time_per_visit_sec = (
                metrics.total_time_spent_sec / metrics.total_visits
            )
            metrics.avg_questions_per_student = (
                metrics.total_questions_asked / max(metrics.unique_students, 1)
            )

        # Revisit rate
        if metrics.unique_students > 0:
            revisit_count = max(
                metrics.total_visits - metrics.unique_students, 0
            )
            metrics.revisit_rate = revisit_count / max(metrics.total_visits, 1)

        # Confusion score: weighted combination
        # High revisits + high time + many questions = confused student
        revisit_weight = 0.4
        time_weight = 0.3
        question_weight = 0.3

        # Normalize each component (rough heuristics)
        revisit_norm = min(metrics.revisit_rate, 1.0)
        time_norm = min(
            metrics.avg_time_per_visit_sec / 300.0, 1.0
        )  # 5 min baseline
        question_norm = min(
            metrics.avg_questions_per_student / 5.0, 1.0
        )  # 5 questions baseline

        metrics.confusion_score = (
            revisit_weight * revisit_norm
            + time_weight * time_norm
            + question_weight * question_norm
        )

        return metrics


# Singleton instance
analytics_service = AnalyticsService()
