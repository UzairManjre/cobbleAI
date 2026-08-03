from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

class DocumentBase(BaseModel):
    original_filename: str

class DocumentCreate(DocumentBase):
    pass

class DocumentResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    filename: str
    s3_path: str
    status: str
    error_message: Optional[str] = None
    chunk_count: int = 0
    file_type: str = "pdf"
    file_size_bytes: int = 0
    processed_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
