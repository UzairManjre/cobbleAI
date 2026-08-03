from typing import Generic, TypeVar, Optional, List
from beanie import Document
import uuid

T = TypeVar("T", bound=Document)

class BaseRepository(Generic[T]):
    def __init__(self, model: type[T]):
        self.model = model

    async def get_by_id(self, document_id: uuid.UUID | str) -> Optional[T]:
        if isinstance(document_id, str):
            try:
                document_id = uuid.UUID(document_id)
            except ValueError:
                return None
        return await self.model.get(document_id)

    async def insert(self, entity: T) -> T:
        await entity.insert()
        return entity
        
    async def save(self, entity: T) -> T:
        await entity.save()
        return entity
        
    async def delete(self, entity: T) -> None:
        await entity.delete()
