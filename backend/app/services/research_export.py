"""Anonymised research export (studies S4 and S7).

Only users whose recorded decision is consent are exported. Every user, course, session
and test id is replaced by a salted SHA-256 code, so codes are stable within one export
salt but cannot be linked back without it. Names, emails, IP addresses and user agents
are never written, and a participant's own name or email is redacted from their free text.
"""

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional

from beanie.operators import In

from app.models.analytics.event import AnalyticsEvent
from app.models.learner import ConceptMastery
from app.models.test import Test, TestAttempt
from app.models.tutor import TutorRun
from app.models.user import User

DROP_PAYLOAD_KEYS = {"email", "name", "ip", "ip_address", "user_agent", "token"}


class Pseudonymizer:
    def __init__(self, salt: str):
        if not salt or len(salt) < 16:
            raise ValueError("Use a secret salt of at least 16 characters, and keep it out of the export")
        self._salt = salt.encode()

    def __call__(self, kind: str, value) -> Optional[str]:
        if value is None:
            return None
        return hashlib.sha256(self._salt + f"{kind}:{value}".encode()).hexdigest()[:16]


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
            n += 1
    return n


def _redactor(users: Iterable[User]):
    """Remove each participant's own name and email from free text (questions and answers)."""
    import re
    patterns = {}
    for u in users:
        terms = [t for t in (u.name, u.email) if t and len(t.strip()) >= 3]
        if terms:
            patterns[u.id] = re.compile("|".join(re.escape(t.strip()) for t in sorted(terms, key=len, reverse=True)), re.IGNORECASE)

    def redact(user_id, text: Optional[str]) -> Optional[str]:
        pattern = patterns.get(user_id)
        return pattern.sub("[redacted]", text) if pattern and text else text
    return redact


ID_KEY = re.compile(r"(_ids?|Ids?)$")  # session_id, cited_chunk_ids, lectureId, ...
KEEP_ID_KEYS = {"node_id", "nodeid", "previous_node_id", "current_node_id"}  # content hashes, exported as-is
TEXT_KEYS = {"query_text", "question", "message", "content", "comment", "answer", "text", "question_text"}
# Same pseudonym kind as the top-level columns, so payload ids still join (a lecture is a document)
KIND_ALIASES = {"doc": "document", "lecture": "document", "source_doc": "document", "student": "user", "cited_chunk": "chunk"}


def _clean_payload(payload: dict, pid=None, redact=None, user_id=None) -> dict:
    """Drop identifying keys, replace every database id with its pseudonym (top-level ids alone
    are not enough: payloads carry session, message, lecture and document ids too) and redact the
    participant's own name and email from free text."""
    out = {}
    for key, value in (payload or {}).items():
        low = key.lower()
        if low in DROP_PAYLOAD_KEYS:
            continue
        if pid and ID_KEY.search(key) and low not in KEEP_ID_KEYS:
            kind = re.sub(r"(_ids?|ids?)$", "", low) or "id"
            kind = KIND_ALIASES.get(kind, kind)
            value = [pid(kind, v) for v in value] if isinstance(value, list) else pid(kind, value)
        elif isinstance(value, dict):
            value = _clean_payload(value, pid, redact, user_id)
        elif redact and low in TEXT_KEYS and isinstance(value, str):
            value = redact(user_id, value)
        out[key] = value
    return out


