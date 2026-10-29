"""Tutor v2: cite-or-decline, citations, hint ladder, policy, feedback, course/lecture ask."""

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.models.course import Course, Enrolment
from app.models.graph import ChatMessage
from app.models.test import Test, TestAttempt
from app.models.tutor import AnswerFeedback, TutorPolicy, TutorRun
from app.services.chunking import chunk_segments, index_chunks
from app.services.ingestion.segments import Segment
from app.core.prompts import TUTOR_PROMPT_VERSION
from app.services.tutor_engine import parse_citations
from app.services.tutor_policy import clamp_hint, effective_policy


def frames_of(body: str):
    return [json.loads(b.strip()[6:]) for b in body.split("\n\n") if b.strip().startswith("data: ")]


@pytest.fixture(autouse=True)
def _no_expansion(monkeypatch):
    # Query expansion would spend a scripted LLM response; tests drive the answer only
    monkeypatch.setattr("app.core.config.settings.RETRIEVAL_PRESET", "no_expansion")


@pytest.fixture
def course(make_user):
    async def _make():
        professor = await make_user("professor")
        student = await make_user("student")
        course = Course(professor_id=professor.id, title="Algorithms", code="CS2")
        await course.insert()
        await Enrolment(course_id=course.id, student_id=student.id).insert()
        return professor, student, course
    return _make


def index_notes(course_id):
    segments = [
        Segment(text="Merge sort divides the list into halves, sorts each half and merges them.", source_type="pdf_page", page=3),
        Segment(text="Quicksort chooses a pivot and partitions the array around the pivot.", source_type="pdf_page", page=4),
    ]
    chunks, summaries = chunk_segments(segments, doc_id="notes", min_chunk=1, chunk_size=15)
    index_chunks(chunks, str(course_id), "notes", "sorting.pdf", summaries=summaries)
    lecture = [Segment(text="In this lecture merge sort is traced on the board step by step.", source_type="transcript",
                       t_start=120.0, t_end=165.0, extra={"chapter_id": "lec1:ch0"})]
    chunks, _ = chunk_segments(lecture, doc_id="lec1")
    index_chunks(chunks, str(course_id), "lec1", "lecture3.mp4", media_type="lecture")


async def ask(client, course_id, question, **body):
    res = await client.post(f"/api/tutor/courses/{course_id}/ask", json={"question": question, **body})
    assert res.status_code == 200, res.text
    return frames_of(res.text)


def test_parse_citations_keeps_valid_labels_in_order():
    sources = [{"sid": "S1", "x": 1}, {"sid": "S2", "x": 2}]
    sids, cited = parse_citations("Merge sort splits [S2]. It then merges [S1, S2] and [S7].", sources)
    assert sids == ["S2", "S1"] and [c["x"] for c in cited] == [2, 1]
    assert parse_citations("No citations here.", sources) == ([], [])


