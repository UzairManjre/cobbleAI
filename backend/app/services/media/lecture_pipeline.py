"""Lecture recording -> transcript, keyframes, chapters -> timestamped retrieval index.

Stages (reported on DocumentModel.stage/progress while running):
  downloading -> transcribing -> frames -> chapters -> indexing -> ready
Everything runs on local hardware; recordings never leave institutional storage.
"""

import asyncio
import os
import tempfile
import time
import uuid
from typing import List, Optional

from app.core.config import settings
from app.core.storage import S3_BUCKET, get_s3_client
from app.models.document import DocumentModel
from app.models.lecture import LectureChapter, LectureFrame, LectureTranscript, TranscriptSegment
from app.services.chunking import SectionSummary, chunk_segments, index_chunks
from app.services.ingestion.segments import Segment
from app.services.media.captions import is_excluded

TRANSCRIPT_WINDOW_S = 45.0  # transcript chunks are ~45 s of speech, short enough to cite a moment


async def _set_stage(doc_id: uuid.UUID, stage: str, progress: float, **extra) -> None:
    await DocumentModel.find_one({"_id": doc_id}).update({"$set": {"stage": stage, "progress": progress, **extra}})


def chapter_for(t: float, chapters: List[LectureChapter]) -> Optional[LectureChapter]:
    for c in chapters:
        if c.start <= t < c.end:
            return c
    return chapters[-1] if chapters else None


def build_lecture_segments(transcript: LectureTranscript, frames: List[LectureFrame],
                           chapters: List[LectureChapter], excluded) -> List[Segment]:
    """Transcript windows and frame text as located segments, each tagged with its chapter."""
    segments: List[Segment] = []

    def tag(t):
        c = chapter_for(t, chapters)
        return ({"chapter_id": c.chapter_id, "chapter_title": c.title}, c.title) if c else ({}, None)

    window: List[TranscriptSegment] = []

    def flush():
        if not window:
            return
        extra, title = tag(window[0].start)
        segments.append(Segment(
            text=" ".join(s.text for s in window), source_type="transcript",
            t_start=window[0].start, t_end=window[-1].end, section_title=title, extra=extra,
        ))

    carried = False  # window holds only the overlap segment already emitted in the previous chunk
    for seg in transcript.segments:
        if is_excluded(seg.start, seg.end, excluded):
            if not carried:
                flush()
            window, carried = [], False
            continue
        window.append(seg)
        carried = False
        if window[-1].end - window[0].start >= TRANSCRIPT_WINDOW_S:
            flush()
            window, carried = [window[-1]], True  # one segment of overlap keeps sentences that straddle a cut
    if window and not carried:
        flush()

    for i, frame in enumerate(frames):
        text = "\n".join(t for t in (frame.ocr_text.strip(), frame.caption.strip()) if t)
        if not text:
            continue
        end = frames[i + 1].t if i + 1 < len(frames) else frame.t + 30
        if is_excluded(frame.t, end, excluded):
            continue
        extra, title = tag(frame.t)
        segments.append(Segment(text=f"[Slide shown] {text}", source_type="frame_ocr",
                                t_start=frame.t, t_end=end, section_title=title, extra=extra))
    return segments


def chapter_summaries(chapters: List[LectureChapter]) -> List[SectionSummary]:
    return [
        SectionSummary(chapter_id=c.chapter_id, title=c.title, text=f"{c.title}. {c.summary}".strip(),
                       t_start=c.start, t_end=c.end)
        for c in chapters
    ]


async def index_lecture(doc: DocumentModel) -> int:
    """(Re)build the lecture's retrieval index from its stored transcript, frames and chapters."""
    transcript = await LectureTranscript.find_one(LectureTranscript.doc_id == doc.id)
    if not transcript:
        return 0
    frames = await LectureFrame.find(LectureFrame.doc_id == doc.id).sort(LectureFrame.t).to_list()
    chapters = await LectureChapter.find(LectureChapter.doc_id == doc.id).sort(LectureChapter.index).to_list()
    segments = build_lecture_segments(transcript, frames, chapters, doc.excluded_ranges)
    chunks, _ = chunk_segments(segments, str(doc.id))
    return await asyncio.to_thread(
        index_chunks, chunks, str(doc.course_id), str(doc.id), doc.filename,
        summaries=chapter_summaries(chapters), media_type="lecture",
    )


async def write_chapters(doc: DocumentModel, transcript: LectureTranscript, duration: float,
                         slide_times: List[float]) -> List[dict]:
    """(Re)generate chapters, summaries and notes from the transcript outside the excluded ranges,
    so masked classroom Q&A never reaches a summary either."""
    from app.services.media.chapters import generate_chapters
    kept = [s.model_dump() for s in transcript.segments if not is_excluded(s.start, s.end, doc.excluded_ranges)]
    raw_chapters = await generate_chapters(kept, duration, slide_times)
    await LectureChapter.find(LectureChapter.doc_id == doc.id).delete()
    for c in raw_chapters:
        await LectureChapter(doc_id=doc.id, course_id=doc.course_id, **c).insert()
    return raw_chapters


