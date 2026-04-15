from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

class CourseCreate(BaseModel):
    title: str
    code: str

class CourseRead(BaseModel):
    id: uuid.UUID
    professor_id: uuid.UUID
    title: str
    code: str
    created_at: datetime
    docs_count: int = 0
    status: str = "ready"

class InviteCreate(BaseModel):
    expires_in_hours: int = 48

class InviteRead(BaseModel):
    code: str
    expires_at: datetime

class JoinCourseRequest(BaseModel):
    code: str
