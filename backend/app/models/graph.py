from beanie import Document
from typing import List, Optional, Dict
from datetime import datetime, timezone
from pydantic import Field
import uuid

def _utcnow():
    return datetime.now(timezone.utc)

class KnowledgeGraph(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    topic: str
    course_id: Optional[uuid.UUID] = None
    nodes: List[Dict] = []
    edges: List[Dict] = []
    created_by: uuid.UUID
    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "knowledge_graphs"


class ChatMessage(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    session_id: uuid.UUID
    node_id: str
    role: str  # "user" or "assistant"
    content: str
    sources: Optional[List[Dict]] = []  # Document references
    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "chat_messages"


class StudySession(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    graph_id: uuid.UUID
    student_id: uuid.UUID
    current_node_id: Optional[str] = None
    visited_nodes: List[str] = []
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "study_sessions"
