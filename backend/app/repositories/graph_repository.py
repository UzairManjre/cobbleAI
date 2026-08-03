from typing import Optional
import uuid
from app.models.graph import KnowledgeGraph
from app.repositories.base import BaseRepository

class KnowledgeGraphRepository(BaseRepository[KnowledgeGraph]):
    def __init__(self):
        super().__init__(model=KnowledgeGraph)
        
    async def find_by_course(self, course_id: uuid.UUID) -> Optional[KnowledgeGraph]:
        return await self.model.find_one(self.model.course_id == course_id)
