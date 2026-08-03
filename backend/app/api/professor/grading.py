import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from app.models.user import User
from app.api.auth import require_role
from app.models.grading import Rubric, RubricCriterion, GradingDraft, RegradeRequest, EditHistoryRecord, CriterionDraft
from app.models.test import Test, TestAttempt
from app.services.grading import grading_service

router = APIRouter(prefix="/grading", tags=["grading (professor)"])

async def _verify_assignment_ownership(assignment_id: uuid.UUID, user: User) -> Test:
    test = await Test.get(assignment_id)
    if not test:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if str(test.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your assignment")
    if test.test_type != "assignment":
        raise HTTPException(status_code=400, detail="Test is not an assignment")
    return test

async def _verify_submission_ownership(submission_id: uuid.UUID, user: User) -> TestAttempt:
    attempt = await TestAttempt.get(submission_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Submission not found")
    await _verify_assignment_ownership(attempt.test_id, user)
    return attempt

async def _verify_draft_ownership(draft_id: uuid.UUID, user: User) -> GradingDraft:
    draft = await GradingDraft.get(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    await _verify_submission_ownership(draft.submission_id, user)
    return draft

class RubricCreateRequest(BaseModel):
    criteria: List[RubricCriterion]

@router.post("/assignments/{id}/rubric", status_code=status.HTTP_201_CREATED)
async def create_rubric(id: uuid.UUID, req: RubricCreateRequest, user: User = Depends(require_role("professor"))):
    await _verify_assignment_ownership(id, user)
    
    # Check if a rubric already exists for this assignment
    existing_rubric = await Rubric.find_one({"assignment_id": id})
    if existing_rubric:
        # Update existing
        existing_rubric.criteria = req.criteria
        existing_rubric.created_at = datetime.now(timezone.utc)
        await existing_rubric.save()
        return existing_rubric
        
    rubric = Rubric(assignment_id=id, criteria=req.criteria)
    await rubric.save()
    return rubric

class DraftCreateRequest(BaseModel):
    submission_text: str

@router.post("/submissions/{id}/draft")
async def trigger_grading_draft(id: uuid.UUID, req: DraftCreateRequest, user: User = Depends(require_role("professor"))):
    attempt = await _verify_submission_ownership(id, user)
    
    rubric = await Rubric.find_one({"assignment_id": attempt.test_id})
    if not rubric:
        raise HTTPException(status_code=400, detail="No rubric defined for this assignment")
        
    draft = await grading_service.generate_draft(id, rubric, req.submission_text)
    return draft

class CriterionOverride(BaseModel):
    criterion_id: uuid.UUID
    override_score: Optional[float] = None
    override_feedback: Optional[str] = None

class DraftPatchRequest(BaseModel):
    overrides: List[CriterionOverride]

@router.patch("/drafts/{id}")
async def override_draft(id: uuid.UUID, req: DraftPatchRequest, user: User = Depends(require_role("professor"))):
    draft = await _verify_draft_ownership(id, user)
    
    for override in req.overrides:
        for c_eval in draft.criteria_evaluations:
            if str(c_eval.criterion_id) == str(override.criterion_id):
                old_score = c_eval.override_score or c_eval.suggested_score
                new_score = override.override_score if override.override_score is not None else old_score
                
                old_feedback = c_eval.override_feedback or c_eval.suggested_feedback
                new_feedback = override.override_feedback if override.override_feedback is not None else old_feedback
                
                if new_score != old_score:
                    draft.edit_history.append(EditHistoryRecord(
                        editor_id=user.id,
                        field=f"score_{c_eval.criterion_id}",
                        old_value=old_score,
                        new_value=new_score
                    ))
                    c_eval.override_score = new_score
                    
                if new_feedback != old_feedback:
                    draft.edit_history.append(EditHistoryRecord(
                        editor_id=user.id,
                        field=f"feedback_{c_eval.criterion_id}",
                        old_value=old_feedback,
                        new_value=new_feedback
                    ))
                    c_eval.override_feedback = new_feedback

    # Recalculate total score
    total = 0.0
    for c_eval in draft.criteria_evaluations:
        total += c_eval.override_score if c_eval.override_score is not None else c_eval.suggested_score
    draft.total_score = total
    draft.updated_at = datetime.now(timezone.utc)
    
    await draft.save()
    return draft

@router.post("/drafts/{id}/approve")
async def approve_draft(id: uuid.UUID, user: User = Depends(require_role("professor"))):
    draft = await _verify_draft_ownership(id, user)
    
    if draft.status == "anomaly_flagged":
        has_null_override = any(c.override_score is None for c in draft.criteria_evaluations)
        if has_null_override:
            raise HTTPException(status_code=400, detail="Cannot approve an anomaly_flagged draft without providing override scores for all criteria")
            
    draft.status = 'approved'
    draft.approved_by_professor_id = user.id
    draft.updated_at = datetime.now(timezone.utc)
    await draft.save()
    return draft

@router.post("/assignments/{id}/publish")
async def publish_assignment_drafts(id: uuid.UUID, user: User = Depends(require_role("professor"))):
    test = await _verify_assignment_ownership(id, user)
    
    # Find all approved drafts for submissions of this assignment
    # We would need to join TestAttempt to find which drafts belong to this assignment, 
    # but since a Rubric is 1:1 with an assignment, we can query by rubric_id.
    rubric = await Rubric.find_one({"assignment_id": id})
    if not rubric:
        raise HTTPException(status_code=400, detail="No rubric defined")
        
    drafts = await GradingDraft.find({"rubric_id": rubric.id, "status": "approved"}).to_list()
    
    published_count = 0
    for draft in drafts:
        draft.status = "published"
        draft.updated_at = datetime.now(timezone.utc)
        await draft.save()
        
        # Trigger Phase 4 mastery state update here
        # E.g., mastery_service.update_mastery(draft.submission_id, draft.total_score)
        published_count += 1
        
    return {"status": "success", "published_count": published_count}

class RegradeResolutionInput(BaseModel):
    approved: bool
    professor_comment: Optional[str] = None
    new_score: Optional[float] = None
    new_feedback: Optional[str] = None

@router.post("/regrade-requests/{id}/resolve")
async def resolve_regrade_request(id: uuid.UUID, req: RegradeResolutionInput, user: User = Depends(require_role("professor"))):
    rr = await RegradeRequest.get(id)
    if not rr:
        raise HTTPException(status_code=404, detail="Regrade request not found")
        
    draft = await _verify_draft_ownership(rr.grading_draft_id, user)
    
    rr.status = "resolved" if req.approved else "rejected"
    rr.professor_comment = req.professor_comment
    rr.resolved_at = datetime.now(timezone.utc)
    rr.resolved_by_id = user.id
    
    if req.approved and (req.new_score is not None or req.new_feedback is not None):
        # Update the draft with the new score/feedback
        for c_eval in draft.criteria_evaluations:
            if str(c_eval.criterion_id) == str(rr.criterion_id):
                old_score = c_eval.override_score or c_eval.suggested_score
                new_score = req.new_score if req.new_score is not None else old_score
                
                old_feedback = c_eval.override_feedback or c_eval.suggested_feedback
                new_feedback = req.new_feedback if req.new_feedback is not None else old_feedback
                
                if new_score != old_score:
                    draft.edit_history.append(EditHistoryRecord(
                        editor_id=user.id,
                        field=f"score_{c_eval.criterion_id}",
                        old_value=old_score,
                        new_value=new_score
                    ))
                    c_eval.override_score = new_score
                    
                if new_feedback != old_feedback:
                    draft.edit_history.append(EditHistoryRecord(
                        editor_id=user.id,
                        field=f"feedback_{c_eval.criterion_id}",
                        old_value=old_feedback,
                        new_value=new_feedback
                    ))
                    c_eval.override_feedback = new_feedback

        total = 0.0
        for c_eval in draft.criteria_evaluations:
            total += c_eval.override_score if c_eval.override_score is not None else c_eval.suggested_score
        draft.total_score = total
        draft.updated_at = datetime.now(timezone.utc)
        await draft.save()

    await rr.save()
    return rr

@router.get("/assignments/{id}/regrade-requests")
async def get_assignment_regrade_requests(id: uuid.UUID, user: User = Depends(require_role("professor"))):
    await _verify_assignment_ownership(id, user)
    
    rubric = await Rubric.find_one({"assignment_id": id})
    if not rubric:
        return []
        
    drafts = await GradingDraft.find({"rubric_id": rubric.id}).to_list()
    draft_ids = [d.id for d in drafts]
    
    # In Beanie, we can use the `$in` operator
    rrs = await RegradeRequest.find({"grading_draft_id": {"$in": draft_ids}}).to_list()
    return rrs
