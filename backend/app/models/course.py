from beanie import Document, Indexed
from typing import Optional
from datetime import datetime, timezone
from pydantic import Field
import uuid

def _utcnow():
    return datetime.now(timezone.utc)

class Course(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    professor_id: uuid.UUID
    title: str
    code: str
    docs_count: int = 0  # Maintained counter — updated on document lifecycle events
    created_at: datetime = Field(default_factory=_utcnow)

class Enrolment(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    student_id: uuid.UUID
    created_at: datetime = Field(default_factory=_utcnow)

class CourseInvite(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    code: str  # Short friendly code or uuid snippet
    expires_at: datetime
    created_at: datetime = Field(default_factory=_utcnow)
