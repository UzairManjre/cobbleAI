from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

def _utcnow():
    return datetime.now(timezone.utc)

class ChatTurn(BaseModel):
    turn_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    role: str
    content: str
    token_count: int
    rag_chunk_ids: List[str] = Field(default_factory=list)
    reranker_scores: List[float] = Field(default_factory=list)
    latency_ms: Optional[int] = None
    timestamp: datetime = Field(default_factory=_utcnow)

class ChatSession(BaseModel):
    id: uuid.UUID = Field(alias="_id")
    student_id: uuid.UUID
    course_id: uuid.UUID
    mode: str
    turns: List[ChatTurn] = Field(default_factory=list)
    turn_count: int = 0
    token_count: int = 0
    topic_focus: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime
    last_active: datetime

class ColdChatArchive(BaseModel):
    id: uuid.UUID = Field(alias="_id")
    session_id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    pruned_turns: List[ChatTurn]
    pruned_at: datetime
    reason: str
