import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from app.models.user import User
from app.api.auth import require_role
from app.models.grading import RegradeRequest, GradingDraft
from app.models.test import TestAttempt

router = APIRouter(prefix="/grading", tags=["grading (student)"])

class RegradeRequestInput(BaseModel):
    criterion_id: uuid.UUID
    student_comment: str

@router.post("/drafts/{id}/regrade-request")
async def create_regrade_request(id: uuid.UUID, req: RegradeRequestInput, user: User = Depends(require_role("student"))):
    draft = await GradingDraft.get(id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
        
    attempt = await TestAttempt.get(draft.submission_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    if str(attempt.student_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your submission")
        
    # Check if a regrade request already exists for this criterion
    existing_rr = await RegradeRequest.find_one({
        "grading_draft_id": draft.id,
        "criterion_id": req.criterion_id
    })
    
    if existing_rr:
        raise HTTPException(status_code=400, detail="Regrade request already exists for this criterion")
    
    rr = RegradeRequest(
        grading_draft_id=draft.id,
        criterion_id=req.criterion_id,
        student_comment=req.student_comment
    )
    await rr.save()
    return rr
