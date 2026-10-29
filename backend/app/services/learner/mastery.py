"""Update and read per-student concept mastery from graded answers."""

import uuid
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from app.models.learner import ConceptMastery, LearnerModelVersion
from app.services.learner.bkt import DEFAULT_PARAMS, BKTParams, update


async def active_params(course_id: Optional[uuid.UUID]) -> Tuple[BKTParams, str]:
    """Course-specific fitted parameters, else a global fit (e.g. ASSISTments), else defaults."""
    for cid in ([course_id] if course_id else []) + [None]:
        version = await LearnerModelVersion.find(
            LearnerModelVersion.kind == "bkt", LearnerModelVersion.course_id == cid, LearnerModelVersion.active == True,  # noqa: E712
        ).sort(-LearnerModelVersion.created_at).first_or_none()
        if version:
            return BKTParams.from_dict(version.params), str(version.id)
    return DEFAULT_PARAMS, "default"


async def record_observations(student_id: uuid.UUID, course_id: uuid.UUID,
                              observations: Iterable[Tuple[str, bool]]) -> List[ConceptMastery]:
    """Apply graded attempts (node_id, correct) in order; returns the updated mastery rows."""
    observations = [(n, c) for n, c in observations if n]
    if not observations:
        return []
    params, version = await active_params(course_id)
    rows: Dict[str, ConceptMastery] = {}
    for node_id, correct in observations:
        row = rows.get(node_id) or await ConceptMastery.find_one(
            ConceptMastery.student_id == student_id, ConceptMastery.course_id == course_id, ConceptMastery.node_id == node_id,
        )
        if row is None:
            row = ConceptMastery(student_id=student_id, course_id=course_id, node_id=node_id, p_mastery=params.p_init)
        row.p_mastery = update(row.p_mastery, correct, params)
        row.n_obs += 1
        row.n_correct += int(bool(correct))
        row.params_version = version
        row.updated_at = datetime.now(timezone.utc)
        rows[node_id] = row
    for row in rows.values():
        await row.save()
    return list(rows.values())


async def student_mastery(student_id: uuid.UUID, course_id: uuid.UUID) -> Dict[str, dict]:
    rows = await ConceptMastery.find(ConceptMastery.student_id == student_id, ConceptMastery.course_id == course_id).to_list()
    return {r.node_id: {"p_mastery": round(r.p_mastery, 3), "n_obs": r.n_obs, "n_correct": r.n_correct} for r in rows}


async def course_mastery(course_id: uuid.UUID) -> Dict[str, dict]:
    """Mean mastery per concept across students who have attempted it."""
    rows = await ConceptMastery.find(ConceptMastery.course_id == course_id).to_list()
    agg: Dict[str, List[float]] = {}
    for r in rows:
        agg.setdefault(r.node_id, []).append(r.p_mastery)
    return {node: {"mean_mastery": round(sum(v) / len(v), 3), "n_students": len(v)} for node, v in agg.items()}


def observations_from_attempt(test, answers) -> List[Tuple[str, bool]]:
    """(node_id, correct) for every graded answer to a question tagged with a concept."""
    by_id = {str(q.id): q for q in test.questions}
    out = []
    for answer in answers:
        question = by_id.get(str(answer.question_id))
        if question is None or not question.node_id or answer.is_correct is None:
            continue
        out.append((question.node_id, bool(answer.is_correct)))
    return out
