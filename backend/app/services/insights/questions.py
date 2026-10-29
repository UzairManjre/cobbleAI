"""Question insights: cluster a period's student questions and have the LLM name each
cluster's topic and likely misconception, with a paraphrased representative question."""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import List, Optional

from app.core.config import settings
from app.models.insights import QuestionCluster, QuestionInsight
from app.models.tutor import TutorRun
from app.services.insights.common import (
    DISTANCE_THRESHOLD, cluster_texts, common_nodes, is_gap, keyword_topic, node_labels, parse_json_object,
    period, student_runs,
)
from app.services.llm import LLMAdapter

LABEL_PROMPT = """Students in a course asked an AI tutor the questions below. They were grouped because they are similar.
{concepts}
Questions:
{questions}

Describe the group for the instructor. Return JSON only:
{{"topic": "3 to 6 word topic", "misconception": "one sentence on what students seem to misunderstand, or null if they are just asking for information", "representative_question": "one question in your own words that captures the group; never copy a student's wording"}}"""

MAX_QUESTIONS_IN_PROMPT = 25


async def label_cluster(questions: List[str], concepts: List[str], adapter: Optional[LLMAdapter] = None) -> dict:
    prompt = LABEL_PROMPT.format(
        concepts=f"Concepts they were studying: {', '.join(concepts)}" if concepts else "",
        questions="\n".join(f"- {q.strip()[:200]}" for q in questions[:MAX_QUESTIONS_IN_PROMPT]),
    )
    raw = await (adapter or LLMAdapter()).generate_full_response(
        system="You summarise student questions for instructors. Return only JSON.",
        messages=[{"role": "user", "content": prompt}], max_tokens=400, temperature=0.2, think=False,
    )
    data = parse_json_object(raw)
    topic = str(data.get("topic") or "").strip()
    if not topic:
        raise ValueError("label has no topic")
    representative = (data.get("representative_question") or "").strip() or None
    # A label that just repeats one student's question is not a paraphrase
    if representative and any(representative.lower() == q.strip().lower() for q in questions):
        representative = None
    misconception = data.get("misconception")
    misconception = str(misconception).strip() if misconception and str(misconception).lower() != "null" else None
    return {"topic": topic[:80], "misconception": misconception, "representative_question": representative}


async def build_clusters(runs: List[TutorRun], labels: dict, max_clusters: int = 10,
                         use_llm: bool = True) -> List[QuestionCluster]:
    texts = [r.question for r in runs]
    groups = await asyncio.to_thread(cluster_texts, texts)  # CPU work, off the event loop
    if any(len(g) >= 2 for g in groups):
        groups = [g for g in groups if len(g) >= 2]  # singletons are noise once real groups exist
    adapter = LLMAdapter() if use_llm else None
    clusters = []
    for i, group in enumerate(groups[:max_clusters]):
        members = [runs[j] for j in group]
        questions = [m.question for m in members]
        node_ids, node_names = common_nodes([m.node_id for m in members], labels)
        cluster = QuestionCluster(
            cluster_id=i, size=len(group), topic=keyword_topic(questions), labelled_by="keywords",
            node_ids=node_ids, node_labels=node_names,
            declined=sum(1 for m in members if m.decision == "declined"),
            weak_support=sum(1 for m in members if is_gap(m) and m.decision != "declined"),
        )
        if adapter:
            try:
                cluster = cluster.model_copy(update={**await label_cluster(questions, node_names, adapter), "labelled_by": "llm"})
            except Exception as e:
                logging.warning(f"Cluster labelling fell back to keywords: {e}")
        clusters.append(cluster)
    return clusters


async def generate_question_insights(course_id: uuid.UUID, days: int = 7, until: Optional[datetime] = None,
                                     generated_by: str = "on_demand", max_clusters: int = 10,
                                     use_llm: bool = True) -> QuestionInsight:
    since, end = period(days, until)
    runs = [r for r in await student_runs(course_id, since, end) if r.decision != "error" and r.question.strip()]
    clusters = await build_clusters(runs, await node_labels(course_id), max_clusters, use_llm) if runs else []
    insight = QuestionInsight(
        course_id=course_id, period_start=since, period_end=end, n_questions=len(runs),
        n_students=len({r.user_id for r in runs if r.user_id}), clusters=clusters, generated_by=generated_by,
        method={"embedding_model": settings.EMBEDDING_MODEL, "clustering": "agglomerative", "linkage": "average",
                "metric": "cosine", "distance_threshold": DISTANCE_THRESHOLD,
                "labeller": settings.LLM_MODEL if use_llm else "keywords"},
    )
    await insight.insert()
    return insight


async def latest_insight(course_id: uuid.UUID) -> Optional[QuestionInsight]:
    return await QuestionInsight.find(QuestionInsight.course_id == course_id).sort(-QuestionInsight.created_at).first_or_none()


def insight_to_dict(insight: QuestionInsight) -> dict:
    return {
        "id": str(insight.id), "course_id": str(insight.course_id),
        "period_start": insight.period_start.isoformat(), "period_end": insight.period_end.isoformat(),
        "n_questions": insight.n_questions, "n_students": insight.n_students,
        "clusters": [c.model_dump() for c in insight.clusters], "method": insight.method,
        "generated_by": insight.generated_by, "created_at": insight.created_at.isoformat(),
    }
