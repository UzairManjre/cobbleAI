"""Grader v2 (Upgrade C): evidence and confidence, review routing, review queue, agreement, CSV, S5."""

import csv
import io
import json
import uuid

import pytest

from app.models.course import Course, Enrolment
from app.models.learner import ConceptMastery
from app.models.test import MCQOption, Question, Test, TestAttempt
from app.services.grading_v2 import grade_free_text, rubric_for


def grade_json(score, confidence=0.9, span="divides the list into halves"):
    return json.dumps({
        "points": [{"point": "Splits the list", "met": True, "student_span": span}],
        "score": score, "feedback": "Good.", "rationale": "Covers the split.", "confidence": confidence,
    })


def _question(**kw):
    return Question(type="short_answer", question_text="How does merge sort start?", marks=4,
                    explanation="It divides the list into halves. Each half is sorted recursively.", **kw)


def test_rubric_falls_back_to_model_answer_sentences():
    assert rubric_for(_question()) == ["It divides the list into halves.", "Each half is sorted recursively."]
    assert rubric_for(_question(rubric=["Split", " "])) == ["Split"]


async def test_consistent_samples_give_high_confidence_and_evidence(fake_llm):
    fake_llm.queue(grade_json(3), grade_json(3), grade_json(3.4))
    result = await grade_free_text(_question(), "Merge sort divides the list into halves first.")
    assert result.score == 3.0 and result.samples == [3.0, 3.0, 3.5]
    assert result.confidence >= 0.7 and not result.needs_review
    assert result.evidence[0]["kind"] == "student_answer" and result.evidence[0]["quote"] == "divides the list into halves"
    assert all(c["temperature"] == 0.7 for c in fake_llm.calls)


async def test_disagreement_routes_to_review_and_scores_are_clamped(fake_llm):
    fake_llm.queue(grade_json(0, 0.4), grade_json(99, 0.4), grade_json(2, 0.4, span="words not in the answer"))
    result = await grade_free_text(_question(), "Merge sort divides the list into halves.")
    assert max(result.samples) == 4.0  # clamped to the question's marks
    assert result.needs_review and result.confidence < 0.7
    assert not [e for e in result.evidence if e["kind"] == "student_answer" and "not in the answer" in e["quote"]]


async def test_unparseable_output_never_silently_scores_zero(fake_llm):
    fake_llm.queue("I refuse", "still no json", "nope")
    result = await grade_free_text(_question(), "Some answer")
    assert result.score is None and result.needs_review and result.method == "error"


async def test_blank_answer_scores_zero_without_review():
    result = await grade_free_text(_question(), "   ")
    assert result.score == 0 and not result.needs_review


#   Submission, review queue, agreement, CSV

@pytest.fixture
def graded_course(make_user):
    async def _make():
        professor = await make_user("professor")
        student = await make_user("student")
        course = Course(professor_id=professor.id, title="Algo", code="A")
        await course.insert()
        await Enrolment(course_id=course.id, student_id=student.id).insert()
        sa = _question(cognitive_level="understand", node_id="n1")
        tf = Question(type="true_false", question_text="Merge sort is stable.", marks=1, correct_answer=True, node_id="n2")
        test = Test(course_id=course.id, professor_id=professor.id, title="Quiz", description="d", questions=[sa, tf],
                    total_marks=5, status="published", show_results_immediately=True)
        await test.insert()
        return professor, student, course, test, sa, tf
    return _make


async def _submit(client, test, sa, tf, text="Merge sort divides the list into halves first."):
    attempt = (await client.post(f"/api/student/tests/{test.id}/start")).json()["attempt"]
    res = await client.post(f"/api/student/tests/attempt/{attempt['id']}/submit", json={"attempt_id": attempt["id"], "answers": [
        {"question_id": str(sa.id), "answer_type": "text", "answer_text": text},
        {"question_id": str(tf.id), "answer_type": "option", "selected_option_id": "true"},
    ]})
    assert res.status_code == 200, res.text
    return attempt["id"]


async def test_confident_grade_releases_results_and_true_false_option_is_graded(graded_course, api_client, fake_llm, qdrant_memory):
    _, student, course, test, sa, tf = await graded_course()
    fake_llm.queue(grade_json(3), grade_json(3), grade_json(3))
    async with api_client(student) as client:
        attempt_id = await _submit(client, test, sa, tf)
    attempt = await TestAttempt.get(uuid.UUID(attempt_id))
    assert attempt.status == "graded"
    tf_answer = next(a for a in attempt.answers if a.question_id == tf.id)
    assert tf_answer.is_correct is True and tf_answer.marks_awarded == 1  # sent as selected_option_id "true"
    sa_answer = next(a for a in attempt.answers if a.question_id == sa.id)
    assert sa_answer.review_status == "auto" and sa_answer.ai_score == 3.0 and sa_answer.evidence
    assert await ConceptMastery.find(ConceptMastery.student_id == student.id).count() == 2


