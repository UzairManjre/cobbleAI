from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

class TrackEventRequest(BaseModel):
    event_type: str
    event_category: Optional[str] = None
    course_id: Optional[str] = None
    graph_id: Optional[str] = None
    session_id: Optional[str] = None
    node_id: Optional[str] = None
    document_id: Optional[str] = None
    payload: Dict[str, Any] = {}

class TrackBatchRequest(BaseModel):
    events: List[TrackEventRequest] = Field(default_factory=list, max_length=200)
