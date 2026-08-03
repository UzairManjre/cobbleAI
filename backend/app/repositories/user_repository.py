from typing import List
import uuid
from beanie.operators import In
from app.models.user import User
from app.repositories.base import BaseRepository

class UserRepository(BaseRepository[User]):
    def __init__(self):
        super().__init__(model=User)
        
    async def find_by_ids(self, user_ids: List[uuid.UUID]) -> List[User]:
        if not user_ids:
            return []
        return await self.model.find(In(self.model.id, user_ids)).to_list()
