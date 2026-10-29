"""Learner model v2 (Upgrade B): BKT, concept tagging, mastery from tests, calibrated flags,
heatmap, confidence calibration and the S3 study."""

import csv
import random
import uuid
from datetime import datetime, timezone

import pytest

from app.models.analytics.event import AnalyticsEvent
from app.models.course import Course, Enrolment
from app.models.document import DocumentModel
from app.models.graph import KnowledgeGraph
from app.models.learner import ConceptMastery
from app.models.lecture import LectureTranscript, TranscriptSegment
from app.models.test import MCQOption, Question, Test
from app.services.learner import bkt
from app.services.learner.tagging import match_node


#   BKT

def test_bkt_update_direction_and_bounds():
    p = bkt.DEFAULT_PARAMS
    assert bkt.update(0.3, True, p) > 0.3
    assert bkt.update(0.3, False, p) < 0.3 + p.p_learn  # a wrong answer pulls the estimate down before learning
    assert 0 < bkt.update(0.999999, True, p) < 1


def _simulate(params, n_students=150, length=12, seed=3):
    rng = random.Random(seed)
    seqs = []
    for _ in range(n_students):
        mastered = rng.random() < params.p_init
        seq = []
        for _ in range(length):
            correct = rng.random() < (1 - params.p_slip if mastered else params.p_guess)
            seq.append(int(correct))
            if not mastered and rng.random() < params.p_learn:
                mastered = True
        seqs.append(seq)
    return seqs


def test_bkt_fit_beats_defaults_and_predicts_above_chance():
    truth = bkt.BKTParams(p_init=0.1, p_learn=0.2, p_slip=0.05, p_guess=0.3)
    seqs = _simulate(truth)
    fitted = bkt.fit(seqs)
    assert bkt.log_likelihood(seqs, fitted) >= bkt.log_likelihood(seqs, bkt.DEFAULT_PARAMS)
    assert abs(fitted.p_learn - truth.p_learn) <= 0.15
    assert bkt.evaluate(_simulate(truth, seed=9), fitted)["auc"] > 0.6


#   Tagging and mastery from tests

class _Node:
    def __init__(self, id, label):
        self.id, self.label = id, label


def test_match_node_exact_and_fuzzy():
    nodes = [_Node("n1", "Merge Sort"), _Node("n2", "Binary Search Tree")]
    assert match_node("merge sort", nodes) == "n1"
    assert match_node("Binary search trees", nodes) == "n2"
    assert match_node("Photosynthesis", nodes) is None


def test_match_node_falls_back_to_the_concept_the_question_names():
    nodes = [_Node("n1", "Scheduling"), _Node("n2", "Priority Scheduling"), _Node("n3", "Starvation")]
    # The topic matches nothing; the question names two concepts and the more specific one wins
    assert match_node("CPU management", nodes, "Why can priority scheduling lead to problems?") == "n2"
    assert match_node(None, nodes, "Describe what starvation means.") == "n3"
    assert match_node("CPU management", nodes, "What is a deadlock?") is None


@pytest.fixture
def learner_course(make_user):
    async def _make():
        professor = await make_user("professor")
        student = await make_user("student")
        course = Course(professor_id=professor.id, title="Algo", code="A")
        await course.insert()
        await Enrolment(course_id=course.id, student_id=student.id).insert()
        return professor, student, course
    return _make


def _mcq(node_id, correct="b"):
    return Question(type="mcq", question_text=f"Q on {node_id}", marks=1, node_id=node_id,
                    options=[MCQOption(id="a", text="x", is_correct=correct == "a"), MCQOption(id="b", text="y", is_correct=correct == "b")])


