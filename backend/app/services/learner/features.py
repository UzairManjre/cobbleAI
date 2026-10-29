"""Per-concept struggle signals for one course, from logged behaviour and outcomes."""

import uuid
from collections import defaultdict
from typing import Dict, List, Optional

from app.models.analytics.event import AnalyticsEvent
from app.models.graph import KnowledgeGraph
from app.models.test import Test, TestAttempt
from app.models.tutor import AnswerFeedback, TutorRun

FEATURES = [
    "revisit_rate",            # share of visits that were revisits
    "dwell_norm",              # mean dwell time / 5 minutes, capped at 1
    "questions_per_student",   # tutor questions per student who visited
    "video_replays_per_student",  # rewinds into lecture moments that explain the concept
    "wrong_answer_rate",       # graded quiz answers on the concept that were wrong
    "decline_rate",            # tutor answers that were declined or weakly supported
    "negative_feedback_rate",  # answers rated wrong / not in my notes
    "low_mastery",             # 1 - mean BKT mastery (0.5 when unknown)
]

REPLAY_WINDOW_S = 30.0


def heuristic_v1(f: Dict[str, float]) -> float:
    """The v1 confusion score CS(n) = 0.4 revisit + 0.3 time + 0.3 questions (questions capped at 5)."""
    return round(0.4 * f["revisit_rate"] + 0.3 * f["dwell_norm"] + 0.3 * min(f["questions_per_student"] / 5.0, 1.0), 4)


async def latest_graph(course_id: uuid.UUID) -> Optional[KnowledgeGraph]:
    return await KnowledgeGraph.find(KnowledgeGraph.course_id == course_id).sort(-KnowledgeGraph.created_at).first_or_none()


async def concept_features(course_id: uuid.UUID, graph: Optional[KnowledgeGraph] = None) -> Dict[str, dict]:
    graph = graph or await latest_graph(course_id)
    if not graph:
        return {}
    node_ids = {n.id for n in graph.nodes}

    visits = defaultdict(int)
    revisits = defaultdict(int)
    dwell = defaultdict(list)
    questions = defaultdict(int)
    students = defaultdict(set)
    # Student behaviour only: instructor previews and FAQ drafting are not struggle signals
    events = await AnalyticsEvent.find(AnalyticsEvent.course_id == course_id, AnalyticsEvent.user_role == "student").to_list()
    replays = []
    for ev in events:
        node = ev.node_id
        if ev.event_type == "video_replay" and ev.document_id and (ev.payload or {}).get("source") != "navigation":
            replays.append((str(ev.document_id), float(ev.payload.get("to", 0) or 0), ev.user_id))
        if node not in node_ids:
            continue
        if ev.event_type == "node_visited":
            visits[node] += 1
            students[node].add(ev.user_id)
        elif ev.event_type == "node_revisited":
            revisits[node] += 1
            students[node].add(ev.user_id)
        elif ev.event_type == "node_dwell":
            ms = ev.payload.get("dwellTimeMs") or ev.payload.get("dwell_time_ms")
            if isinstance(ms, (int, float)) and ms > 0:
                dwell[node].append(ms / 1000.0)
        elif ev.event_type == "question_asked":
            questions[node] += 1
            students[node].add(ev.user_id)

    # Rewinds count toward a concept when they land in a lecture moment linked to it (provenance)
    replay_counts = defaultdict(int)
    replay_students = defaultdict(set)
    for node in graph.nodes:
        moments = [(e.doc_id, e.t_start, e.t_end or e.t_start) for e in node.provenance if e.t_start is not None and e.doc_id]
        for doc_id, t, user in replays:
            if any(doc_id == d and s - REPLAY_WINDOW_S <= t <= e + REPLAY_WINDOW_S for d, s, e in moments):
                replay_counts[node.id] += 1
                replay_students[node.id].add(user)

    runs = await TutorRun.find(TutorRun.course_id == course_id, TutorRun.user_role == "student",
                               TutorRun.endpoint != "eval").to_list()
    asked_runs = defaultdict(int)
    weak_runs = defaultdict(int)
    for run in runs:
        if run.node_id in node_ids:
            asked_runs[run.node_id] += 1
            if run.decision == "declined" or run.support_level == "weak":
                weak_runs[run.node_id] += 1

    feedback = await AnswerFeedback.find(AnswerFeedback.course_id == course_id).to_list()
    negative = defaultdict(int)
    for fb in feedback:
        if fb.node_id in node_ids and fb.rating in ("wrong", "not_in_notes"):
            negative[fb.node_id] += 1

    answered = defaultdict(int)
    wrong = defaultdict(int)
    tests = {t.id: t for t in await Test.find(Test.course_id == course_id).to_list()}
    for attempt in await TestAttempt.find(TestAttempt.course_id == course_id).to_list():
        test = tests.get(attempt.test_id)
        if not test:
            continue
        by_q = {str(q.id): q for q in test.questions}
        for ans in attempt.answers:
            q = by_q.get(str(ans.question_id))
            if q and q.node_id in node_ids and ans.is_correct is not None:
                answered[q.node_id] += 1
                wrong[q.node_id] += int(not ans.is_correct)

    from app.services.learner.mastery import course_mastery
    mastery = await course_mastery(course_id)

    out = {}
    for node in graph.nodes:
        nid = node.id
        n_students = max(len(students[nid] | replay_students[nid]), 1)
        total_visits = visits[nid] + revisits[nid]
        f = {
            "revisit_rate": revisits[nid] / total_visits if total_visits else 0.0,
            "dwell_norm": min((sum(dwell[nid]) / len(dwell[nid])) / 300.0, 1.0) if dwell[nid] else 0.0,
            "questions_per_student": questions[nid] / n_students,
            "video_replays_per_student": replay_counts[nid] / n_students,
            "wrong_answer_rate": wrong[nid] / answered[nid] if answered[nid] else 0.0,
            "decline_rate": weak_runs[nid] / asked_runs[nid] if asked_runs[nid] else 0.0,
            "negative_feedback_rate": negative[nid] / asked_runs[nid] if asked_runs[nid] else 0.0,
            "low_mastery": 1.0 - mastery[nid]["mean_mastery"] if nid in mastery else 0.5,
        }
        out[nid] = {
            "node_id": nid,
            "label": node.label,
            "features": {k: round(v, 4) for k, v in f.items()},
            "counts": {
                "students": len(students[nid] | replay_students[nid]), "visits": visits[nid], "revisits": revisits[nid],
                "questions": questions[nid], "video_replays": replay_counts[nid], "quiz_answers": answered[nid],
                "tutor_answers": asked_runs[nid],
            },
            "mean_mastery": mastery.get(nid, {}).get("mean_mastery"),
            "heuristic_v1": heuristic_v1(f),
        }
    return out


def feature_matrix(rows: List[dict], features: List[str] = FEATURES) -> List[List[float]]:
    return [[r["features"][f] for f in features] for r in rows]
