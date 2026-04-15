from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

class DocumentBase(BaseModel):
    original_filename: str

class DocumentCreate(DocumentBase):
    pass

class Document(DocumentBase):
    id: uuid.UUID = Field(alias="_id")
    course_id: uuid.UUID
    uploaded_by: uuid.UUID
    file_type: str
    file_size_bytes: int
    s3_key: str
    processing_status: str
    chunk_count: Optional[int] = None
    page_count: Optional[int] = None
    has_images: bool = False
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    concept_graph: dict = Field(default_factory=dict)
    created_at: datetime
    processed_at: Optional[datetime] = None
