"""Lecture pipeline (Upgrade E): captions, chapters, segments, keyframes, pipeline, API, upload."""

import io
import json
import uuid
from unittest.mock import MagicMock

import pytest

from app.models.course import Course, Enrolment
from app.models.document import DocumentModel, TimeRange
from app.models.lecture import LectureChapter, LectureFrame, LectureTranscript, TranscriptSegment
from app.services.media.captions import to_text, to_vtt, vtt_timestamp
from app.services.media.chapters import fallback_chapters, finalize_chapters, generate_chapters
from app.services.media.lecture_pipeline import build_lecture_segments


def _segments(n=12, step=10.0, text="Recursion calls itself until a base case stops it."):
    return [{"id": i, "start": i * step, "end": (i + 1) * step, "text": f"{text} Part {i}."} for i in range(n)]


#   Captions

def test_vtt_formatting_and_exclusions():
    assert vtt_timestamp(3725.5) == "01:02:05.500"
    segs = _segments(3)
    vtt = to_vtt(segs, [{"start": 12, "end": 18}])
    assert vtt.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:10.000" in vtt
    assert "Part 1." not in vtt and "Part 2." in vtt  # midpoint 15 s is masked
    assert "[0:20] Recursion" in to_text(segs)


#   Chapters

def test_finalize_chapters_tiles_the_recording():
    chapters = finalize_chapters([
        {"start": 300, "title": "Base cases", "notes": [{"t": 310, "text": "Stop condition"}]},
        {"start": 5, "title": "Intro", "summary": "What recursion is."},
        {"start": 310, "title": "Too close, dropped"},
        {"start": 50, "title": ""},
    ], duration=600, generated_by="llm")
    assert [(c["start"], c["end"], c["title"]) for c in chapters] == [(0.0, 300.0, "Intro"), (300.0, 600.0, "Base cases")]
    assert chapters[1]["notes"] == [{"t": 310.0, "text": "Stop condition"}]


def test_llm_note_times_snap_to_matching_transcript_line():
    segs = [{"start": 0.0, "end": 4.0, "text": "Welcome to the lecture."},
            {"start": 4.1, "end": 8.0, "text": "When a page fault occurs the OS picks a victim page."},
            {"start": 8.0, "end": 12.0, "text": "FIFO evicts the oldest page."}]
    chapters = finalize_chapters([{"start": 0, "title": "Intro", "notes": [
        {"t": 0, "text": "A page fault forces the OS to pick a victim page"},
        {"t": 0, "text": "Something never said"}]}], duration=12, generated_by="llm", segments=segs)
    assert [n["t"] for n in chapters[0]["notes"]] == [4.1, 0.0]


def test_fallback_chapters_snap_to_slide_changes():
    segs = _segments(n=90)  # 15 minutes
    chapters = fallback_chapters(segs, duration=900, slide_times=[290.0, 640.0])
    assert [c["start"] for c in chapters] == [0.0, 290.0, 640.0]
    assert all(c["generated_by"] == "fallback" and c["title"] for c in chapters)
    assert chapters[0]["notes"] and chapters[0]["summary"]


async def test_generate_chapters_uses_llm_then_falls_back(fake_llm):
    segs = _segments(n=60)
    fake_llm.queue(json.dumps([
        {"start": 0, "title": "Intro", "summary": "s", "notes": []},
        {"start": 300, "title": "Base cases", "summary": "t", "notes": [{"t": 320, "text": "n"}]},
    ]))
    chapters = await generate_chapters(segs, 600)
    assert [c["title"] for c in chapters] == ["Intro", "Base cases"] and chapters[0]["generated_by"] == "llm"

    fake_llm.queue("Sorry, I cannot do that.")
    chapters = await generate_chapters(segs, 600)
    assert chapters and chapters[0]["generated_by"] == "fallback"


#   Segments for indexing

def _lecture_docs(doc_id, course_id):
    transcript = LectureTranscript(doc_id=doc_id, course_id=course_id, duration_sec=120,
                                   segments=[TranscriptSegment(**s) for s in _segments(n=12)])
    chapters = [
        LectureChapter(doc_id=doc_id, course_id=course_id, index=0, start=0, end=60, title="What is recursion"),
        LectureChapter(doc_id=doc_id, course_id=course_id, index=1, start=60, end=120, title="Base cases"),
    ]
    frames = [
        LectureFrame(doc_id=doc_id, course_id=course_id, t=5.0, s3_key="k0", ocr_text="def fact(n):", caption="Code for factorial"),
        LectureFrame(doc_id=doc_id, course_id=course_id, t=70.0, s3_key="k1", ocr_text="", caption=""),
    ]
    return transcript, chapters, frames


