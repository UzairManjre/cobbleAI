"""Characterization tests for the v1 flows CobbleAI 2.0 builds on.

They exercise the real routers against mongomock with a scripted LLM, so a
regression in sessions, graphs, tests, grading or analytics shows up here.
"""

import json
import uuid

import pytest

from app.models.course import Course, Enrolment
from app.models.graph import KnowledgeGraph, ChatMessage, GraphEdge, RelationType
from app.models.test import Test, Question, MCQOption, TestAttempt
from tests.conftest import drain_tasks


def parse_sse(body: str):
    frames = []
    for block in body.split("\n\n"):
        block = block.strip()
        if block.startswith("data: "):
            frames.append(json.loads(block[len("data: "):]))
    return frames


@pytest.fixture
def course_setup(make_user):
    async def _setup(enrol_student: bool = True):
        professor = await make_user("professor")
        student = await make_user("student")
        course = Course(professor_id=professor.id, title="Algorithms", code="CS101")
        await course.insert()
        if enrol_student:
            await Enrolment(course_id=course.id, student_id=student.id).insert()
        graph = KnowledgeGraph(
            topic="Algorithms",
            course_id=course.id,
            created_by=professor.id,
            nodes=[
                {"id": "n1", "label": "Sorting", "description": "Ordering elements"},
                {"id": "n2", "label": "Merge Sort", "description": "Divide and conquer sort"},
            ],
            edges=[{"id": "e1", "from": "n1", "to": "n2", "relation": "prerequisite_for"}],
        )
        await graph.insert()
        return professor, student, course, graph
    return _setup


#   Graph model

def test_unknown_relation_is_coerced_not_rejected():
    edge = GraphEdge.model_validate({"id": "e", "from": "a", "to": "b", "relation": "leads_to"})
    assert edge.relation == RelationType.relates_to
    edge = GraphEdge.model_validate({"id": "e", "from": "a", "to": "b", "type": "Builds On"})
    assert edge.relation == RelationType.builds_on


async def test_graph_api_uses_frontend_field_names(course_setup, api_client):
    professor, student, course, graph = await course_setup()

    async with api_client(professor) as client:
        res = await client.get(f"/api/professor/graph/course/{course.id}")
    assert res.status_code == 200
    data = res.json()[0]
    assert data["nodes"][0]["label"] == "Sorting"
    edge = data["edges"][0]
    assert {k: edge[k] for k in ("id", "from", "to", "relation", "strength")} == {
        "id": "e1", "from": "n1", "to": "n2", "relation": "prerequisite_for", "strength": 1.0}
    assert edge["provenance"] == [] and edge["supported"] is None  # graphs made before provenance still load

    async with api_client(student) as client:
        res = await client.get(f"/api/student/graph/course/{course.id}")
    assert res.status_code == 200
    assert res.json()[0]["nodes"][1]["label"] == "Merge Sort"


async def test_unenrolled_student_cannot_read_graph(course_setup, api_client):
    _, student, course, _ = await course_setup(enrol_student=False)
    async with api_client(student) as client:
        res = await client.get(f"/api/student/graph/course/{course.id}")
    assert res.status_code == 403


#   Study sessions + tutor