async def export_research_logs(out_dir: Path, salt: str, course_id: Optional[uuid.UUID] = None,
                               since: Optional[datetime] = None) -> dict:
    pid = Pseudonymizer(salt)
    out_dir.mkdir(parents=True, exist_ok=True)

    users = await User.find(User.research_consent == True).to_list()  # noqa: E712
    ids = [u.id for u in users]
    counts: Dict[str, int] = {}
    counts["participants"] = _write_jsonl(out_dir / "participants.jsonl", (
        {"pid": pid("user", u.id), "role": u.role, "consent_at": _iso(u.research_consent_at),
         "consent_version": u.research_consent_version} for u in users))

    def scoped(model, user_field, time_field):
        filters = [In(getattr(model, user_field), ids)]
        if course_id:
            filters.append(getattr(model, "course_id") == course_id)
        if since and time_field:
            filters.append(getattr(model, time_field) >= since)
        return model.find(*filters)

    redact = _redactor(users)
    events = await scoped(AnalyticsEvent, "user_id", "timestamp").to_list() if ids else []
    counts["events"] = _write_jsonl(out_dir / "events.jsonl", (
        {"pid": pid("user", e.user_id), "role": e.user_role, "event_type": e.event_type, "category": e.event_category,
         "course": pid("course", e.course_id), "session": pid("session", e.session_id), "node_id": e.node_id,
         "document": pid("document", e.document_id), "payload": _clean_payload(e.payload, pid, redact, e.user_id),
         "timestamp": _iso(e.timestamp)}
        for e in events))

    runs = [r for r in (await scoped(TutorRun, "user_id", "created_at").to_list() if ids else []) if r.eval_run is None]
    counts["tutor_runs"] = _write_jsonl(out_dir / "tutor_runs.jsonl", (
        {"run": pid("run", r.id), "pid": pid("user", r.user_id), "course": pid("course", r.course_id),
         "session": pid("session", r.session_id), "node_id": r.node_id, "endpoint": r.endpoint, "mode": r.mode,
         "hint_level": r.hint_level, "question": redact(r.user_id, r.question), "answer": redact(r.user_id, r.answer),
         "decision": r.decision,
         "decline_reason": r.decline_reason, "support_level": r.support_level, "top_support": r.top_support,
         "cited_sids": r.cited_sids,
         "sources": [{"sid": s.get("sid"), "document": pid("document", s.get("doc_id")), "location": s.get("location"),
                      "media_type": s.get("media_type"), "support": s.get("support"), "signals": s.get("signals")}
                     for s in r.sources],
         "config_hash": r.config_hash, "prompt_version": r.prompt_version, "model": r.model,
         "latency_ms": r.latency_ms, "created_at": _iso(r.created_at)}
        for r in runs))

    attempts = await scoped(TestAttempt, "student_id", "submitted_at").to_list() if ids else []
    tests = {t.id: t for t in await Test.find(In(Test.id, list({a.test_id for a in attempts}))).to_list()} if attempts else {}

    def grade_rows():
        for a in attempts:
            questions = {q.id: q for q in (tests[a.test_id].questions if a.test_id in tests else [])}
            for ans in a.answers:
                q = questions.get(ans.question_id)
                yield {
                    "pid": pid("user", a.student_id), "course": pid("course", a.course_id), "test": pid("test", a.test_id),
                    "attempt": pid("attempt", a.id), "question": pid("question", ans.question_id),
                    "question_type": q.type if q else None, "cognitive_level": q.cognitive_level if q else None,
                    "node_id": q.node_id if q else None, "max_marks": q.marks if q else None,
                    "is_correct": ans.is_correct, "marks_awarded": ans.marks_awarded, "ai_score": ans.ai_score,
                    "grade_confidence": ans.grade_confidence, "review_status": ans.review_status,
                    "self_confidence": ans.confidence, "submitted_at": _iso(a.submitted_at),
                }
    counts["grades"] = _write_jsonl(out_dir / "grades.jsonl", grade_rows())

    mastery = await scoped(ConceptMastery, "student_id", None).to_list() if ids else []
    counts["mastery"] = _write_jsonl(out_dir / "mastery.jsonl", (
        {"pid": pid("user", m.student_id), "course": pid("course", m.course_id), "node_id": m.node_id,
         "p_mastery": m.p_mastery, "n_obs": m.n_obs, "n_correct": m.n_correct, "params_version": m.params_version,
         "updated_at": _iso(m.updated_at)} for m in mastery))

    manifest = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "pseudonymisation": "salted SHA-256, first 16 hex characters; the salt is not included",
        "consent": "users whose latest recorded decision is consent",
        "course": pid("course", course_id) if course_id else "all",
        "since": _iso(since),
        "counts": counts,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