def test_build_lecture_segments_windows_chapters_and_exclusions():
    doc_id, course_id = uuid.uuid4(), uuid.uuid4()
    transcript, chapters, frames = _lecture_docs(doc_id, course_id)
    segs = build_lecture_segments(transcript, frames, chapters, excluded=[TimeRange(start=60, end=80)])

    spoken = [s for s in segs if s.source_type == "transcript"]
    assert spoken[0].t_start == 0 and spoken[0].t_end >= 45
    assert all(not (60 <= (s.t_start + s.t_end) / 2 <= 80) for s in spoken if s.t_end - s.t_start <= 10)
    assert all("Part 6." not in s.text and "Part 7." not in s.text for s in spoken)  # masked Q&A
    assert spoken[-1].extra["chapter_title"] == "Base cases"
    assert spoken[0].extra["chapter_id"] == f"{doc_id}:ch0"

    slides = [s for s in segs if s.source_type == "frame_ocr"]
    assert len(slides) == 1 and "def fact" in slides[0].text and slides[0].t_end == 70.0


#   Keyframes on a synthetic video

def _synthetic_video(path, colours=((255, 0, 0), (0, 255, 0), (0, 0, 255)), seconds_each=2, fps=5):
    av = pytest.importorskip("av")
    import numpy as np
    with av.open(str(path), mode="w") as container:
        stream = container.add_stream("mpeg4", rate=fps)
        stream.width, stream.height, stream.pix_fmt = 160, 96, "yuv420p"
        for colour in colours:
            for _ in range(seconds_each * fps):
                img = np.zeros((96, 160, 3), dtype=np.uint8)
                img[:] = colour
                for packet in stream.encode(av.VideoFrame.from_ndarray(img, format="rgb24")):
                    container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)


def test_keyframes_detect_slide_changes(tmp_path):
    from app.services.media.frames import extract_keyframes, probe
    video = tmp_path / "lecture.mp4"
    _synthetic_video(video)
    info = probe(str(video))
    assert info["has_video"] and info["duration_sec"] == pytest.approx(6, abs=1)
    keyframes = extract_keyframes(str(video), fps=1)
    assert len(keyframes) == 3
    assert keyframes[0].t == 0 and 1.5 <= keyframes[1].t <= 2.5 and keyframes[2].jpeg[:2] == b"\xff\xd8"


def test_keyframes_detect_text_only_slide_changes(tmp_path):
    # Same template, only the title changes: a mean-difference test misses these (found in the live smoke test)
    av = pytest.importorskip("av")
    import numpy as np
    from PIL import Image, ImageDraw
    from app.services.media.frames import extract_keyframes
    video = tmp_path / "slides.mp4"
    with av.open(str(video), mode="w") as container:
        stream = container.add_stream("mpeg4", rate=2)
        stream.width, stream.height, stream.pix_fmt = 640, 360, "yuv420p"
        for title in ("FIFO", "LRU", "OPT"):
            img = Image.new("RGB", (640, 360), (250, 250, 245))
            draw = ImageDraw.Draw(img)
            draw.rectangle([0, 0, 640, 50], fill=(20, 60, 120))
            draw.text((40, 150), title, fill=(0, 0, 0), font_size=48)
            frame = np.asarray(img)
            for _ in range(6):
                for packet in stream.encode(av.VideoFrame.from_ndarray(frame, format="rgb24")):
                    container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    keyframes = extract_keyframes(str(video), fps=1)
    assert [round(k.t) for k in keyframes] == [0, 3, 6]


#   Full pipeline + API

@pytest.fixture
def lecture_course(make_user):
    async def _make():
        professor = await make_user("professor")
        student = await make_user("student")
        course = Course(professor_id=professor.id, title="Programming", code="CS1")
        await course.insert()
        await Enrolment(course_id=course.id, student_id=student.id).insert()
        return professor, student, course
    return _make