async def test_session_navigate_and_ask_flow(course_setup, api_client, fake_llm, monkeypatch):
    _, student, course, graph = await course_setup()

    from app.services.retrieval.config import get_preset
    from app.services.retrieval.hybrid import RetrievalResult, RetrievedChunk

    async def fake_retrieve(query, course_id, config=None):
        chunk = RetrievedChunk(
            point_id="p1", text="Merge sort splits the list in half.",
            payload={"doc_id": "doc-1", "filename": "week3.pdf", "page_start": 4, "page_end": 4, "source_type": "pdf_page"},
            dense=0.91, support=0.8, score=0.85, rank=1,
        )
        return RetrievalResult(query=query, chunks=[chunk], config=get_preset("hybrid"),
                               collection=f"course_{course_id}_v2", candidates_considered=7,
                               timings_ms={"search": 3, "total": 9})
    monkeypatch.setattr("app.services.tutor_engine.retrieve_with_details", fake_retrieve)
    fake_llm.queue("<thought>Plan the hint.</thought>What happens when you split the list in half?")

    async with api_client(student) as client:
        res = await client.post("/api/student/sessions/get-or-create", json={"graph_id": str(graph.id)})
        assert res.status_code == 200
        session = res.json()
        assert session["current_node_id"] == "n1"

        res = await client.post(f"/api/student/sessions/{session['id']}/navigate", json={"node_id": "n2"})
        assert res.status_code == 200
        assert res.json()["visited_nodes"] == ["n1", "n2"]
        await drain_tasks()
        from app.models.analytics.event import AnalyticsEvent
        dwell = await AnalyticsEvent.find_one(AnalyticsEvent.event_type == "node_dwell")
        # Time on n1 is measured by the server and tagged with the course, so the learner model can use it
        assert dwell and dwell.node_id == "n1" and dwell.course_id == course.id and dwell.payload["dwellTimeMs"] >= 0

        res = await client.post(
            f"/api/student/sessions/{session['id']}/ask",
            json={"node_id": "n2", "question": "How does merge sort work?"},
        )
        assert res.status_code == 200
        frames = parse_sse(res.text)

    types = [f["type"] for f in frames]
    assert types[0] == "meta" and types[1] == "sources" and types[-1] == "done"
    assert frames[1]["sources"][0]["filename"] == "week3.pdf"
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "answered" and final["answer"].startswith("What happens")
    assert "".join(f["content"] for f in frames if f["type"] == "chunk").endswith("split the list in half?")

    # The tutor prompt got the node, its neighbour and the retrieved context
    system = fake_llm.calls[-1]["system"]
    assert "Merge Sort" in system and "Sorting" in system and "splits the list" in system

    saved = await ChatMessage.find(ChatMessage.node_id == "n2").sort(ChatMessage.created_at).to_list()
    assert [m.role for m in saved] == ["user", "assistant"]
    assert saved[1].content == "What happens when you split the list in half?"
    assert saved[1].thinking == "Plan the hint."

    async with api_client(student) as client:
        res = await client.get(f"/api/student/sessions/{session['id']}")
    history = res.json()["chat_history"]
    assert history[-1]["content"].startswith("What happens")
    assert "<thought>" not in history[-1]["content"]

    # Every answer is logged with its retrieval evidence for the evaluation harness
    from app.models.tutor import TutorRun
    run = await TutorRun.find_one(TutorRun.message_id == saved[1].id)
    assert run is not None
    assert run.question == "How does merge sort work?"
    assert run.decision == "answered" and run.config_hash
    assert run.sources[0]["location"] == "p. 4" and run.sources[0]["signals"]["dense"] == 0.91
    assert run.candidates_considered == 7 and run.latency_ms["generation"] >= 0


async def test_professor_can_preview_own_course_graph(course_setup, api_client):
    professor, _, _, graph = await course_setup()
    async with api_client(professor) as client:
        res = await client.post("/api/professor/sessions/get-or-create", json={"graph_id": str(graph.id)})
    assert res.status_code == 200


async def test_other_students_session_is_forbidden(course_setup, api_client, make_user):
    _, student, course, graph = await course_setup()
    async with api_client(student) as client:
        session = (await client.post("/api/student/sessions/get-or-create", json={"graph_id": str(graph.id)})).json()
    intruder = await make_user("student")
    async with api_client(intruder) as client:
        res = await client.get(f"/api/student/sessions/{session['id']}")
    assert res.status_code == 403


#   Tests: create -> start -> submit

def _mcq(text="2 + 2?", correct="b"):
    return Question(
        type="mcq",
        question_text=text,
        marks=2,
        options=[MCQOption(id="a", text="3", is_correct=correct == "a"), MCQOption(id="b", text="4", is_correct=correct == "b")],
        explanation="Basic arithmetic.",
    )


