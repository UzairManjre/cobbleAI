"""Lecture recordings: transcript, chapters and slide-change frames (Upgrade E).

The recording itself is a DocumentModel with media_type="lecture"; these
documents hold what the local pipeline derives from it.
"""

from datetime import datetime, timezone
from typing import List, Optional
import uuid

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


def _utcnow():
    return datetime.now(timezone.utc)


class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    avg_logprob: Optional[float] = None
    no_speech_prob: Optional[float] = None
    low_confidence: bool = False  # shaded in the transcript so students know to double-check


class LectureTranscript(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    doc_id: uuid.UUID
    course_id: uuid.UUID
    language: Optional[str] = None
    model: Optional[str] = None  # e.g. faster-whisper medium (int8_float16, cuda)
    duration_sec: float = 0.0
    real_time_factor: Optional[float] = None  # processing seconds per second of audio
    initial_prompt: Optional[str] = None  # course vocabulary given to the recogniser
    segments: List[TranscriptSegment] = []
    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "lecture_transcripts"
        indexes = [IndexModel("doc_id", unique=True), IndexModel("course_id")]


class ChapterNote(BaseModel):
    t: float
    text: str


class LectureChapter(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    doc_id: uuid.UUID
    course_id: uuid.UUID
    index: int
    start: float
    end: float
    title: str
    summary: str = ""
    notes: List[ChapterNote] = []  # timestamped key points
    generated_by: str = "llm"  # llm | fallback

    @property
    def chapter_id(self) -> str:
        return f"{self.doc_id}:ch{self.index}"

    class Settings:
        name = "lecture_chapters"
        indexes = [IndexModel([("doc_id", 1), ("index", 1)], unique=True), IndexModel("course_id")]


class LectureFrame(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    doc_id: uuid.UUID
    course_id: uuid.UUID
    t: float  # seconds into the recording
    s3_key: str
    ocr_text: str = ""
    caption: str = ""

    class Settings:
        name = "lecture_frames"
        indexes = [IndexModel([("doc_id", 1), ("t", 1)]), IndexModel("course_id")]
