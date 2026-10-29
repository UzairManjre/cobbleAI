from beanie import Document
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

def _utcnow():
    return datetime.now(timezone.utc)


class TimeRange(BaseModel):
    start: float
    end: float
    reason: Optional[str] = None  # e.g. "classroom Q&A"


class DocumentModel(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    filename: str
    s3_path: str
    status: str = "pending"  # pending, processing, ready, failed
    error_message: Optional[str] = None
    chunk_count: int = 0

    # Analytics fields (previously missing)
    file_type: str = "pdf"  # pdf, docx, pptx, mp4, webm, mov, mp3, m4a, wav
    file_size_bytes: int = 0
    processed_at: Optional[datetime] = None

    # Lecture recordings (CobbleAI 2.0); documents keep the defaults
    media_type: str = "document"  # document | lecture
    content_type: Optional[str] = None
    duration_sec: Optional[float] = None
    has_video: Optional[bool] = None
    stage: Optional[str] = None  # current pipeline stage, shown while processing
    progress: Optional[float] = None  # 0..1
    excluded_ranges: List[TimeRange] = []  # masked from captions and retrieval (e.g. student Q&A)

    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "documents"