async def test_pipeline_and_lecture_api(lecture_course, api_client, qdrant_memory, fake_llm, monkeypatch, tmp_path):
    from app.services.media import transcribe as transcribe_mod, vision
    from app.services.media.transcribe import TranscriptResult
    from app.tasks.media import run_process_lecture

    professor, student, course = await lecture_course()
    video = tmp_path / "lec.mp4"
    _synthetic_video(video)
    doc = DocumentModel(course_id=course.id, filename="lecture1.mp4", s3_path="k/lec.mp4", media_type="lecture",
                        file_type="mp4", content_type="video/mp4")
    await doc.insert()

    s3 = MagicMock()
    s3.download_file.side_effect = lambda bucket, key, dest: open(dest, "wb").write(video.read_bytes())
    monkeypatch.setattr("app.services.media.lecture_pipeline.get_s3_client", lambda: s3)
    monkeypatch.setattr("app.tasks.media.settings.FRAME_CAPTIONING", False, raising=False)
    monkeypatch.setattr("app.core.config.settings.FRAME_CAPTIONING", False)
    monkeypatch.setattr(vision, "ocr_image", lambda jpeg: "Recursion slide")
    monkeypatch.setattr("app.core.db.connect_to_mongo", _noop)
    segs = _segments(n=6, step=1.0, text="Recursion calls itself until a base case stops it.")
    segs[3]["avg_logprob"] = -2.0
    monkeypatch.setattr(transcribe_mod, "transcribe", lambda path, prompt=None, language=None: TranscriptResult(
        segments=[{**s, "avg_logprob": s.get("avg_logprob", -0.2), "no_speech_prob": 0.01} for s in segs],
        language="en", duration_sec=6.0, model="fake-whisper", real_time_factor=0.1))
    fake_llm.queue(json.dumps([{"start": 0, "title": "Recursion basics", "summary": "Recursion and base cases.", "notes": [{"t": 1, "text": "Base case"}]}]))

    assert await run_process_lecture(str(doc.id)) is True
    doc = await DocumentModel.get(doc.id)
    assert doc.status == "ready" and doc.chunk_count > 0 and doc.has_video and doc.progress == 1.0
    assert await LectureFrame.find(LectureFrame.doc_id == doc.id).count() == 3
    s3.put_object.assert_called()

    points, _ = qdrant_memory.scroll(f"course_{course.id}_v2", with_payload=True, limit=100)
    kinds = {p.payload["source_type"] for p in points}
    assert {"transcript", "frame_ocr", "chapter_summary"} <= kinds
    assert all(p.payload["media_type"] == "lecture" for p in points)

    monkeypatch.setattr("app.api.common.lectures.presigned_get_url", lambda key, **kw: f"http://minio/{key}")
    async with api_client(student) as client:
        data = (await client.get(f"/api/lectures/{doc.id}")).json()
        assert data["media_url"] == "http://minio/k/lec.mp4"
        assert data["chapters"][0]["title"] == "Recursion basics"
        assert any(s["low_confidence"] for s in data["transcript"]["segments"])
        assert len(data["frames"]) == 3 and data["excluded_ranges"] == []
        vtt = await client.get(f"/api/lectures/{doc.id}/captions.vtt")
        assert vtt.headers["content-type"].startswith("text/vtt") and "Part 2." in vtt.text
        txt = await client.get(f"/api/lectures/{doc.id}/transcript.txt")
        assert "attachment" in txt.headers["content-disposition"] and "[0:00]" in txt.text
        listing = (await client.get(f"/api/lectures/course/{course.id}")).json()
        assert listing[0]["id"] == str(doc.id)
        assert (await client.put(f"/api/lectures/{doc.id}/exclusions", json={"ranges": []})).status_code == 403

    rebuilds = []
    monkeypatch.setattr("app.tasks.media.rebuild_lecture.delay", lambda doc_id: rebuilds.append(doc_id))
    async with api_client(professor) as client:
        res = await client.put(f"/api/lectures/{doc.id}/exclusions", json={"ranges": [{"start": 0, "end": 6, "reason": "Q&A"}]})
        assert res.status_code == 200 and rebuilds == [str(doc.id)]
        assert (await client.put(f"/api/lectures/{doc.id}/exclusions", json={"ranges": [{"start": 5, "end": 2}]})).status_code == 400
    # Everything spoken was masked, so no transcript chunk remains searchable
    points, _ = qdrant_memory.scroll(f"course_{course.id}_v2", with_payload=True, limit=100)
    assert not [p for p in points if p.payload["source_type"] == "transcript"]
    async with api_client(student) as client:
        vtt = await client.get(f"/api/lectures/{doc.id}/captions.vtt")
        assert "Part" not in vtt.text
        # Notes inside the masked range are hidden at once, before the chapters are rewritten
        assert all(not ch["notes"] for ch in (await client.get(f"/api/lectures/{doc.id}")).json()["chapters"])

    # The rebuild writes chapters from the unmasked transcript only: here nothing is left to summarise
    from app.tasks.media import run_rebuild_lecture
    await run_rebuild_lecture(str(doc.id))
    assert await LectureChapter.find(LectureChapter.doc_id == doc.id).count() == 0
    points, _ = qdrant_memory.scroll(f"course_{course.id}_v2", with_payload=True, limit=100)
    assert not [p for p in points if p.payload["source_type"] == "chapter_summary"]


