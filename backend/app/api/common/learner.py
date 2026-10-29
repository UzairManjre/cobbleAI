"""Learner model v2: concept struggle flags with reasons, difficulty labels, mastery,
the lecture confusion heatmap and confidence calibration."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.auth import current_active_user, require_role
from app.models.document import DocumentModel
from app.models.learner import ConceptDifficultyLabel
from app.models.user import User
from app.services.access import ensure_course_access, ensure_course_owner

router = APIRouter(prefix="/learner", tags=["learner model"])


@router.get("/courses/{course_id}/concepts")
async def concept_flags(course_id: uuid.UUID, user: User = Depends(require_role("professor"))):
    """Every concept with its signals, flag, probability and the signals that drove it."""
    from app.services.learner.confusion_model import score_course
    await ensure_course_owner(user, course_id)
    return await score_course(course_id)


class LabelRequest(BaseModel):
    struggling: bool
    difficulty: Optional[str] = None
    note: Optional[str] = None
    rater_slot: str = "primary"  # a second rater labels a subset as "secondary"


@router.put("/courses/{course_id}/labels/{node_id}")
async def set_label(course_id: uuid.UUID, node_id: str, req: LabelRequest, user: User = Depends(require_role("professor"))):
    await ensure_course_owner(user, course_id)
    if req.rater_slot not in ("primary", "secondary"):
        raise HTTPException(status_code=400, detail="rater_slot must be primary or secondary")
    if req.difficulty is not None and req.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=400, detail="difficulty must be easy, medium or hard")
    label = await ConceptDifficultyLabel.find_one(
        ConceptDifficultyLabel.course_id == course_id, ConceptDifficultyLabel.node_id == node_id,
        ConceptDifficultyLabel.rater_slot == req.rater_slot,
    ) or ConceptDifficultyLabel(course_id=course_id, node_id=node_id, rater_id=user.id,
                                rater_slot=req.rater_slot, struggling=req.struggling)
    label.struggling = req.struggling
    label.difficulty = req.difficulty
    label.note = req.note
    label.rater_id = user.id
    label.updated_at = datetime.now(timezone.utc)
    await label.save()
    return {"node_id": node_id, "struggling": label.struggling, "difficulty": label.difficulty, "rater_slot": label.rater_slot}


@router.delete("/courses/{course_id}/labels/{node_id}")
async def clear_label(course_id: uuid.UUID, node_id: str, rater_slot: str = "primary", user: User = Depends(require_role("professor"))):
    await ensure_course_owner(user, course_id)
    await ConceptDifficultyLabel.find(
        ConceptDifficultyLabel.course_id == course_id, ConceptDifficultyLabel.node_id == node_id,
        ConceptDifficultyLabel.rater_slot == rater_slot,
    ).delete()
    return {"node_id": node_id, "cleared": True}


@router.post("/courses/{course_id}/fit")
async def fit_model(course_id: uuid.UUID, user: User = Depends(require_role("professor"))):
    """Fit the calibrated model on the instructor's labels; reports it against the v1 heuristic."""
    from app.services.learner.confusion_model import fit_course_model
    await ensure_course_owner(user, course_id)
    try:
        version = await fit_course_model(course_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"model_id": str(version.id), "metrics": version.metrics, "features": version.features,
            "coefficients": version.coefficients}


@router.get("/courses/{course_id}/mastery")
async def my_mastery(course_id: uuid.UUID, user: User = Depends(current_active_user)):
    """The current student's mastery per concept (professors get the class mean)."""
    from app.services.learner.mastery import course_mastery, student_mastery
    await ensure_course_access(user, course_id)
    if user.role == "professor":
        return {"scope": "class", "concepts": await course_mastery(course_id)}
    return {"scope": "student", "concepts": await student_mastery(user.id, course_id)}


@router.get("/courses/{course_id}/calibration")
async def my_calibration(course_id: uuid.UUID, user: User = Depends(require_role("student"))):
    from app.services.learner.signals import confidence_calibration
    await ensure_course_access(user, course_id)
    return await confidence_calibration(user.id, course_id)


@router.get("/lectures/{doc_id}/heatmap")
async def lecture_heatmap(doc_id: uuid.UUID, bin_seconds: int = 10, user: User = Depends(require_role("professor"))):
    from app.core.storage import presigned_get_url
    from app.services.learner.signals import lecture_heatmap as build
    doc = await DocumentModel.get(doc_id)
    if not doc or doc.media_type != "lecture":
        raise HTTPException(status_code=404, detail="Lecture not found")
    await ensure_course_owner(user, doc.course_id)
    return await build(doc, max(5, min(bin_seconds, 120)), frame_url=lambda key: presigned_get_url(key, content_type="image/jpeg"))
