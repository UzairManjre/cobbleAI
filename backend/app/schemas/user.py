import uuid
from fastapi_users import schemas
from pydantic import Field
from typing import Optional

class UserRead(schemas.BaseUser[uuid.UUID]):
    name: str
    role: str
    institution: Optional[str] = None
    department: Optional[str] = None
    has_onboarded: bool = False
    research_consent: Optional[bool] = None

class UserCreate(schemas.BaseUserCreate):
    name: str
    role: str = "student"
    institution: Optional[str] = None
    department: Optional[str] = None

class UserUpdate(schemas.BaseUserUpdate):
    # No `role`: a user must not be able to change their own role through PATCH /users/me.
    # Research consent has its own endpoint (/api/consent) so it is timestamped and versioned.
    name: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    has_onboarded: Optional[bool] = None
