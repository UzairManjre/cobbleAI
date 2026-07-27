from pydantic import BaseModel
from typing import Optional

class GenerateGraphRequest(BaseModel):
    course_id: str
    source_materials: Optional[str] = None

class GenerateFromDocsRequest(BaseModel):
    course_id: str

class NavigateRequest(BaseModel):
    node_id: str

class AskRequest(BaseModel):
    query: str
    context_node_id: Optional[str] = None
