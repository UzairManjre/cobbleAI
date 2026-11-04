"""Concept-map builds as background jobs: one at a time, saved progress, cancel, the first map
built automatically, and the course setup checklist the professor watches."""

import io
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.course import Course, Enrolment
from app.models.document import DocumentModel
from app.models.graph import GraphBuild, KnowledgeGraph
from app.services import graph_build
from app.services.chunking import chunk_segments, index_chunks
from app.services.ingestion.segments import Segment

EXTRACTION = {
    "concepts": [
        {"name": "Recursion", "description": "A function calling itself.", "evidence": [{"ref": "E1", "quote": "function calls itself"}]},
        {"name": "Base Case", "description": "Stops recursion.", "evidence": [{"ref": "E1", "quote": "A base case stops the recursion"}]},
    ],
    "relationships": [
        {"from": "Base Case", "to": "Recursion", "relation": "is_part_of", "evidence": [{"ref": "E1", "quote": "A base case stops the recursion"}]},
    ],
}


async def _course(make_user, n_ready=1, **doc_fields):
    prof = await make_user("professor")
    course = Course(title="Algorithms", code=f"C{uuid.uuid4().hex[:6]}", professor_id=prof.id)
    await course.insert()
    for i in range(n_ready):
        await DocumentModel(course_id=course.id, filename=f"notes{i}.pdf", s3_path="x", status="ready",
                            processed_at=datetime.now(timezone.utc), **doc_fields).insert()
    return prof, course


def _index(course_id):
    segments = [Segment(text="Recursion is when a function calls itself. A base case stops the recursion.",
                        source_type="pdf_page", page=2)]
    chunks, summaries = chunk_segments(segments, doc_id="notes", min_chunk=1, chunk_size=15)
    index_chunks(chunks, str(course_id), "notes", "notes.pdf", summaries=summaries)


async def test_start_build_queues_one_job_and_joins_it(make_user, _no_live_broker):
    prof, course = await _course(make_user)
    build, created = await graph_build.start_build(course.id, prof.id)
    again, created_again = await graph_build.start_build(course.id, prof.id)
    assert created and not created_again and again.id == build.id
    assert [name for name, _ in _no_live_broker] == ["build_course_graph"]
    assert build.status == "queued" and build.events[0].message == "Build requested"
    assert graph_build.serialize_build(build)["percent"] == 0


async def test_start_build_needs_processed_materials(make_user):
    prof, course = await _course(make_user, n_ready=0)
    with pytest.raises(ValueError):
        await graph_build.start_build(course.id, prof.id)


async def test_run_build_saves_progress_and_the_map(make_user, qdrant_memory, fake_llm):
    prof, course = await _course(make_user)
    _index(course.id)
    fake_llm.queue(json.dumps(EXTRACTION), json.dumps({"difficulty": {}, "new_relationships": []}))
    build, _ = await graph_build.start_build(course.id, prof.id)

    graph_id = await graph_build.run_build(build.id)

    done = await GraphBuild.get(build.id)
    assert done.status == "complete" and done.graph_id == graph_id
    assert done.chunks_total == done.chunks_done == 1 and done.sources == 1 and done.passages >= 1
    assert done.nodes_count == 2 and done.edges_count == 1 and done.unsupported_edges == 0
    assert done.started_at and done.extract_started_at and done.finished_at
    log = [e.message for e in done.events]
    assert log[0] == "Build requested" and log[-1] == "Map ready: 2 concepts, 1 connections"
    assert any(m.startswith("Chunk 1/1: found 2 concepts") for m in log)
    assert not any(m.startswith("Processing chunk") for m in log)  # only results go in the log
    view = graph_build.serialize_build(done)
    assert view["percent"] == 100 and view["eta_s"] is None and view["elapsed_s"] is not None
    graph = await KnowledgeGraph.get(graph_id)
    assert graph.course_id == course.id and graph.created_by == prof.id
    # A finished build is never worked twice
    assert await graph_build.run_build(build.id) is None