async def test_test_start_hides_answer_key_and_submit_grades(course_setup, api_client):
    professor, student, course, _ = await course_setup()
    q = _mcq()
    test = Test(
        course_id=course.id, professor_id=professor.id, title="Quiz 1", description="d",
        questions=[q], total_marks=2, status="published", show_results_immediately=True,
    )
    await test.insert()

    async with api_client(student) as client:
        res = await client.post(f"/api/student/tests/{test.id}/start")
        assert res.status_code == 200
        body = res.json()
        sent_q = body["test"]["questions"][0]
        assert "is_correct" not in sent_q["options"][0]
        assert "explanation" not in sent_q
        attempt_id = body["attempt"]["id"]

        res = await client.post(f"/api/student/tests/attempt/{attempt_id}/submit", json={
            "attempt_id": attempt_id,
            "answers": [{"question_id": str(q.id), "answer_type": "option", "selected_option_id": "b"}],
        })
        assert res.status_code == 200
        assert res.json()["percentage"] == 100.0

    attempt = await TestAttempt.get(uuid.UUID(attempt_id))
    assert attempt.status == "graded"
    assert attempt.time_taken_seconds is not None


async def test_results_release_flow_and_final_attempts(course_setup, api_client):
    from datetime import datetime, timedelta, timezone
    professor, student, course, _ = await course_setup()
    q = _mcq()
    q.rubric = ["States that the sum is four"]
    test = Test(course_id=course.id, professor_id=professor.id, title="Quiz 2", description="d", questions=[q],
                total_marks=2, status="published", available_until=datetime.now(timezone.utc) + timedelta(seconds=30))
    await test.insert()
    answer = [{"question_id": str(q.id), "answer_type": "option", "selected_option_id": "b"}]

    async with api_client(student) as client:
        body = (await client.post(f"/api/student/tests/{test.id}/start")).json()
        assert "rubric" not in body["test"]["questions"][0] and "test_cases" not in body["test"]["questions"][0]
        attempt_id = body["attempt"]["id"]
        res = (await client.post(f"/api/student/tests/attempt/{attempt_id}/submit",
                                 json={"attempt_id": attempt_id, "answers": answer})).json()
        # Not released yet: no score, no per-answer grades
        assert res["status"] == "submitted" and res["percentage"] is None
        assert "marks_awarded" not in res["attempt"]["answers"][0] and "is_correct" not in res["attempt"]["answers"][0]
        result = (await client.get(f"/api/student/tests/attempt/{attempt_id}/result")).json()
        assert result["revealed"] is False and result["attempt"]["percentage"] is None
        # A submitted attempt is final, and it uses up the only attempt
        again = await client.post(f"/api/student/tests/attempt/{attempt_id}/submit",
                                  json={"attempt_id": attempt_id, "answers": [], "is_auto_save": True})
        assert again.json()["message"] == "Already submitted"
        assert (await client.post(f"/api/student/tests/{test.id}/start")).status_code == 403

    test.available_until = datetime.now(timezone.utc) - timedelta(days=1)  # the instructor releases after the due date
    await test.save()
    async with api_client(professor) as client:
        assert (await client.get(f"/api/professor/tests/{test.id}")).status_code == 200
        released = (await client.post(f"/api/professor/tests/{test.id}/release-results")).json()
    assert released == {"released": 1, "waiting_for_review": 0}

    async with api_client(student) as client:
        result = (await client.get(f"/api/student/tests/attempt/{attempt_id}/result")).json()
        assert result["revealed"] is True and result["attempt"]["percentage"] == 100.0
        assert result["attempt"]["answers"][0]["marks_awarded"] == 2
        # Graded is final too: the revealed key cannot be used to re-grade
        res = await client.post(f"/api/student/tests/attempt/{attempt_id}/submit", json={"attempt_id": attempt_id, "answers": answer})
        assert res.json()["message"] == "Already submitted"
    attempt = await TestAttempt.get(uuid.UUID(attempt_id))
    assert attempt.answers[0].marks_awarded == 2


async def test_unenrolled_student_cannot_start_test(course_setup, api_client):
    professor, student, course, _ = await course_setup(enrol_student=False)
    test = Test(course_id=course.id, professor_id=professor.id, title="Quiz", description="d",
                questions=[_mcq()], total_marks=2, status="published")
    await test.insert()
    async with api_client(student) as client:
        res = await client.post(f"/api/student/tests/{test.id}/start")
    assert res.status_code == 403


async def test_professor_test_creation_and_publish(course_setup, api_client):
    professor, _, course, _ = await course_setup()
    async with api_client(professor) as client:
        res = await client.post("/api/professor/tests/create", json={
            "course_id": str(course.id), "title": "Midterm", "description": "Covers weeks 1-4",
        })
        assert res.status_code in (200, 201), res.text
        test_id = res.json().get("id") or res.json().get("test", {}).get("id")
        assert test_id

        # Publishing a test without questions is rejected
        res = await client.post(f"/api/professor/tests/{test_id}/publish")
        assert res.status_code == 400


