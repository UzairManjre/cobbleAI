"""Pilot readiness: research consent, the anonymised export, and self-service profile limits."""

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.models.analytics.event import AnalyticsEvent
from app.models.tutor import TutorRun
from app.models.user import User
from app.services.research_export import Pseudonymizer, export_research_logs

SALT = "test-salt-0123456789abcdef"


async def test_consent_is_opt_in_versioned_and_revocable(make_user, api_client):
    student = await make_user("student")
    async with api_client(student) as client:
        status = (await client.get("/api/consent")).json()
        assert status["research_consent"] is None and status["needs_decision"] and status["text"]
        given = (await client.put("/api/consent", json={"consent": True})).json()
        assert given["research_consent"] is True and given["research_consent_at"] and not given["needs_decision"]
        withdrawn = (await client.put("/api/consent", json={"consent": False})).json()
        assert withdrawn["research_consent"] is False
    assert (await User.get(student.id)).research_consent is False


async def test_user_cannot_change_own_role(make_user, api_client):
    student = await make_user("student")
    async with api_client(student) as client:
        await client.patch("/users/me", json={"role": "professor", "name": "Renamed"})
    stored = await User.get(student.id)
    assert stored.role == "student"


async def test_export_contains_only_consenting_users_under_pseudonyms(make_user, tmp_path):
    yes = await make_user("student", name="Alice Consenting")
    no = await make_user("student", name="Bob Declined")
    yes.research_consent, yes.research_consent_at, yes.research_consent_version = True, datetime.now(timezone.utc), "v1"
    await yes.save()
    no.research_consent = False
    await no.save()
    session_id, lecture_id = uuid.uuid4(), uuid.uuid4()
    for user in (yes, no):
        await AnalyticsEvent(user_id=user.id, user_role="student", event_type="node_visited", event_category="navigation",
                             payload={"email": user.email, "dwell": 3}, ip_address="10.0.0.1").insert()
        await TutorRun(user_id=user.id, user_role="student", question=f"question from {user.name}").insert()
    await TutorRun(user_id=yes.id, user_role="student", question="eval", eval_run="run-1").insert()
    # Payloads carry ids and free text too
    await AnalyticsEvent(user_id=yes.id, user_role="student", event_type="question_asked", event_category="chat",
                         session_id=session_id,
                         payload={"sessionId": str(session_id), "lecture_id": str(lecture_id), "node_id": "node_abc",
                                  "cited_chunk_ids": ["c1"], "query_text": "Alice Consenting asks about heaps"}).insert()

    manifest = await export_research_logs(tmp_path, SALT)
    assert manifest["counts"]["participants"] == 1 and manifest["counts"]["events"] == 2
    assert manifest["counts"]["tutor_runs"] == 1  # the evaluation run is not participant data

    dump = "".join(p.read_text(encoding="utf-8") for p in tmp_path.iterdir())
    for secret in (str(yes.id), yes.email, "Alice Consenting", "Bob", "10.0.0.1", SALT, str(session_id), str(lecture_id)):
        assert secret not in dump
    pid = Pseudonymizer(SALT)
    events = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text(encoding="utf-8").splitlines()]
    event = next(e for e in events if e["event_type"] == "node_visited")
    assert event["pid"] == pid("user", yes.id) and event["payload"] == {"dwell": 3}
    asked = next(e for e in events if e["event_type"] == "question_asked")["payload"]
    # Payload ids use the same pseudonyms as the columns (a lecture is a document), node ids stay
    assert asked["sessionId"] == pid("session", session_id) == next(e for e in events if e["event_type"] == "question_asked")["session"]
    assert asked["lecture_id"] == pid("document", lecture_id) and asked["node_id"] == "node_abc"
    assert asked["cited_chunk_ids"] == [pid("chunk", "c1")] and asked["query_text"] == "[redacted] asks about heaps"
    assert Pseudonymizer("another-salt-0123456789")("user", yes.id) != event["pid"]


def test_export_refuses_a_weak_salt():
    with pytest.raises(ValueError):
        Pseudonymizer("short")
