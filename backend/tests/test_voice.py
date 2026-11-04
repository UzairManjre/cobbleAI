"""Ask by voice: a spoken question becomes text on this server, biased toward the course's terms."""

import io
import uuid
import wave

import numpy as np
import pytest

from app.models.course import Course, Enrolment
from app.models.graph import KnowledgeGraph
from app.services.media import voice


def _wav(seconds: float) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        tone = 0.2 * np.sin(2 * np.pi * 220 * np.arange(int(16000 * seconds)) / 16000)
        w.writeframes((tone * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def test_vocabulary_prompt_lists_course_terms_within_whispers_window():
    prompt = voice.vocabulary_prompt(["Banker's Algorithm", "dropna", "", "Page Fault"])
    assert prompt == "Course terms: Banker's Algorithm, dropna, Page Fault."
    long = voice.vocabulary_prompt([f"Concept number {i}" for i in range(200)])
    assert len(long) < 650 and voice.vocabulary_prompt([]) == ""


def test_empty_and_overlong_recordings_are_refused_before_the_model_runs(monkeypatch):
    monkeypatch.setattr(voice, "_load_model", lambda *a, **k: pytest.fail("the model must not load"))
    with pytest.raises(ValueError, match="empty"):
        voice.transcribe_question(_wav(0.1), ".wav")
    monkeypatch.setattr(voice, "MAX_SECONDS", 1)
    with pytest.raises(ValueError, match="under 1 seconds"):
        voice.transcribe_question(_wav(2), ".wav")
    with pytest.raises(ValueError, match="Could not read"):
        voice.transcribe_question(b"not audio", ".webm")


def test_recording_is_transcribed_with_the_language_hint_and_deleted(monkeypatch):
    calls = []

    class FakeModel:
        def transcribe(self, audio, **kwargs):
            calls.append(kwargs)
            seg = type("Seg", (), {"text": " What is a page fault? "})()
            return iter([seg]), type("Info", (), {"language": "en"})()

    monkeypatch.setattr(voice, "_model", FakeModel())
    removed = []
    real_remove = voice.os.remove
    monkeypatch.setattr(voice.os, "remove", lambda p: (removed.append(p), real_remove(p)))
    result = voice.transcribe_question(_wav(1.5), ".wav", prompt="Course terms: Page Fault.", language="hi")
    assert result["text"] == "What is a page fault?" and result["language"] == "en" and result["duration_sec"] == 1.5
    assert calls[0]["initial_prompt"] == "Course terms: Page Fault." and calls[0]["language"] == "hi"
    assert removed  # the temporary copy of the recording is gone
    voice.transcribe_question(_wav(1.5), ".wav", language="../../etc")
    assert calls[1]["language"] is None  # only plain language codes reach the model


async def test_transcribe_endpoint_uses_the_course_map_as_vocabulary(make_user, api_client, monkeypatch):
    prof = await make_user("professor")
    student = await make_user("student")
    course = Course(title="OS", code=f"C{uuid.uuid4().hex[:6]}", professor_id=prof.id)
    await course.insert()
    await Enrolment(course_id=course.id, student_id=student.id).insert()
    await KnowledgeGraph(topic="t", course_id=course.id, created_by=prof.id,
                         nodes=[{"id": "n1", "label": "Banker's Algorithm", "description": ""}]).insert()
    seen = {}

    def fake(data, suffix, prompt, language):
        seen.update(suffix=suffix, prompt=prompt, language=language)
        return {"text": "explain bankers algorithm", "language": "en", "duration_sec": 2.0, "seconds": 0.5}

    monkeypatch.setattr(voice, "transcribe_question", fake)
    files = {"audio": ("question.webm", b"x" * 100, "audio/webm")}
    async with api_client(student) as client:
        res = await client.post("/api/tutor/transcribe", files=files, data={"course_id": str(course.id)})
    assert res.status_code == 200 and res.json()["text"] == "explain bankers algorithm"
    assert seen == {"suffix": ".webm", "prompt": "Course terms: Banker's Algorithm.", "language": None}

    outsider = await make_user("student")
    async with api_client(outsider) as client:
        assert (await client.post("/api/tutor/transcribe", files=files, data={"course_id": str(course.id)})).status_code == 403

    def refuse(*args):
        raise ValueError("The recording is empty. Check that the right microphone is selected.")

    monkeypatch.setattr(voice, "transcribe_question", refuse)
    async with api_client(student) as client:
        res = await client.post("/api/tutor/transcribe", files=files)
    assert res.status_code == 422 and "microphone" in res.json()["detail"]

    monkeypatch.setattr(voice, "MAX_BYTES", 10)
    async with api_client(student) as client:
        assert (await client.post("/api/tutor/transcribe", files=files)).status_code == 413