async def test_failed_build_keeps_the_error(make_user, qdrant_memory):
    prof, course = await _course(make_user)  # nothing indexed and nothing in storage
    build, _ = await graph_build.start_build(course.id, prof.id)
    await graph_build.run_build(build.id)
    failed = await GraphBuild.get(build.id)
    assert failed.status == "failed" and "No processed documents" in failed.error
    assert failed.events[-1].message.startswith("Failed:")


async def test_cancel_queued_and_running_builds(make_user, qdrant_memory, fake_llm):
    prof, course = await _course(make_user)
    queued, _ = await graph_build.start_build(course.id, prof.id)
    cancelled = await graph_build.cancel_build(queued.id)
    assert cancelled.status == "cancelled"
    assert await graph_build.run_build(queued.id) is None  # the worker skips it

    _index(course.id)
    running, _ = await graph_build.start_build(course.id, prof.id)
    assert running.id != queued.id

    async def cancel_mid_build(*args, **kwargs):
        await graph_build.cancel_build(running.id)  # the professor clicks Cancel during the LLM call
        return json.dumps(EXTRACTION)

    fake_llm.generate_full_response = lambda self, *a, **k: cancel_mid_build()
    assert await graph_build.run_build(running.id) is None
    stopped = await GraphBuild.get(running.id)
    assert stopped.status == "cancelled" and stopped.graph_id is None
    assert await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course.id) is None


async def test_build_with_a_dead_worker_is_reported_interrupted(make_user):
    prof, course = await _course(make_user)
    old = datetime.now(timezone.utc) - timedelta(minutes=30)
    await GraphBuild(course_id=course.id, status="running", step=3, started_at=old, heartbeat_at=old,
                     created_at=old).insert()
    latest = await graph_build.latest_build(course.id)
    assert latest.status == "failed" and latest.error == graph_build.INTERRUPTED
    assert (await GraphBuild.get(latest.id)).status == "failed"
    # ...so a new build can start
    build, created = await graph_build.start_build(course.id, prof.id)
    assert created and build.id != latest.id


async def test_eta_and_percent_follow_the_chunks():
    now = datetime.now(timezone.utc)
    build = GraphBuild(course_id=uuid.uuid4(), status="running", step=3, chunks_total=10, chunks_done=4,
                       started_at=now - timedelta(minutes=5), extract_started_at=now - timedelta(minutes=4))
    view = graph_build.serialize_build(build, now=now)
    assert view["percent"] == 37  # 5 + 80 * 0.4
    assert view["eta_s"] == 7 * 60  # one minute per chunk: 6 chunks left plus about one for the checks
    queued = GraphBuild(course_id=uuid.uuid4(), created_at=now - timedelta(minutes=3))
    assert graph_build.serialize_build(queued, now=now)["waiting_for_worker"] is True


async def test_first_map_builds_once_every_file_is_processed(make_user, _no_live_broker):
    prof, course = await _course(make_user)
    lecture = DocumentModel(course_id=course.id, filename="week1.mp4", s3_path="y", status="processing",
                            media_type="lecture", stage="transcribing", progress=0.3)
    await lecture.insert()
    assert await graph_build.maybe_auto_build(course.id) is None  # the lecture is still processing

    await DocumentModel.find_one({"_id": lecture.id}).update({"$set": {"status": "ready"}})
    build = await graph_build.maybe_auto_build(course.id)
    assert build and build.trigger == "auto" and build.requested_by is None
    assert build.events[0].message.startswith("Started automatically")
    # Only the first map: once a build was tried, the professor decides
    await graph_build.cancel_build(build.id)
    assert await graph_build.maybe_auto_build(course.id) is None


async def test_auto_build_can_be_switched_off(make_user, monkeypatch):
    _, course = await _course(make_user)
    monkeypatch.setattr(graph_build.settings, "AUTO_BUILD_MAP", False)
    assert await graph_build.maybe_auto_build(course.id) is None


