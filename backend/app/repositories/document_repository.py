from typing import Optional, List
import uuid
from datetime import datetime, timezone
from app.models.document import DocumentModel
from app.repositories.base import BaseRepository

class DocumentRepository(BaseRepository[DocumentModel]):
    def __init__(self):
        super().__init__(model=DocumentModel)
        
    async def update_status(self, doc_id: uuid.UUID, status: str, error: str = None, chunks: int = None) -> None:
        update_data = {"status": status}
        if status in ("ready", "failed"):
            update_data["processed_at"] = datetime.now(timezone.utc)
        if error is not None:
            update_data["error_message"] = error
        if chunks is not None:
            update_data["chunk_count"] = chunks
            
        await self.model.find_one({"_id": doc_id}).update({"$set": update_data})

    async def find_by_course(self, course_id: uuid.UUID) -> List[DocumentModel]:
        return await self.model.find(self.model.course_id == course_id).to_list()
        
    async def find_ready_by_course(self, course_id: uuid.UUID) -> List[DocumentModel]:
        return await self.model.find(
            self.model.course_id == course_id,
            self.model.status == "ready"
        ).to_list()
