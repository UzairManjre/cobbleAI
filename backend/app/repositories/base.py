from typing import Generic, TypeVar, List, Optional
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorCollection
from app.core.db import get_database

T = TypeVar("T", bound=BaseModel)

class BaseRepository(Generic[T]):
    def __init__(self, collection_name: str, model: type[T]):
        self.collection_name = collection_name
        self.model = model

    @property
    def collection(self) -> AsyncIOMotorCollection:
        db = get_database()
        return db[self.collection_name]

    async def get_by_id(self, id: str) -> Optional[T]:
        doc = await self.collection.find_one({"_id": id})
        if doc:
            return self.model(**doc)
        return None

    async def insert(self, entity: T) -> T:
        doc = entity.dict(by_alias=True)
        await self.collection.insert_one(doc)
        return entity