async def test_setup_endpoint_shows_files_build_and_stale_map(make_user, api_client):
    prof, course = await _course(make_user)
    await DocumentModel(course_id=course.id, filename="week1.mp4", s3_path="y", status="processing",
                        media_type="lecture", stage="transcribing", progress=0.3).insert()
    student = await make_user("student")
    await Enrolment(course_id=course.id, student_id=student.id).insert()

    async with api_client(prof) as client:
        setup = (await client.get(f"/api/professor/graph/course/{course.id}/setup")).json()
        assert setup["phase"] == "processing" and setup["students"] == 1 and setup["build"] is None
        assert setup["documents"]["ready"] == 1 and setup["documents"]["processing"] == 1
        lecture = next(d for d in setup["documents"]["items"] if d["media_type"] == "lecture")
        assert lecture["stage"] == "transcribing" and lecture["progress"] == 0.3

        started = (await client.post(f"/api/professor/graph/course/{course.id}/build")).json()
        assert started["created"] and started["build"]["status"] == "queued"
        joined = (await client.post(f"/api/professor/graph/course/{course.id}/build")).json()
        assert not joined["created"] and joined["build"]["id"] == started["build"]["id"]
        assert (await client.get(f"/api/professor/graph/course/{course.id}/setup")).json()["phase"] == "building"

        cancel = await client.post(f"/api/professor/graph/builds/{started['build']['id']}/cancel")
        assert cancel.status_code == 200 and cancel.json()["status"] == "cancelled"
        assert (await client.post(f"/api/professor/graph/builds/{started['build']['id']}/cancel")).status_code == 409

    # A map built before a file finished processing is flagged as out of date
    built_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await KnowledgeGraph(topic="t", course_id=course.id, created_by=prof.id, created_at=built_at).insert()
    async with api_client(prof) as client:
        setup = (await client.get(f"/api/professor/graph/course/{course.id}/setup")).json()
    assert setup["graph"] and setup["materials_changed"] == ["notes0.pdf"]

    async with api_client(student) as client:
        assert (await client.get(f"/api/professor/graph/course/{course.id}/setup")).status_code == 403
    other = await make_user("professor")
    async with api_client(other) as client:
        assert (await client.post(f"/api/professor/graph/course/{course.id}/build")).status_code == 403


async def test_students_see_that_the_map_is_being_built(make_user, api_client):
    prof, course = await _course(make_user)
    student = await make_user("student")
    await Enrolment(course_id=course.id, student_id=student.id).insert()
    await graph_build.start_build(course.id, prof.id)
    async with api_client(student) as client:
        status = (await client.get(f"/api/student/graph/course/{course.id}/status")).json()
    assert status["status"] == "building" and status["build"]["status"] == "queued"
    assert set(status["build"]) >= {"percent", "message", "eta_s"} and "events" not in status["build"]


def test_console_never_fails_on_characters_it_cannot_encode(monkeypatch):
    import sys
    from app.core.console import make_console_safe
    raw = io.BytesIO()
    cp1252 = io.TextIOWrapper(raw, encoding="cp1252")
    monkeypatch.setattr(sys, "stdout", cp1252)
    make_console_safe()
    sys.stdout.write("learning rate \U0001d702, sum Σ")  # what crashed concept extraction on Windows
    sys.stdout.flush()
    assert b"learning rate" in raw.getvalue()


async def test_test_list_counts_submissions_and_grades_to_review(make_user, api_client):
    from app.models.test import Answer, Test, TestAttempt
    prof, course = await _course(make_user)
    test = Test(course_id=course.id, professor_id=prof.id, title="Quiz 1", description="", status="published")
    await test.insert()
    student = await make_user("student")
    await TestAttempt(test_id=test.id, student_id=student.id, course_id=course.id, status="submitted",
                      answers=[Answer(question_id=uuid.uuid4(), question_type="short_answer", review_status="needs_review"),
                               Answer(question_id=uuid.uuid4(), question_type="mcq", review_status="auto")]).insert()
    await TestAttempt(test_id=test.id, student_id=uuid.uuid4(), course_id=course.id, status="in_progress").insert()
    async with api_client(prof) as client:
        listed = (await client.get(f"/api/professor/tests/course/{course.id}")).json()
    assert listed[0]["submissions"] == 1 and listed[0]["answers_to_review"] == 1
    assert listed[0]["created_at"]
