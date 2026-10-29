"""Coverage-gap report: where the tutor declined or answered from weak support, plus
answers students marked "not in my notes", grouped by concept, with what was searched."""

import asyncio
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from app.models.tutor import AnswerFeedback, TutorRun
from app.services.insights.common import cluster_texts, is_gap, keyword_topic, node_labels, period, student_runs


def _searched(runs: List[TutorRun], k: int = 3) -> List[dict]:
    """The closest material the tutor found for these questions, best support first."""
    best: Dict[tuple, dict] = {}
    for run in runs:
        for src in run.sources:
            key = (src.get("doc_id"), src.get("location"))
            entry = best.setdefault(key, {
                "doc_id": src.get("doc_id"), "filename": src.get("filename"), "location": src.get("location") or "",
                "media_type": src.get("media_type", "document"), "page_start": src.get("page_start"),
                "slide_start": src.get("slide_start"), "t_start": src.get("t_start"), "best_support": 0.0, "times": 0,
            })
            entry["times"] += 1
            entry["best_support"] = max(entry["best_support"], float(src.get("support") or 0.0))
    ranked = sorted(best.values(), key=lambda e: (e["best_support"], e["times"]), reverse=True)
    for e in ranked:
        e["best_support"] = round(e["best_support"], 3)
    return ranked[:k]


def _group_summary(key: str, label: str, node_id: Optional[str], runs: List[TutorRun], not_in_notes: int) -> dict:
    supports = [r.top_support for r in runs]
    return {
        "key": key, "node_id": node_id, "label": label,
        "declined": sum(1 for r in runs if r.decision == "declined"),
        "weak_support": sum(1 for r in runs if r.decision == "answered" and r.support_level in ("weak", "none")),
        "not_in_notes": not_in_notes,
        "total": len(runs),
        "mean_top_support": round(sum(supports) / len(supports), 3) if supports else None,
        "searched": _searched(runs),
    }


async def coverage_gaps(course_id: uuid.UUID, days: int = 30, until: Optional[datetime] = None) -> dict:
    since, end = period(days, until)
    runs = [r for r in await student_runs(course_id, since, end) if r.decision != "error"]
    by_id = {r.id: r for r in runs}
    gap_ids = {r.id for r in runs if is_gap(r)}

    feedback = await AnswerFeedback.find(
        AnswerFeedback.course_id == course_id, AnswerFeedback.rating == "not_in_notes",
        AnswerFeedback.created_at >= since, AnswerFeedback.created_at <= end,
    ).to_list()
    not_in_notes_runs: Dict[uuid.UUID, int] = defaultdict(int)
    orphan_feedback: Dict[Optional[str], int] = defaultdict(int)  # feedback whose run is outside the window
    for fb in feedback:
        if fb.run_id and fb.run_id in by_id:
            gap_ids.add(fb.run_id)
            not_in_notes_runs[fb.run_id] += 1
        else:
            orphan_feedback[fb.node_id] += 1

    labels = await node_labels(course_id)
    gaps = [by_id[i] for i in gap_ids]
    by_node: Dict[str, List[TutorRun]] = defaultdict(list)
    unlinked: List[TutorRun] = []
    for run in gaps:
        (by_node[run.node_id] if run.node_id else unlinked).append(run)

    groups = [
        _group_summary(f"node:{node_id}", labels.get(node_id, node_id), node_id, members,
                       sum(not_in_notes_runs[m.id] for m in members) + orphan_feedback.pop(node_id, 0))
        for node_id, members in by_node.items()
    ]
    # Questions asked outside a concept (course chat, lectures) are grouped by similarity
    for i, idx in enumerate(await asyncio.to_thread(cluster_texts, [r.question for r in unlinked])):
        members = [unlinked[j] for j in idx]
        groups.append(_group_summary(f"cluster:{i}", keyword_topic([m.question for m in members]), None, members,
                                     sum(not_in_notes_runs[m.id] for m in members)))
    for node_id, count in orphan_feedback.items():
        groups.append(_group_summary(f"feedback:{node_id}", labels.get(node_id, node_id) if node_id else "Other",
                                     node_id, [], count))

    groups.sort(key=lambda g: (g["total"] + g["not_in_notes"], g["declined"]), reverse=True)
    return {
        "period_start": since.isoformat(), "period_end": end.isoformat(),
        "n_questions": len(runs),
        "n_gaps": len(gaps),
        "gap_rate": round(len(gaps) / len(runs), 3) if runs else None,
        "not_in_notes": len(feedback),
        "groups": groups,
    }