async def test_submit_updates_mastery_and_records_confidence(learner_course, api_client):
    professor, student, course = await learner_course()
    q1, q2 = _mcq("n1"), _mcq("n2")
    test = Test(course_id=course.id, professor_id=professor.id, title="Quiz", description="d", questions=[q1, q2],
                total_marks=2, status="published", show_results_immediately=True)
    await test.insert()
    async with api_client(student) as client:
        attempt = (await client.post(f"/api/student/tests/{test.id}/start")).json()["attempt"]
        res = await client.post(f"/api/student/tests/attempt/{attempt['id']}/submit", json={"attempt_id": attempt["id"], "answers": [
            {"question_id": str(q1.id), "answer_type": "option", "selected_option_id": "b", "confidence": 4},
            {"question_id": str(q2.id), "answer_type": "option", "selected_option_id": "a", "confidence": 3},
        ]})
        assert res.status_code == 200
        calib = (await client.get(f"/api/learner/courses/{course.id}/calibration")).json()
        mastery = (await client.get(f"/api/learner/courses/{course.id}/mastery")).json()

    m1 = await ConceptMastery.find_one(ConceptMastery.student_id == student.id, ConceptMastery.node_id == "n1")
    m2 = await ConceptMastery.find_one(ConceptMastery.student_id == student.id, ConceptMastery.node_id == "n2")
    assert m1.p_mastery > bkt.DEFAULT_PARAMS.p_init > m2.p_mastery - bkt.DEFAULT_PARAMS.p_learn
    assert m1.n_obs == 1 and m1.n_correct == 1 and m2.n_correct == 0
    assert mastery["scope"] == "student" and set(mastery["concepts"]) == {"n1", "n2"}

    assert calib["n"] == 2
    level4 = next(l for l in calib["levels"] if l["confidence"] == 4)
    level3 = next(l for l in calib["levels"] if l["confidence"] == 3)
    assert level4["accuracy"] == 1.0 and level3["accuracy"] == 0.0
    assert calib["overconfidence"] == pytest.approx(((0.95 - 1) + (0.75 - 0)) / 2, abs=1e-3)


#   Concept flags: heuristic until labelled, calibrated with reasons after fitting

async def _seed_course_signals(course, students, n_nodes=8):
    nodes = [{"id": f"n{i}", "label": f"Concept {i}"} for i in range(n_nodes)]
    graph = KnowledgeGraph(topic="t", course_id=course.id, created_by=uuid.uuid4(), nodes=nodes, edges=[])
    await graph.insert()
    events = []
    for i in range(n_nodes):
        hard = i % 2 == 0
        for s in students:
            events.append(AnalyticsEvent(user_id=s, user_role="student", event_type="node_visited", event_category="navigation",
                                         course_id=course.id, graph_id=graph.id, node_id=f"n{i}"))
            for _ in range(3 if hard else 0):
                events.append(AnalyticsEvent(user_id=s, user_role="student", event_type="node_revisited", event_category="navigation",
                                             course_id=course.id, graph_id=graph.id, node_id=f"n{i}"))
                events.append(AnalyticsEvent(user_id=s, user_role="student", event_type="question_asked", event_category="chat",
                                             course_id=course.id, graph_id=graph.id, node_id=f"n{i}"))
    await AnalyticsEvent.insert_many(events)
    return graph


