from typing import List
import uuid
from app.models.graph import StudySession, ChatMessage
from app.repositories.base import BaseRepository

class StudySessionRepository(BaseRepository[StudySession]):
    def __init__(self):
        super().__init__(model=StudySession)
        
    async def find_latest_by_student_and_graph(self, student_id: uuid.UUID, graph_id: uuid.UUID) -> StudySession:
        return await self.model.find(
            self.model.student_id == student_id,
            self.model.graph_id == graph_id
        ).sort(-self.model.updated_at).first_or_none()

class ChatMessageRepository(BaseRepository[ChatMessage]):
    def __init__(self):
        super().__init__(model=ChatMessage)
        
    async def find_by_session_and_node(self, session_id: uuid.UUID, node_id: str) -> List[ChatMessage]:
        return await self.model.find(
            self.model.session_id == session_id,
            self.model.node_id == node_id
        ).sort(self.model.created_at).to_list()
