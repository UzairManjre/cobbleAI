from beanie import Document
from typing import List, Optional, Dict
from datetime import datetime, timezone
from pydantic import Field, BaseModel, ConfigDict, field_validator
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

class Evidence(BaseModel):
    """Where a concept or relation is stated in the course materials (Upgrade D)."""
    doc_id: Optional[str] = None
    filename: Optional[str] = None
    chunk_id: Optional[str] = None
    page: Optional[int] = None
    slide: Optional[int] = None
    t_start: Optional[float] = None
    t_end: Optional[float] = None
    quote: str = ""
    support_score: float = 0.0  # 0-1: how well the quote matched the source text
    method: str = "quote"  # quote | mention | co_mention | lecture_moment


class EdgeAudit(BaseModel):
    status: str = "unreviewed"  # unreviewed | correct | incorrect
    note: Optional[str] = None
    reviewer_id: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None


class GraphNode(BaseModel):
    id: str
    label: str = Field(default="", alias="name")
    description: str = ""
    category: Optional[str] = "concept"
    source_docs: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = "intermediate"
    mastery_state: MasteryState = MasteryState.locked
    provenance: List[Evidence] = Field(default_factory=list)
    supported: Optional[bool] = None  # None: generated before provenance existed
    
    model_config = ConfigDict(populate_by_name=True)

class GraphEdge(BaseModel):
    id: str
    source: str = Field(alias="from")
    target: str = Field(alias="to")
    relation: RelationType = Field(alias="type")
    strength: float = 1.0
    provenance: List[Evidence] = Field(default_factory=list)
    supported: Optional[bool] = None
    audit: Optional[EdgeAudit] = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("relation", mode="before")
    @classmethod
    def _coerce_relation(cls, value):
        # LLMs invent relation names (leads_to, depends_on, ...); one unknown
        # relation must not fail validation of the whole graph.
        if isinstance(value, RelationType):
            return value
        normalized = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
        try:
            return RelationType(normalized)
        except ValueError:
            return RelationType.relates_to

def node_to_dict(node) -> Dict:
    """Plain dict for a node, using the field names the frontend reads (id, label, ...)."""
    if isinstance(node, dict):
        node = GraphNode.model_validate(node)
    return {
        "id": node.id,
        "label": node.label,
        "description": node.description,
        "category": node.category,
        "source_docs": list(node.source_docs),
        "difficulty": node.difficulty,
        "mastery_state": node.mastery_state.value,
        "provenance": [e.model_dump(exclude_none=True) for e in node.provenance],
        "supported": node.supported,
    }


def edge_to_dict(edge) -> Dict:
    """Plain dict for an edge in the API shape: id, from, to, relation, strength."""
    if isinstance(edge, dict):
        edge = GraphEdge.model_validate(edge)
    return {
        "id": edge.id,
        "from": edge.source,
        "to": edge.target,
        "relation": edge.relation.value,
        "strength": edge.strength,
        "provenance": [e.model_dump(exclude_none=True) for e in edge.provenance],
        "supported": edge.supported,
        "audit": edge.audit.model_dump(mode="json") if edge.audit else None,
    }


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

    def find_node(self, node_id: str) -> Optional[GraphNode]:
        return next((n for n in self.nodes if n.id == node_id), None)

    def neighbors(self, node_id: str) -> List[Dict]:
        """Connected concepts as {node_id, relation, label} dicts."""
        labels = {n.id: n.label for n in self.nodes}
        result = []
        for edge in self.edges:
            if edge.source == node_id:
                other = edge.target
            elif edge.target == node_id:
                other = edge.source
            else:
                continue
            result.append({
                "node_id": other,
                "relation": edge.relation.value,
                "label": labels.get(other, ""),
            })
        return result

    def nodes_as_dicts(self) -> List[Dict]:
        return [node_to_dict(n) for n in self.nodes]

    def edges_as_dicts(self) -> List[Dict]:
        return [edge_to_dict(e) for e in self.edges]


class ChatMessage(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    session_id: uuid.UUID
    node_id: str
    role: str  # "user" or "assistant"
    content: str
    sources: Optional[List[Dict]] = []  # Document references
    thinking: Optional[str] = None  # Model reasoning, kept out of content and history
    # CobbleAI 2.0 tutor metadata (absent on v1 messages)
    mode: Optional[str] = None  # teach | review | teach_back
    hint_level: Optional[str] = None
    decision: Optional[str] = None  # answered | declined | error
    support: Optional[str] = None  # strong | weak | none
    citations: Optional[List[Dict]] = None  # the sources the answer actually cited
    run_id: Optional[uuid.UUID] = None
    created_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "chat_messages"


class StudySession(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    graph_id: uuid.UUID
    student_id: uuid.UUID
    current_node_id: Optional[str] = None
    current_node_since: Optional[datetime] = None  # when the student opened current_node_id (dwell time)
    visited_nodes: List[str] = []
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    class Settings:
        name = "study_sessions"


class BuildEvent(BaseModel):
    at: datetime = Field(default_factory=_utcnow)
    message: str


class GraphBuild(Document):
    """One concept-map build for a course. It runs as a Celery task, so its progress lives here
    (not in a browser connection): any page can show it, and closing a tab no longer hides it."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    course_id: uuid.UUID
    requested_by: Optional[uuid.UUID] = None
    trigger: str = "manual"  # manual | auto (all materials finished processing)
    status: str = "queued"  # queued | running | complete | failed | cancelled
    step: int = 0  # generator step, 1..total_steps
    total_steps: int = 6
    message: str = "Waiting for a worker"
    detail: str = ""
    sources: int = 0
    passages: int = 0
    chunks_total: int = 0
    chunks_done: int = 0
    concepts_found: int = 0
    relations_found: int = 0
    events: List[BuildEvent] = []  # recent activity, newest last
    cancel_requested: bool = False
    graph_id: Optional[uuid.UUID] = None
    nodes_count: Optional[int] = None
    edges_count: Optional[int] = None
    unsupported_edges: Optional[int] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    started_at: Optional[datetime] = None
    extract_started_at: Optional[datetime] = None
    heartbeat_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Settings:
        name = "graph_builds"
