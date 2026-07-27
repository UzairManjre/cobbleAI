from pydantic import BaseModel
from typing import Dict, Any, Optional

class TrackEventRequest(BaseModel):
    event_type: str
    event_category: str
    course_id: Optional[str] = None
    session_id: Optional[str] = None
    payload: Dict[str, Any] = {}