#   Grading drafts

async def test_grading_draft_override_zero_and_approve(course_setup, api_client, fake_llm):
    from app.models.grading import Rubric, RubricCriterion, GradingDraft
    professor, student, course, _ = await course_setup()
    test = Test(course_id=course.id, professor_id=professor.id, title="Essay", description="d", test_type="assignment")
    await test.insert()
    attempt = TestAttempt(test_id=test.id, student_id=student.id, course_id=course.id, status="submitted")
    await attempt.insert()

    fake_llm.queue(
        "ANOMALY: NO\nREASON: None",
        '{"suggested_score": 4.0, "suggested_feedback": "Good.", "ai_reasoning": "Clear."}',
    )
    async with api_client(professor) as client:
        res = await client.post(f"/api/professor/grading/assignments/{test.id}/rubric", json={
            "criteria": [{"name": "Clarity", "description": "Clear", "max_points": 5}],
        })
        assert res.status_code == 201, res.text
        criterion_id = res.json()["criteria"][0]["id"]

        res = await client.post(f"/api/professor/grading/submissions/{attempt.id}/draft",
                                json={"submission_text": "Merge sort divides the list."})
        assert res.status_code == 200, res.text
        draft_id = res.json()["id"]
        assert res.json()["status"] == "needs_review"

        res = await client.patch(f"/api/professor/grading/drafts/{draft_id}",
                                 json={"overrides": [{"criterion_id": criterion_id, "override_score": 0.0}]})
        assert res.status_code == 200
        assert res.json()["total_score"] == 0.0

        res = await client.post(f"/api/professor/grading/drafts/{draft_id}/approve")
        assert res.status_code == 200

    draft = await GradingDraft.get(uuid.UUID(draft_id))
    assert draft.status == "approved"
    assert draft.edit_history[0].old_value == 4.0 and draft.edit_history[0].new_value == 0.0


#   Analytics

async def test_track_endpoint_keeps_context_fields(course_setup, api_client):
    from app.models.analytics.event import AnalyticsEvent
    _, student, course, _ = await course_setup()
    course_id = course.id
    async with api_client(student) as client:
        res = await client.post("/api/analytics/track", json={
            "event_type": "node_dwell",
            "event_category": "navigation",
            "payload": {"nodeId": "n7", "courseId": str(course_id), "dwellTimeMs": 4200},
        })
        assert res.status_code == 200
        await drain_tasks()
        res = await client.post("/api/analytics/track/batch", json={"events": [
            {"event_type": "video_seek", "event_category": "video", "node_id": "n7", "payload": {"from": 10, "to": 4}},
            # A course the student is not in must not feed that course's learner model or heatmap
            {"event_type": "video_replay", "event_category": "video", "course_id": str(uuid.uuid4()), "payload": {}},
        ]})
        assert res.json()["count"] == 2
        await drain_tasks()

    events = await AnalyticsEvent.find(AnalyticsEvent.user_id == student.id).to_list()
    dwell = next(e for e in events if e.event_type == "node_dwell")
    assert dwell.node_id == "n7"
    assert dwell.course_id == course_id
    assert dwell.event_category == "navigation"
    assert any(e.event_type == "video_seek" for e in events)
    assert not any(e.event_type == "video_replay" for e in events)


async def test_dashboard_reports_no_fabricated_numbers(course_setup, api_client, qdrant_memory):
    professor, _, course, _ = await course_setup()
    async with api_client(professor) as client:
        res = await client.get("/api/analytics/dashboard")
    assert res.status_code == 200
    data = res.json()
    # Nothing has been measured yet, so nothing may be shown
    assert data["telemetry"]["llm_streaming"] == []
    assert data["telemetry"]["queue_depth"] == []
    assert all(item["count"] == 0 for item in data["engagement"]["intent_radar"])
    assert all(cell["y"] == 0 for row in data["engagement"]["study_heatmap"] for cell in row["data"])
    assert data["content"]["sankey_flow"] == {"nodes": [], "links": []}
