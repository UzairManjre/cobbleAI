from beanie import Document
from typing import Optional
from datetime import datetime, timezone
from pydantic import Field
import uuid

def _utcnow():
    return datetime.now(timezone.utc)

class DocumentModel(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    filename: str
    s3_path: str
    status: str = "pending"  # pending, processing, ready, failed
    error_message: Optional[str] = None
    chunk_count: int = 0

    # Analytics fields (previously missing)
    file_type: str = "pdf"  # pdf, docx, pptx
    file_size_bytes: int = 0
    processed_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "documents"
