"""Lecture recordings and source files: playback URLs, transcript, chapters, captions, exclusions."""

import asyncio
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.api.auth import current_active_user, require_role
from app.core.storage import presigned_get_url
from app.models.document import DocumentModel, TimeRange
from app.models.lecture import LectureChapter, LectureFrame, LectureTranscript
from app.models.user import User
from app.services.access import ensure_course_access, ensure_course_owner
from app.services.media.captions import is_excluded, to_text, to_vtt

router = APIRouter(tags=["lectures"])

FILE_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


async def _load_doc(doc_id: uuid.UUID, user: User, lecture: bool = False) -> DocumentModel:
    doc = await DocumentModel.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await ensure_course_access(user, doc.course_id)
    if user.role == "student" and doc.status != "ready":
        raise HTTPException(status_code=404, detail="Not found")
    if lecture and doc.media_type != "lecture":
        raise HTTPException(status_code=400, detail="Not a lecture recording")
    return doc


@router.get("/files/{doc_id}/url")
async def get_file_url(doc_id: uuid.UUID, user: User = Depends(current_active_user)):
    """Short-lived URL to open a source file (PDFs open at a page with #page=N)."""
    doc = await _load_doc(doc_id, user)
    content_type = doc.content_type or FILE_CONTENT_TYPES.get(doc.file_type)
    return {
        "url": presigned_get_url(doc.s3_path, content_type=content_type, filename=doc.filename),
        "file_type": doc.file_type,
        "media_type": doc.media_type,
        "filename": doc.filename,
        "expires_in": 3600,
    }


@router.get("/lectures/course/{course_id}")
async def list_course_lectures(course_id: uuid.UUID, user: User = Depends(current_active_user)):
    await ensure_course_access(user, course_id)
    filters = [DocumentModel.course_id == course_id, DocumentModel.media_type == "lecture"]
    if user.role == "student":
        filters.append(DocumentModel.status == "ready")
    docs = await DocumentModel.find(*filters).sort(DocumentModel.created_at).to_list()
    return [{
        "id": str(d.id), "filename": d.filename, "status": d.status, "stage": d.stage, "progress": d.progress,
        "duration_sec": d.duration_sec, "has_video": d.has_video, "created_at": d.created_at.isoformat(),
    } for d in docs]


@router.get("/lectures/{doc_id}")
async def get_lecture(doc_id: uuid.UUID, user: User = Depends(current_active_user)):
    doc = await _load_doc(doc_id, user, lecture=True)
    transcript = await LectureTranscript.find_one(LectureTranscript.doc_id == doc.id)
    chapters = await LectureChapter.find(LectureChapter.doc_id == doc.id).sort(LectureChapter.index).to_list()
    frames = await LectureFrame.find(LectureFrame.doc_id == doc.id).sort(LectureFrame.t).to_list()
    excluded = doc.excluded_ranges

    segments = []
    if transcript:
        for s in transcript.segments:
            if is_excluded(s.start, s.end, excluded):
                continue
            segments.append({"id": s.id, "start": s.start, "end": s.end, "text": s.text, "low_confidence": s.low_confidence})

    return {
        "id": str(doc.id),
        "course_id": str(doc.course_id),
        "filename": doc.filename,
        "status": doc.status,
        "stage": doc.stage,
        "progress": doc.progress,
        "error_message": doc.error_message if user.role == "professor" else None,
        "duration_sec": doc.duration_sec or (transcript.duration_sec if transcript else None),
        "has_video": doc.has_video,
        "media_url": presigned_get_url(doc.s3_path, content_type=doc.content_type, filename=doc.filename)
        if doc.status == "ready" or user.role == "professor" else None,
        "transcript": {
            "language": transcript.language if transcript else None,
            "model": transcript.model if transcript else None,
            "real_time_factor": transcript.real_time_factor if transcript and user.role == "professor" else None,
            "segments": segments,
        },
        "chapters": [{
            "index": c.index, "chapter_id": c.chapter_id, "start": c.start, "end": c.end, "title": c.title,
            "summary": c.summary, "generated_by": c.generated_by,
            # Until the chapters are rebuilt, never show a note from a masked range
            "notes": [n.model_dump() for n in c.notes if not is_excluded(n.t, n.t, excluded)],
        } for c in chapters],
        "frames": [{
            "id": str(f.id), "t": f.t, "image_url": presigned_get_url(f.s3_key, content_type="image/jpeg"),
            "ocr_text": f.ocr_text[:400], "caption": f.caption,
        } for f in frames if not is_excluded(f.t, f.t + 1, excluded)],
        "excluded_ranges": [r.model_dump() for r in excluded] if user.role == "professor" else [],
        "excluded_count": len(excluded),
    }


@router.get("/lectures/{doc_id}/captions.vtt")
async def get_captions(doc_id: uuid.UUID, user: User = Depends(current_active_user)):
    doc = await _load_doc(doc_id, user, lecture=True)
    transcript = await LectureTranscript.find_one(LectureTranscript.doc_id == doc.id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not ready")
    return PlainTextResponse(to_vtt([s.model_dump() for s in transcript.segments], doc.excluded_ranges),
                             media_type="text/vtt; charset=utf-8")


@router.get("/lectures/{doc_id}/transcript.txt")
async def download_transcript(doc_id: uuid.UUID, user: User = Depends(current_active_user)):
    doc = await _load_doc(doc_id, user, lecture=True)
    transcript = await LectureTranscript.find_one(LectureTranscript.doc_id == doc.id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not ready")
    name = doc.filename.rsplit(".", 1)[0] + "-transcript.txt"
    return PlainTextResponse(
        to_text([s.model_dump() for s in transcript.segments], doc.excluded_ranges, title=doc.filename),
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


class ExclusionUpdate(BaseModel):
    ranges: List[TimeRange] = Field(default_factory=list)


@router.put("/lectures/{doc_id}/exclusions")
async def update_exclusions(doc_id: uuid.UUID, req: ExclusionUpdate, user: User = Depends(require_role("professor"))):
    """Mask ranges (e.g. classroom Q&A that captures students' voices) from captions,
    transcripts and retrieval, then re-index the lecture."""
    doc = await DocumentModel.get(doc_id)
    if not doc or doc.media_type != "lecture":
        raise HTTPException(status_code=404, detail="Lecture not found")
    await ensure_course_owner(user, doc.course_id)
    for r in req.ranges:
        if r.end <= r.start or r.start < 0:
            raise HTTPException(status_code=400, detail="Each range needs 0 <= start < end")
    doc.excluded_ranges = sorted(req.ranges, key=lambda r: r.start)
    await doc.save()
    chunks = None
    if doc.status == "ready":
        from app.services.media.lecture_pipeline import index_lecture
        chunks = await index_lecture(doc)  # masked text leaves retrieval right away
        doc.chunk_count = chunks
        await doc.save()
        # Chapter summaries were written from the whole recording: rewrite them without the masked parts
        from app.tasks.media import rebuild_lecture
        rebuild_lecture.delay(str(doc.id))
    return {"excluded_ranges": [r.model_dump() for r in doc.excluded_ranges], "chunk_count": chunks,
            "chapters_rebuilding": doc.status == "ready"}
