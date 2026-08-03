from fastapi import APIRouter, Depends
from typing import List
from app.api.auth import require_role
from app.models.user import User
from app.services.document_service import DocumentService
from app.schemas.document import DocumentResponse

router = APIRouter(prefix="/documents", tags=["documents (student)"])

@router.get("/list/{course_id}", response_model=List[DocumentResponse])
async def list_student_documents(course_id: str, user: User = Depends(require_role("student"))):
    return await DocumentService.list_student_documents(course_id, user)
