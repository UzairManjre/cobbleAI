from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Form
from app.models.document import DocumentModel
from app.api.auth import current_active_user, require_role
from app.models.user import User
from app.core.storage import get_s3_client, S3_BUCKET
from app.services.document_service import DocumentService
from app.utils.telemetry import safe_track_event
import uuid
from typing import List

router = APIRouter(prefix="/documents", tags=["documents (professor)"])

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    course_id: str = Form(...),
    files: List[UploadFile] = File(...),
    user: User = Depends(require_role("professor"))
):
    return await DocumentService.upload_documents(course_id, files, user)

@router.get("/list/{course_id}")
async def list_documents(course_id: str, user: User = Depends(require_role("professor"))):
    return await DocumentService.list_documents(course_id, user)

@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user: User = Depends(require_role("professor"))):
    return await DocumentService.delete_document(doc_id, user)

@router.post("/cleanup-duplicates")
async def cleanup_duplicates(
    course_id: str = Form(...),
    user: User = Depends(require_role("professor"))
):
    """Removes duplicate documents for a course."""
    return await DocumentService.cleanup_duplicates(course_id, user)