async def rebuild_after_exclusions(doc: DocumentModel) -> int:
    """After the instructor changes the excluded ranges: new chapters from what is left, then re-index."""
    transcript = await LectureTranscript.find_one(LectureTranscript.doc_id == doc.id)
    if not transcript:
        return 0
    frames = await LectureFrame.find(LectureFrame.doc_id == doc.id).sort(LectureFrame.t).to_list()
    duration = doc.duration_sec or transcript.duration_sec or (transcript.segments[-1].end if transcript.segments else 0)
    await write_chapters(doc, transcript, duration, [f.t for f in frames])
    return await index_lecture(doc)


async def _course_vocabulary(course_id: uuid.UUID) -> str:
    """Terms from the course's slides/notes, used to bias speech recognition."""
    from app.core import qdrant as qdrant_core
    from app.services.media.transcribe import course_vocabulary_prompt
    texts = []
    try:
        name = qdrant_core.collection_name(str(course_id))
        if qdrant_core.qdrant_sync.collection_exists(name):
            points, _ = qdrant_core.qdrant_sync.scroll(name, limit=300, with_payload=True)
            texts = [(p.payload or {}).get("text", "") for p in points if (p.payload or {}).get("media_type") != "lecture"]
    except Exception as e:
        print(f"  Could not read course vocabulary: {e}")
    return course_vocabulary_prompt(texts)


async def process_lecture_document(doc: DocumentModel) -> int:
    from app.services.media import frames as frame_svc, vision
    from app.services.media.transcribe import transcribe

    started = time.perf_counter()
    s3 = get_s3_client()
    suffix = os.path.splitext(doc.filename)[1] or f".{doc.file_type}"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.close()
    try:
        await _set_stage(doc.id, "downloading", 0.02)
        await asyncio.to_thread(s3.download_file, S3_BUCKET, doc.s3_path, tmp.name)

        info = await asyncio.to_thread(frame_svc.probe, tmp.name)
        await _set_stage(doc.id, "transcribing", 0.05, duration_sec=info["duration_sec"], has_video=info["has_video"])

        prompt = await _course_vocabulary(doc.course_id)
        result = await asyncio.to_thread(transcribe, tmp.name, prompt)
        if not result.segments:
            raise ValueError("No speech was recognised in the recording.")
        await LectureTranscript.find(LectureTranscript.doc_id == doc.id).delete()
        transcript = LectureTranscript(
            doc_id=doc.id, course_id=doc.course_id, language=result.language, model=result.model,
            duration_sec=result.duration_sec, real_time_factor=result.real_time_factor, initial_prompt=prompt,
            segments=[TranscriptSegment(**s, low_confidence=(s["avg_logprob"] is not None and s["avg_logprob"] < settings.LOW_CONFIDENCE_LOGPROB))
                      for s in result.segments],
        )
        await transcript.insert()
        duration = result.duration_sec or info["duration_sec"] or transcript.segments[-1].end

        frames: List[LectureFrame] = []
        await LectureFrame.find(LectureFrame.doc_id == doc.id).delete()
        if info["has_video"]:
            await _set_stage(doc.id, "frames", 0.55, duration_sec=duration)
            keyframes = await asyncio.to_thread(frame_svc.extract_keyframes, tmp.name)
            for i, kf in enumerate(keyframes):
                key = f"courses/{doc.course_id}/lectures/{doc.id}/frames/{i:04d}.jpg"
                await asyncio.to_thread(s3.put_object, Bucket=S3_BUCKET, Key=key, Body=kf.jpeg, ContentType="image/jpeg")
                ocr_text = await asyncio.to_thread(vision.ocr_image, kf.jpeg)
                caption = await vision.caption_image(kf.jpeg, ocr_text)
                frame = LectureFrame(doc_id=doc.id, course_id=doc.course_id, t=kf.t, s3_key=key, ocr_text=ocr_text, caption=caption)
                await frame.insert()
                frames.append(frame)
                if i % 10 == 0:
                    await _set_stage(doc.id, "frames", 0.55 + 0.2 * (i + 1) / max(len(keyframes), 1))

        await _set_stage(doc.id, "chapters", 0.8, duration_sec=duration)
        raw_chapters = await write_chapters(doc, transcript, duration, [f.t for f in frames])

        await _set_stage(doc.id, "indexing", 0.9)
        doc = await DocumentModel.get(doc.id)
        count = await index_lecture(doc)
        print(f"  Lecture {doc.filename}: {len(transcript.segments)} transcript segments, {len(frames)} frames, "
              f"{len(raw_chapters)} chapters, {count} chunks in {time.perf_counter() - started:.0f}s "
              f"(transcription RTF {result.real_time_factor})")
        return count
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