async def test_concept_flags_heuristic_then_calibrated(learner_course, api_client):
    professor, student, course = await learner_course()
    await _seed_course_signals(course, [student.id, uuid.uuid4()])

    async with api_client(professor) as client:
        flags = (await client.get(f"/api/learner/courses/{course.id}/concepts")).json()
        assert flags["method"] == "heuristic_v1" and len(flags["concepts"]) == 8
        top = flags["concepts"][0]
        assert top["node_id"] in {"n0", "n2", "n4", "n6"} and top["signals"][0]["contribution"] > 0

        res = await client.post(f"/api/learner/courses/{course.id}/fit")
        assert res.status_code == 400  # no labels yet

        for i in range(8):
            res = await client.put(f"/api/learner/courses/{course.id}/labels/n{i}", json={"struggling": i % 2 == 0, "difficulty": "hard" if i % 2 == 0 else "easy"})
            assert res.status_code == 200
        await client.put(f"/api/learner/courses/{course.id}/labels/n0", json={"struggling": True, "rater_slot": "secondary"})

        fit = (await client.post(f"/api/learner/courses/{course.id}/fit")).json()
        assert fit["metrics"]["n_labelled"] == 8
        assert fit["metrics"]["calibrated_cv"]["f1"] == 1.0 and "heuristic_v1" in fit["metrics"]
        assert fit["metrics"]["inter_rater"]["n"] == 1

        flags = (await client.get(f"/api/learner/courses/{course.id}/concepts")).json()
        assert flags["method"] == "calibrated"
        hard = next(c for c in flags["concepts"] if c["node_id"] == "n0")
        easy = next(c for c in flags["concepts"] if c["node_id"] == "n1")
        assert hard["flagged"] and not easy["flagged"] and hard["probability"] > easy["probability"]
        assert hard["instructor_label"] is True
        assert hard["signals"][0]["label"]  # human-readable reason

    async with api_client(student) as client:
        assert (await client.get(f"/api/learner/courses/{course.id}/concepts")).status_code == 403


#   Lecture heatmap

async def test_lecture_heatmap_bins_rewinds_and_questions(learner_course, api_client, monkeypatch):
    professor, student, course = await learner_course()
    doc = DocumentModel(course_id=course.id, filename="lec.mp4", s3_path="k", media_type="lecture", duration_sec=60, status="ready")
    await doc.insert()
    await LectureTranscript(doc_id=doc.id, course_id=course.id, duration_sec=60, segments=[
        TranscriptSegment(id=0, start=20, end=29, text="This is the tricky recursion step."),
    ]).insert()
    base = dict(user_role="student", event_category="video", course_id=course.id, document_id=doc.id)
    await AnalyticsEvent.insert_many([
        AnalyticsEvent(user_id=student.id, event_type="video_replay", payload={"from": 40, "to": 22}, **base),
        AnalyticsEvent(user_id=uuid.uuid4(), event_type="video_seek", payload={"from": 45, "to": 25, "direction": "back"}, **base),
        AnalyticsEvent(user_id=student.id, event_type="video_seek", payload={"from": 5, "to": 50, "direction": "forward"}, **base),
        AnalyticsEvent(user_id=student.id, event_type="question_asked", payload={"video_t": 27}, **{**base, "event_category": "chat"}),
    ])
    async with api_client(professor) as client:
        data = (await client.get(f"/api/learner/lectures/{doc.id}/heatmap")).json()
    assert data["bin_seconds"] == 10 and len(data["bins"]) == 7
    hot = data["bins"][2]
    assert (hot["replays"], hot["rewinds"], hot["questions"], hot["students"]) == (1, 1, 1, 2)
    assert data["bins"][5]["rewinds"] == 0  # forward seeks are not confusion
    assert data["hotspots"][0]["start"] == 20 and "tricky recursion" in data["hotspots"][0]["transcript"]


#   S3 study on a synthetic ASSISTments file

def test_kt_study_runs_with_student_split(tmp_path):
    from eval.kt import run_kt_study
    truth = bkt.BKTParams(p_init=0.2, p_learn=0.15, p_slip=0.1, p_guess=0.25)
    path = tmp_path / "skill_builder_data.csv"
    with path.open("w", newline="", encoding="latin-1") as f:
        writer = csv.writer(f)
        writer.writerow(["order_id", "user_id", "skill_id", "correct"])
        order = 0
        for skill in ("add", "frac"):
            for student, seq in enumerate(_simulate(truth, n_students=60, length=8, seed=hash(skill) % 100)):
                for correct in seq:
                    order += 1
                    writer.writerow([order, f"u{student}", skill, correct])
    result = run_kt_study(path, min_skill_attempts=100)
    assert result["split"]["by"] == "student" and result["split"]["test_students"] == 12
    assert result["bkt_pooled"]["auc"] > 0.55 and result["pfa_logistic"]["auc"] > 0.5
    assert result["bkt_per_skill"]["skills_with_own_fit"] >= 1
