from beanie import Document
from typing import List, Optional, Dict
from datetime import datetime, timezone
from pydantic import Field, BaseModel, ConfigDict
import uuid
from enum import Enum

def _utcnow():
    return datetime.now(timezone.utc)

class MasteryState(str, Enum):
    locked = "locked"
    unlocked = "unlocked"
    mastered = "mastered"

class RelationType(str, Enum):
    prerequisite_for = "prerequisite_for"
    builds_on = "builds_on"
    requires = "requires"
    contrasts_with = "contrasts_with"
    is_part_of = "is_part_of"
    enables = "enables"
    uses = "uses"
    produces = "produces"
    relates_to = "relates_to"

class GraphNode(BaseModel):
    id: str
    label: str = Field(default="", alias="name")
    description: str = ""
    category: Optional[str] = "concept"
    source_docs: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = "intermediate"
    mastery_state: MasteryState = MasteryState.locked
    
    model_config = ConfigDict(populate_by_name=True)

class GraphEdge(BaseModel):
    id: str
    source: str = Field(alias="from")
    target: str = Field(alias="to")
    relation: RelationType = Field(alias="type")
    strength: float = 1.0

    model_config = ConfigDict(populate_by_name=True)

class KnowledgeGraph(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    topic: str
    course_id: Optional[uuid.UUID] = None
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
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