async def test_uncertain_grade_waits_for_instructor_review(graded_course, api_client, fake_llm, qdrant_memory):
    professor, student, course, test, sa, tf = await graded_course()
    fake_llm.queue(grade_json(1, 0.3), grade_json(4, 0.3), grade_json(2, 0.3))
    async with api_client(student) as client:
        attempt_id = await _submit(client, test, sa, tf)
        result = (await client.get(f"/api/student/tests/attempt/{attempt_id}/result")).json()
        assert result["revealed"] is False  # nothing is shown until the instructor reviews
    # Only the settled True/False answer fed mastery so far
    assert await ConceptMastery.find(ConceptMastery.student_id == student.id).count() == 1

    async with api_client(professor) as client:
        queue = (await client.get("/api/professor/grading/queue", params={"course_id": str(course.id)})).json()
        assert queue["counts"]["needs_review"] == 1
        item = queue["items"][0]
        assert item["question_id"] == str(sa.id) and item["confidence"] < 0.7 and item["cognitive_level"] == "understand"

        bad = await client.post(f"/api/professor/grading/answers/{attempt_id}/{sa.id}/review", json={"action": "override", "score": 9})
        assert bad.status_code == 400
        res = await client.post(f"/api/professor/grading/answers/{attempt_id}/{sa.id}/review",
                                json={"action": "override", "score": 3.5, "feedback": "Mention recursion."})
        assert res.json()["attempt_status"] == "graded"

        agreement = (await client.get("/api/professor/grading/agreement", params={"course_id": str(course.id)})).json()
        assert agreement["overall"]["n"] == 1 and agreement["overall"]["mae_marks"] == pytest.approx(1.5)
        assert "understand" in agreement["by_cognitive_level"] and agreement["pending_review"] == 0

        export = await client.get("/api/professor/grading/export.csv", params={"course_id": str(course.id)})
        assert export.headers["content-type"].startswith("text/csv")
        rows = list(csv.DictReader(io.StringIO(export.text)))
        assert rows[0]["final_score"] == "3.5" and rows[0]["ai_score"] == "2.0" and rows[0]["review_status"] == "overridden"

    attempt = await TestAttempt.get(uuid.UUID(attempt_id))
    assert attempt.total_marks_awarded == 4.5 and attempt.status == "graded"
    assert await ConceptMastery.find(ConceptMastery.student_id == student.id).count() == 2
    observations = sum(m.n_obs for m in await ConceptMastery.find(ConceptMastery.student_id == student.id).to_list())

    async with api_client(professor) as client:  # a second look at the same answer is not a new observation
        res = await client.post(f"/api/professor/grading/answers/{attempt_id}/{sa.id}/review", json={"action": "approve"})
        assert res.status_code == 200
    assert sum(m.n_obs for m in await ConceptMastery.find(ConceptMastery.student_id == student.id).to_list()) == observations

    async with api_client(student) as client:
        assert (await client.get("/api/professor/grading/queue", params={"course_id": str(course.id)})).status_code == 403


async def test_question_metadata_can_be_edited(graded_course, api_client):
    professor, _, _, test, sa, _ = await graded_course()
    async with api_client(professor) as client:
        res = await client.patch(f"/api/professor/tests/{test.id}/questions/{sa.id}",
                                 json={"cognitive_level": "apply", "rubric": ["Splits in half", "Recurses"]})
        assert res.status_code == 200 and res.json()["cognitive_level"] == "apply"
        assert (await client.patch(f"/api/professor/tests/{test.id}/questions/{sa.id}", json={"cognitive_level": "guess"})).status_code == 400
    stored = await Test.get(test.id)
    assert stored.questions[0].rubric == ["Splits in half", "Recurses"]


async def test_rubric_draft_scores_are_clamped(fake_llm):
    from app.models.grading import Rubric, RubricCriterion
    from app.services.grading import grading_service
    rubric = Rubric(assignment_id=uuid.uuid4(), criteria=[RubricCriterion(name="Clarity", description="Clear", max_points=5)])
    fake_llm.queue("ANOMALY: NO\nREASON: None",
                   json.dumps({"suggested_score": 99, "suggested_feedback": "f", "ai_reasoning": "r",
                               "evidence_quote": "merge sort halves", "confidence": 0.8}))
    draft = await grading_service.generate_draft(uuid.uuid4(), rubric, "Merge sort halves the list.")
    criterion = draft.criteria_evaluations[0]
    assert criterion.suggested_score == 5.0 and criterion.confidence == 0.8
    assert criterion.evidence_quote == "merge sort halves" and draft.total_score == 5.0


async def test_grading_study_on_synthetic_mohler(tmp_path, fake_llm):
    from eval.grading_study import run_grading_study
    path = tmp_path / "mohler.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "question", "desired_answer", "student_answer", "score_avg"])
        for i, score in enumerate([5, 3, 2, 4, 0, 5]):
            writer.writerow([f"1.{i}", "What is a stack?", "A LIFO structure.", f"answer {i}", score])
    fake_llm.default = grade_json(4)
    folder = await run_grading_study("mohler", path, runs_dir=tmp_path / "runs")
    metrics = json.loads((folder / "metrics.json").read_text())
    assert metrics["n_scored"] == 6 and metrics["overall"]["n"] == 6
    assert set(metrics["per_item"]) == {"1"} and "qwk" in metrics["overall"]
