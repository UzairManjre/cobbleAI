from pydantic import BaseModel
from typing import Optional

class NavigateRequest(BaseModel):
    node_id: str

class AskRequest(BaseModel):
    query: str
    context_node_id: Optional[str] = None

class GetOrCreateSessionRequest(BaseModel):
    course_id: str
