"""Weekly FAQ draft: the top question clusters get RAG-drafted, cited answers that the
professor edits and publishes. Students only ever see published entries."""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.models.insights import FAQEntry, QuestionInsight
from app.services.tutor_policy import effective_policy
from app.services.tutor_engine import TutorEngine, TutorRequest


def faq_question(topic: str, representative: Optional[str]) -> str:
    return representative or f"What should I understand about {topic}?"


async def draft_faq(course_id: uuid.UUID, insight: QuestionInsight, user=None, top_n: int = 5) -> dict:
    """Draft one entry per top cluster. Clusters the materials can't answer are skipped and
    reported back (they belong in the coverage-gap report, not the FAQ)."""
    from app.services.run_log import log_tutor_run

    existing = await FAQEntry.find(FAQEntry.course_id == course_id).to_list()
    drafted_topics = {e.cluster_topic for e in existing if e.insight_id == insight.id}
    next_order = max((e.order for e in existing), default=-1) + 1
    engine = TutorEngine()
    created: List[FAQEntry] = []
    skipped: List[dict] = []

    for cluster in insight.clusters[:top_n]:
        if cluster.topic in drafted_topics:
            continue
        question = faq_question(cluster.topic, cluster.representative_question)
        node_id = cluster.node_ids[0] if cluster.node_ids else None
        try:
            # The instructor's scope and cite-or-decline apply; the student hint cap and assessment mode do not
            policy = await effective_policy(course_id, None, node_id)
            policy.max_hint_level, policy.allow_full_answers = "full_answer", True
            policy.assessment_active, policy.assessment_reason = False, None
            prepared, outcome, timings = await engine.answer_once(TutorRequest(
                question=question, course_id=str(course_id), mode="teach", hint_level="full_answer",
                node_id=node_id, user=user, policy=policy,
            ))
        except Exception as e:
            logging.error(f"FAQ draft failed for '{cluster.topic}': {e}")
            skipped.append({"topic": cluster.topic, "reason": "error"})
            continue
        run = await log_tutor_run(
            prepared.retrieval, endpoint="faq_draft", user_id=getattr(user, "id", None), user_role="professor",
            course_id=course_id, node_id=prepared.request.node_id, latency_ms=timings,
            **engine.run_fields(prepared, outcome),
        )
        if outcome.decision != "answered" or not outcome.answer.strip():
            skipped.append({"topic": cluster.topic, "reason": outcome.decline_reason or outcome.decision})
            continue
        entry = FAQEntry(
            course_id=course_id, question=question, answer=outcome.answer.strip(), citations=outcome.citations,
            order=next_order, insight_id=insight.id, cluster_topic=cluster.topic, cluster_size=cluster.size,
            run_id=run.id if run else None, support_level=outcome.support, created_by=getattr(user, "id", None),
        )
        await entry.insert()
        next_order += 1
        created.append(entry)
    return {"created": [faq_to_dict(e) for e in created], "skipped": skipped}


def faq_to_dict(entry: FAQEntry, include_meta: bool = True) -> dict:
    data = {
        "id": str(entry.id), "course_id": str(entry.course_id), "question": entry.question, "answer": entry.answer,
        "citations": entry.citations, "status": entry.status, "order": entry.order,
        "published_at": entry.published_at.isoformat() if entry.published_at else None,
    }
    if include_meta:
        data.update({
            "cluster_topic": entry.cluster_topic, "cluster_size": entry.cluster_size, "support_level": entry.support_level,
            "edited": entry.edited, "insight_id": str(entry.insight_id) if entry.insight_id else None,
            "created_at": entry.created_at.isoformat(), "updated_at": entry.updated_at.isoformat(),
        })
    return data


async def update_faq(entry: FAQEntry, user, question: Optional[str] = None, answer: Optional[str] = None,
                     status: Optional[str] = None, order: Optional[int] = None) -> FAQEntry:
    now = datetime.now(timezone.utc)
    if question is not None and question.strip() != entry.question:
        entry.question, entry.edited = question.strip(), True
    if answer is not None and answer.strip() != entry.answer:
        entry.answer, entry.edited = answer.strip(), True
    if order is not None:
        entry.order = order
    if status is not None:
        if status not in ("draft", "published"):
            raise ValueError("status must be draft or published")
        if status == "published" and not entry.answer.strip():
            raise ValueError("an FAQ entry needs an answer before it can be published")
        if status == "published" and entry.status != "published":
            entry.published_at = now
        entry.status = status
    entry.updated_by, entry.updated_at = getattr(user, "id", None), now
    await entry.save()
    return entry
