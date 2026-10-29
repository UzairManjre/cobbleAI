"""Characterization tests: document upload/delete, study plans, analytics tasks."""

import io
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import mongomock
from bson.binary import Binary
import pytest
from qdrant_client.models import PointStruct, VectorParams, Distance

from app.models.course import Course, Enrolment
from app.models.document import DocumentModel
from app.models.graph import KnowledgeGraph
from app.models.study_plan import StudyPlan
from tests.conftest import fake_vector


@pytest.fixture
def s3_mock(monkeypatch):
    s3 = MagicMock()
    monkeypatch.setattr("app.services.document_service.get_s3_client", lambda: s3)
    return s3


async def _course(make_user):
    professor = await make_user("professor")
    course = Course(professor_id=professor.id, title="Data Science", code="DS1")
    await course.insert()
    return professor, course


async def test_upload_stores_document_and_queues_processing(make_user, api_client, s3_mock, no_celery):
    professor, course = await _course(make_user)
    files = {"files": ("week1.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
    async with api_client(professor) as client:
        res = await client.post("/api/professor/documents/upload", data={"course_id": str(course.id)}, files=files)
    assert res.status_code == 202, res.text
    assert res.json()["uploaded"] == ["week1.pdf"]

    doc = await DocumentModel.find_one(DocumentModel.course_id == course.id)
    assert doc.status == "pending"
    assert doc.file_size_bytes == len(b"%PDF-1.4 fake")
    assert doc.s3_path == f"courses/{course.id}/documents/{doc.id}.pdf"
    assert no_celery == [("process_document", (str(doc.id),))]
    s3_mock.upload_fileobj.assert_called_once()


async def test_upload_rejects_unsupported_type(make_user, api_client, s3_mock, no_celery):
    professor, course = await _course(make_user)
    files = {"files": ("notes.txt", io.BytesIO(b"hello"), "text/plain")}
    async with api_client(professor) as client:
        res = await client.post("/api/professor/documents/upload", data={"course_id": str(course.id)}, files=files)
    assert res.status_code == 400
    assert no_celery == []


async def test_delete_document_removes_its_vectors(make_user, api_client, s3_mock, qdrant_memory):
    professor, course = await _course(make_user)
    doc = DocumentModel(course_id=course.id, filename="a.pdf", s3_path="k", status="ready")
    other = DocumentModel(course_id=course.id, filename="b.pdf", s3_path="k2", status="ready")
    await doc.insert()
    await other.insert()

    collection = f"course_{course.id}"
    qdrant_memory.create_collection(collection, vectors_config=VectorParams(size=384, distance=Distance.COSINE))
    qdrant_memory.upsert(collection, points=[
        PointStruct(id=str(uuid.uuid4()), vector=fake_vector("alpha"), payload={"doc_id": str(doc.id), "text": "alpha"}),
        PointStruct(id=str(uuid.uuid4()), vector=fake_vector("beta"), payload={"doc_id": str(other.id), "text": "beta"}),
    ])

    async with api_client(professor) as client:
        res = await client.delete(f"/api/professor/documents/{doc.id}")
    assert res.status_code == 200

    remaining, _ = qdrant_memory.scroll(collection, with_payload=True)
    assert [p.payload["doc_id"] for p in remaining] == [str(other.id)]


async def test_study_plan_generate_defaults_to_newest_graph(make_user, api_client, monkeypatch):
    from app.services.study_plan_generator import StudyPlanGenerator

    professor, course = await _course(make_user)
    student = await make_user("student")
    await Enrolment(course_id=course.id, student_id=student.id).insert()
    graph = KnowledgeGraph(
        topic="DS", course_id=course.id, created_by=professor.id,
        nodes=[{"id": "a", "label": "Vectors"}, {"id": "b", "label": "Matrices"}],
        edges=[{"id": "e", "from": "a", "to": "b", "relation": "prerequisite_for"}],
    )
    await graph.insert()

    async def offline_plan(self, course_title, course_description, graph_nodes, graph_edges, document_filenames=None):
        # The deterministic fallback path, fed the same dicts the LLM path gets
        return self._generate_fallback_plan(graph_nodes, graph_edges, course_title)
    monkeypatch.setattr(StudyPlanGenerator, "generate_plan", offline_plan)

    async with api_client(student) as client:
        res = await client.post("/api/student/study-plans/generate", json={"course_id": str(course.id)})
        assert res.status_code == 200, res.text
        res = await client.get(f"/api/student/study-plans/active/{course.id}")
        assert res.status_code == 200
        plan = res.json()["study_plan"]
        assert [t["node_id"] for t in plan["topics"]] == ["a", "b"]
        assert plan["topics"][1]["prerequisites"] == ["a"]

        res = await client.post(f"/api/student/study-plans/{course.id}/topic/a/complete")
        assert res.status_code == 200
        assert res.json()["progress"]["completed_topics"] == ["a"]

    stored = await StudyPlan.find_one(StudyPlan.student_id == student.id)
    assert stored.graph_id == graph.id


def test_daily_aggregates_task_runs_on_real_documents(monkeypatch):
    from app.tasks import analytics_aggregation as agg

    db = mongomock.MongoClient(tz_aware=True, uuidRepresentation="standard")["agg_test"]
    monkeypatch.setattr(agg, "_get_sync_db", lambda: db)
    day = datetime(2026, 10, 27, 10, tzinfo=timezone.utc)
    # Stored as BSON binary UUIDs, as the Motor client writes them
    user_id, course_id, graph_id = (Binary.from_uuid(uuid.uuid4()) for _ in range(3))
    db["analytics_events"].insert_many([
        {"user_id": user_id, "user_role": "student", "event_type": "session_started", "course_id": course_id,
         "graph_id": graph_id, "node_id": "n1", "timestamp": day, "payload": {"node_label": "Sorting"}},
        {"user_id": user_id, "user_role": "student", "event_type": "question_asked", "course_id": course_id,
         "graph_id": graph_id, "node_id": "n1", "timestamp": day + timedelta(hours=1), "payload": {}},
    ])

    result = agg.compute_daily_aggregates("2026-10-27")
    assert result["user_count"] == 1 and result["course_count"] == 1 and result["node_count"] == 1
    node = db["analytics_aggregates"].find_one({"aggregate_type": "node_daily"})
    assert node["metrics"]["questions_asked"] == 1
    assert isinstance(node["date"], datetime)


def test_dropout_detection_handles_naive_mongo_datetimes(monkeypatch):
    from app.tasks import analytics_aggregation as agg

    db = mongomock.MongoClient(uuidRepresentation="standard")["agg_test2"]  # naive datetimes, like a default pymongo client
    monkeypatch.setattr(agg, "_get_sync_db", lambda: db)
    db["analytics_user_profiles"].insert_one({
        "user_id": Binary.from_uuid(uuid.uuid4()),
        "lifetime_stats": {"last_active_date": datetime.utcnow() - timedelta(days=20), "total_sessions": 1},
        "performance_indicators": {},
    })
    result = agg.detect_dropout_risk()
    assert result is not None
    profile = db["analytics_user_profiles"].find_one()
    assert profile["performance_indicators"]["days_inactive"] >= 19


async def test_topic_deep_dive_plan_is_generated_and_reloaded(make_user, api_client, fake_llm):
    import json as _json
    professor, course = await _course(make_user)
    student = await make_user("student")
    await Enrolment(course_id=course.id, student_id=student.id).insert()
    await KnowledgeGraph(
        topic="DS", course_id=course.id, created_by=professor.id,
        nodes=[{"id": "a", "label": "Vectors"}, {"id": "b", "label": "Matrices"}],
        edges=[{"id": "e", "from": "a", "to": "b", "relation": "prerequisite_for"}],
    ).insert()
    fake_llm.queue(_json.dumps({"title": "Deep Dive: Vectors", "description": "d", "learning_path": [{"step": 1, "title": "Read"}],
                                "exercises": [{"title": "Add two vectors", "description": "x", "type": "quiz"}, {"no": "title"}]}))
    async with api_client(student) as client:
        assert (await client.get("/api/student/study-plans/topics", params={"node_id": "a", "course_id": str(course.id)})).json() == {"topic_plan": None}
        res = await client.post("/api/student/study-plans/topics/generate", params={"node_id": "a", "course_id": str(course.id)})
        assert res.status_code == 200, res.text
        plan = res.json()["topic_plan"]
        assert plan["title"] == "Deep Dive: Vectors" and [e["title"] for e in plan["exercises"]] == ["Add two vectors"]
        assert plan["related_topics"] == [{"node_id": "b", "label": "Matrices", "relation": "prerequisite_for"}]
        again = (await client.get("/api/student/study-plans/topics", params={"node_id": "a", "course_id": str(course.id)})).json()
        assert again["topic_plan"]["id"] == plan["id"]
        bad = await client.post("/api/student/study-plans/topics/generate", params={"node_id": "zzz", "course_id": str(course.id)})
        assert bad.status_code == 404
