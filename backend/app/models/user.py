from beanie import Document
from fastapi_users.db import BeanieBaseUser, BeanieUserDatabase
from typing import Optional, Dict
from datetime import datetime, timezone
import uuid
from pydantic import Field, BaseModel

def _utcnow():
    return datetime.now(timezone.utc)

class UserPreferences(BaseModel):
    language: str = "en"
    theme: str = "light"
    notifications_enabled: bool = True
    default_study_mode: str = "teach"

class User(BeanieBaseUser, Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    role: str = "student"
    name: str
    institution: Optional[str] = None
    department: Optional[str] = None
    has_onboarded: bool = False
    preferences: UserPreferences = UserPreferences()
    created_at: datetime = Field(default_factory=_utcnow)
    last_login: Optional[datetime] = None
    refresh_token_hash: Optional[str] = None

async def get_user_db():
    yield BeanieUserDatabase(User)
