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

class UserCreate(schemas.BaseUserCreate):
    name: str
    role: str = "student"
    institution: Optional[str] = None
    department: Optional[str] = None

class UserUpdate(schemas.BaseUserUpdate):
    name: Optional[str] = None
    role: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    has_onboarded: Optional[bool] = None