async def test_declines_without_calling_llm_when_course_has_no_material(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    async with api_client(student) as client:
        frames = await ask(client, c.id, "Explain red-black trees")
    assert frames[0]["type"] == "meta" and frames[0]["decision"] == "declined"
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "declined" and final["decline_reason"] == "no_sources"
    assert fake_llm.calls == []

    run = await TutorRun.find_one(TutorRun.course_id == c.id)
    assert run.decision == "declined" and run.model is None
    saved = await ChatMessage.find(ChatMessage.role == "assistant").to_list()
    assert saved[0].decision == "declined"


async def test_declines_off_topic_question_on_low_support(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    async with api_client(student) as client:
        frames = await ask(client, c.id, "Who won the 1998 football world cup?")
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "declined" and final["decline_reason"] == "low_support"
    assert fake_llm.calls == []


async def test_answer_with_citations(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    fake_llm.queue("Merge sort splits the list into halves [S1]. What happens after both halves are sorted? [S9]")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "How does merge sort divide the list into halves?", hint_level="full_answer")

    meta = frames[0]
    assert meta["hint_level"] == "full_answer"
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "answered"
    assert final["cited_sids"] == ["S1"]  # [S9] does not exist and is dropped
    assert final["citations"][0]["filename"] in ("sorting.pdf", "lecture3.mp4")
    assert final["support"] in ("strong", "weak")

    system = fake_llm.calls[-1]["system"]
    assert "[S1]" in system and "FULL ANSWER" in system and "[[DECLINE]]" in system
    run = await TutorRun.find_one(TutorRun.course_id == c.id)
    assert run.cited_sids == ["S1"] and run.prompt_version == TUTOR_PROMPT_VERSION and run.hint_level == "full_answer"


async def test_model_decline_token_becomes_a_decline(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    fake_llm.queue("[[DECLINE]] The notes do not give merge sort's space complexity.")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "What extra space does merge sort need when it merges halves?")
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "declined" and final["decline_reason"] == "model_declined"
    assert "space complexity" in final["answer"] and "[[DECLINE]]" not in final["answer"]


async def test_cite_or_decline_off_restores_answering_beyond_the_notes(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    await TutorPolicy(course_id=c.id, cite_or_decline=False).insert()
    fake_llm.queue("[[DECLINE]] Not in the notes, but generally merge sort needs O(n) extra space.")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "What extra space does merge sort need when it merges halves?")
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "answered" and "[[DECLINE]]" not in final["answer"]
    assert "[[DECLINE]]" not in fake_llm.calls[-1]["system"] and "general knowledge" in fake_llm.calls[-1]["system"]


async def test_student_scope_cannot_widen_the_instructor_scope(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    await TutorPolicy(course_id=c.id, scope="selected_documents", allowed_doc_ids=["notes"]).insert()
    async with api_client(student) as client:
        frames = await ask(client, c.id, "How was merge sort traced in the lecture?", lecture_id="lec1")
        final = next(f for f in frames if f["type"] == "citations")
        assert final["decision"] == "declined" and final["decline_reason"] == "out_of_scope"
        fake_llm.queue("Merge sort divides the list into halves [S1].")
        frames = await ask(client, c.id, "How does merge sort divide the list into halves?", doc_ids=["notes", "lec1"])
    sources = next(f for f in frames if f["type"] == "sources")["sources"]
    assert sources and {s["doc_id"] for s in sources} == {"notes"}


async def test_answer_starting_with_error_is_not_an_llm_failure(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    fake_llm.queue("Errors are not the topic here; merge sort divides the list into halves [S1].")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "How does merge sort divide the list into halves?", hint_level="full_answer")
        assert not [f for f in frames if f["type"] == "error"]
        final = next(f for f in frames if f["type"] == "citations")
        assert final["decision"] == "answered" and final["answer"].startswith("Errors are not")
        # The answer is saved before the citations frame, so feedback on it works straight away
        meta = frames[0]
        res = await client.post("/api/tutor/feedback", json={"message_id": meta["message_id"], "rating": "helpful"})
        assert res.status_code == 200


async def test_lecture_scope_only_uses_that_lecture(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    fake_llm.queue("The lecture traces it on the board [S1].")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "How was merge sort traced in the lecture?", lecture_id="lec1", video_t=130)
        sources = next(f for f in frames if f["type"] == "sources")["sources"]
        assert sources and all(s["doc_id"] == "lec1" for s in sources)
        assert sources[0]["t_start"] == 120.0 and sources[0]["location"] == "2:00-2:45"

        res = await client.get(f"/api/tutor/courses/{c.id}/chat", params={"lecture_id": "lec1"})
        history = res.json()["messages"]
        assert [m["role"] for m in history] == ["user", "assistant"]
        assert history[1]["citations"][0]["doc_id"] == "lec1"

        # The course-wide chat is a separate thread
        res = await client.get(f"/api/tutor/courses/{c.id}/chat")
        assert res.json()["messages"] == []


async def test_teach_back_skips_gate_and_plays_classmate(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    fake_llm.queue("Interesting! Why do you think the halves need merging?")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "Merge sort sorts by picking a pivot.", mode="teach_back")
    final = next(f for f in frames if f["type"] == "citations")
    assert final["decision"] == "answered"
    assert "curious classmate" in fake_llm.calls[-1]["system"]


#   Policy

async def test_policy_caps_hint_level_and_professor_can_edit(course, api_client, fake_llm, qdrant_memory):
    professor, student, c = await course()
    index_notes(c.id)
    async with api_client(professor) as client:
        res = await client.put(f"/api/tutor/courses/{c.id}/policy/settings",
                               json={"max_hint_level": "guiding_question", "default_hint_level": "nudge"})
        assert res.status_code == 200 and res.json()["max_hint_level"] == "guiding_question"
        res = await client.put(f"/api/tutor/courses/{c.id}/policy/settings", json={"max_hint_level": "everything"})
        assert res.status_code == 400

    fake_llm.queue("What does the list turn into after dividing? [S1]")
    async with api_client(student) as client:
        policy = (await client.get(f"/api/tutor/courses/{c.id}/policy")).json()
        assert policy["allowed_levels"] == ["nudge", "guiding_question"]
        frames = await ask(client, c.id, "How does merge sort divide the list into halves?", hint_level="full_answer")
        assert frames[0]["hint_level"] == "guiding_question"
        assert "GUIDING QUESTION" in fake_llm.calls[-1]["system"]

        # Students cannot change the policy
        res = await client.put(f"/api/tutor/courses/{c.id}/policy/settings", json={"max_hint_level": "full_answer"})
        assert res.status_code == 403


async def test_in_progress_assessment_turns_off_answer_reveals(course):
    professor, student, c = await course()
    test = Test(course_id=c.id, professor_id=professor.id, title="Midterm", description="d", status="published", duration_minutes=60)
    await test.insert()
    await TestAttempt(test_id=test.id, student_id=student.id, course_id=c.id, status="in_progress",
                      started_at=datetime.now(timezone.utc)).insert()

    eff = await effective_policy(c.id, student)
    assert eff.assessment_active and "Midterm" in eff.assessment_reason
    assert clamp_hint("full_answer", eff) == "guiding_question"

    # The professor previewing the course is not affected
    assert not (await effective_policy(c.id, professor)).assessment_active


async def test_topic_override_and_disallowing_full_answers(course):
    _, student, c = await course()
    await TutorPolicy(course_id=c.id, allow_full_answers=False,
                      topic_overrides=[{"node_id": "n9", "max_hint_level": "nudge"}]).insert()
    assert clamp_hint("full_answer", await effective_policy(c.id, student)) == "worked_step"
    assert clamp_hint("full_answer", await effective_policy(c.id, student, node_id="n9")) == "nudge"


#   Feedback

async def test_feedback_flow(course, api_client, fake_llm, qdrant_memory, make_user):
    professor, student, c = await course()
    index_notes(c.id)
    fake_llm.queue("Merge sort divides the list into halves [S1].")
    async with api_client(student) as client:
        frames = await ask(client, c.id, "How does merge sort divide the list into halves?")
        message_id = frames[0]["message_id"]
        res = await client.post("/api/tutor/feedback", json={"message_id": message_id, "rating": "not_in_notes"})
        assert res.status_code == 200
        res = await client.post("/api/tutor/feedback", json={"message_id": message_id, "rating": "wrong", "comment": "pivot?"})
        assert res.status_code == 200
        assert (await client.post("/api/tutor/feedback", json={"message_id": message_id, "rating": "meh"})).status_code == 400

    other = await make_user("student")
    async with api_client(other) as client:
        res = await client.post("/api/tutor/feedback", json={"message_id": message_id, "rating": "helpful"})
        assert res.status_code == 403

    assert await AnswerFeedback.find(AnswerFeedback.message_id == uuid.UUID(message_id)).count() == 1

    async with api_client(professor) as client:
        items = (await client.get(f"/api/tutor/courses/{c.id}/feedback")).json()["items"]
        assert len(items) == 1 and items[0]["rating"] == "wrong" and items[0]["comment"] == "pivot?"
        assert items[0]["question"].startswith("How does merge sort")
        assert items[0]["answer"].startswith("Merge sort divides")
        res = await client.patch(f"/api/tutor/feedback/{items[0]['id']}", json={"status": "resolved"})
        assert res.json()["status"] == "resolved"
        assert (await client.get(f"/api/tutor/courses/{c.id}/feedback")).json()["items"] == []


async def test_unenrolled_student_cannot_ask(api_client, make_user, qdrant_memory):
    professor = await make_user("professor")
    course = Course(professor_id=professor.id, title="X", code="X1")
    await course.insert()
    outsider = await make_user("student")
    async with api_client(outsider) as client:
        res = await client.post(f"/api/tutor/courses/{course.id}/ask", json={"question": "hi"})
    assert res.status_code == 403


async def test_legacy_chat_route_uses_the_engine_for_course_questions(course, api_client, fake_llm, qdrant_memory):
    _, student, c = await course()
    index_notes(c.id)
    await TutorPolicy(course_id=c.id, max_hint_level="nudge").insert()
    fake_llm.queue("Think about what happens to each half [S1].")
    async with api_client(student) as client:
        res = await client.post("/api/chat/", params={"session_id": str(uuid.uuid4()), "message": "How does merge sort divide the list into halves?",
                                                       "course_id": str(c.id), "mode": "teach"})
    frames = frames_of(res.text)
    assert frames[0]["type"] == "meta" and frames[0]["hint_level"] == "nudge"  # the course policy applies
    assert {f["type"] for f in frames} >= {"sources", "chunk", "done"}
    assert (await TutorRun.find_one(TutorRun.course_id == c.id)).endpoint == "course_ask"