async def _noop():
    return None


async def test_pipeline_failure_marks_document_failed(lecture_course, qdrant_memory, monkeypatch, tmp_path):
    from app.services.media import transcribe as transcribe_mod
    from app.services.media.transcribe import TranscriptResult
    from app.tasks.media import run_process_lecture

    _, _, course = await lecture_course()
    audio = tmp_path / "silence.mp4"
    _synthetic_video(audio, colours=((0, 0, 0),))
    doc = DocumentModel(course_id=course.id, filename="silent.mp4", s3_path="k", media_type="lecture", file_type="mp4")
    await doc.insert()
    s3 = MagicMock()
    s3.download_file.side_effect = lambda bucket, key, dest: open(dest, "wb").write(audio.read_bytes())
    monkeypatch.setattr("app.services.media.lecture_pipeline.get_s3_client", lambda: s3)
    monkeypatch.setattr("app.core.db.connect_to_mongo", _noop)
    monkeypatch.setattr(transcribe_mod, "transcribe", lambda *a, **k: TranscriptResult(segments=[], duration_sec=2))

    assert await run_process_lecture(str(doc.id)) is False
    doc = await DocumentModel.get(doc.id)
    assert doc.status == "failed" and "No speech" in doc.error_message


async def test_media_upload_is_routed_to_lecture_queue(lecture_course, api_client, monkeypatch):
    from app.core.celery_app import celery_app
    from app.tasks import media

    professor, _, course = await lecture_course()
    monkeypatch.setattr("app.services.document_service.get_s3_client", lambda: MagicMock())
    queued = []
    monkeypatch.setattr(media.process_lecture, "delay", lambda doc_id: queued.append(doc_id))
    files = {"files": ("week2.mp4", io.BytesIO(b"\x00\x00\x00\x18ftypmp42"), "video/mp4")}
    async with api_client(professor) as client:
        res = await client.post("/api/professor/documents/upload", data={"course_id": str(course.id)}, files=files)
    assert res.status_code == 202, res.text
    doc = await DocumentModel.find_one(DocumentModel.course_id == course.id)
    assert doc.media_type == "lecture" and doc.file_type == "mp4" and doc.s3_path.startswith(f"courses/{course.id}/lectures/")
    assert queued == [str(doc.id)]
    assert celery_app.conf.task_routes["process_lecture"]["queue"] == "media"


def test_course_vocabulary_prompt_prefers_recurring_terms():
    from app.services.media.transcribe import course_vocabulary_prompt
    prompt = course_vocabulary_prompt(["Dijkstra uses a priority queue. Dijkstra relaxes edges.", "Bellman-Ford handles Bellman-Ford cases"])
    assert prompt.startswith("Lecture vocabulary:") and "Dijkstra" in prompt and "Bellman-Ford" in prompt


def test_decode_audio_reads_real_media_with_installed_pyav(tmp_path):
    # Real decode (not mocked): faster-whisper's own decoder breaks on PyAV 14+, so ours must work with the pinned av
    import math
    import struct
    import wave
    from app.services.media.transcribe import SAMPLE_RATE, decode_audio
    path = tmp_path / "tone.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"".join(struct.pack("<hh", v, v) for v in (int(8000 * math.sin(i / 10)) for i in range(44100))))
    audio = decode_audio(str(path))
    assert audio.dtype.name == "float32" and abs(len(audio) - SAMPLE_RATE) < 400
    assert 0.1 < float(abs(audio).max()) <= 1.0
