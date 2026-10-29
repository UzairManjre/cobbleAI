"""Course-level tutor: ask the course or one lecture, tutor policy, and answer feedback."""

import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.auth import current_active_user, require_role
from app.models.graph import ChatMessage
from app.models.tutor import HINT_LEVELS, AnswerFeedback, TopicPolicyOverride, TutorPolicy, TutorRun
from app.models.user import User
from app.services.access import ensure_course_access, ensure_course_owner
from app.services.tutor_engine import MODES, TutorEngine, TutorRequest
from app.services.tutor_policy import effective_policy, get_policy
from app.services.tutor_stream import tutor_sse
from app.utils.llm_text import split_thinking
from app.utils.telemetry import safe_track_event

router = APIRouter(prefix="/tutor", tags=["tutor"])

_CHAT_NAMESPACE = uuid.UUID("2d7c6a4e-1b8f-4d0e-a3c5-7f9e1c2b4a60")
FEEDBACK_RATINGS = ("helpful", "wrong", "not_in_notes")


def course_chat_session_id(user_id: uuid.UUID, course_id: uuid.UUID, lecture_id: Optional[str]) -> uuid.UUID:
    """Course-level chats have no study session; derive a stable id per student, course and scope."""
    return uuid.uuid5(_CHAT_NAMESPACE, f"{user_id}:{course_id}:{lecture_id or 'course'}")


def _maybe_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value)) if value else None
    except ValueError:
        return None


def _chat_node_id(lecture_id: Optional[str]) -> str:
    return f"lecture:{lecture_id}" if lecture_id else "course"


class CourseAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    mode: Optional[str] = None
    hint_level: Optional[str] = None
    lecture_id: Optional[str] = None  # "ask this lecture": restrict evidence to one recording
    doc_ids: Optional[List[str]] = None
    video_t: Optional[float] = None  # playback position when asked from the lecture player


@router.post("/courses/{course_id}/ask")
async def ask_course(course_id: uuid.UUID, req: CourseAskRequest, user: User = Depends(current_active_user)):
    started = time.time()
    await ensure_course_access(user, course_id)
    doc_ids = [req.lecture_id] if req.lecture_id else req.doc_ids
    session_id = course_chat_session_id(user.id, course_id, req.lecture_id)
    node_id = _chat_node_id(req.lecture_id)

    previous = await ChatMessage.find(
        ChatMessage.session_id == session_id, ChatMessage.node_id == node_id
    ).sort(ChatMessage.created_at).to_list()

    safe_track_event(
        "question_asked", "chat", user.id, user.role,
        course_id=course_id,
        document_id=_maybe_uuid(req.lecture_id),
        payload={
            "question_length_chars": len(req.question),
            "word_count": len(req.question.split()),
            "surface": "lecture" if req.lecture_id else "course",
            "mode": req.mode or "teach",
            "hint_level": req.hint_level,
            "video_t": req.video_t,
        },
    )

    engine = TutorEngine()
    prepared = await engine.prepare(TutorRequest(
        question=req.question,
        course_id=str(course_id),
        mode=req.mode if req.mode in MODES else "teach",
        hint_level=req.hint_level,
        history=[{"role": m.role, "content": m.content} for m in previous],
        doc_ids=doc_ids,
        user=user,
    ))
    return StreamingResponse(
        tutor_sse(
            engine, prepared, user=user, session_id=session_id, chat_node_id=node_id,
            endpoint="lecture_ask" if req.lecture_id else "course_ask", course_id=course_id,
            started_at=started,
            event_payload={"surface": "lecture" if req.lecture_id else "course", "lecture_id": req.lecture_id, "video_t": req.video_t},
        ),
        media_type="text/event-stream",
    )


@router.get("/courses/{course_id}/chat")
async def get_course_chat(course_id: uuid.UUID, lecture_id: Optional[str] = None, user: User = Depends(current_active_user)):
    await ensure_course_access(user, course_id)
    session_id = course_chat_session_id(user.id, course_id, lecture_id)
    messages = await ChatMessage.find(
        ChatMessage.session_id == session_id, ChatMessage.node_id == _chat_node_id(lecture_id)
    ).sort(ChatMessage.created_at).to_list()
    history = []
    for m in messages:
        content, legacy_thinking = split_thinking(m.content)
        history.append({
            "id": str(m.id), "role": m.role, "content": content,
            "thinking": m.thinking or legacy_thinking or None,
            "sources": m.sources or [], "citations": m.citations, "decision": m.decision,
            "support": m.support, "mode": m.mode, "hint_level": m.hint_level,
            "created_at": m.created_at.isoformat(),
        })
    return {"messages": history}


@router.get("/courses/{course_id}/policy")
async def get_effective_policy(course_id: uuid.UUID, node_id: Optional[str] = None, user: User = Depends(current_active_user)):
    """The limits in force for the current user (the UI disables help levels above max)."""
    await ensure_course_access(user, course_id)
    return (await effective_policy(course_id, user, node_id)).to_dict()


#   Instructor policy controls

class PolicyUpdate(BaseModel):
    max_hint_level: Optional[str] = None
    default_hint_level: Optional[str] = None
    allow_full_answers: Optional[bool] = None
    assessment_mode: Optional[bool] = None
    auto_assessment_mode: Optional[bool] = None
    scope: Optional[str] = None
    allowed_doc_ids: Optional[List[str]] = None
    cite_or_decline: Optional[bool] = None
    topic_overrides: Optional[List[TopicPolicyOverride]] = None


@router.get("/courses/{course_id}/policy/settings")
async def get_policy_settings(course_id: uuid.UUID, user: User = Depends(require_role("professor"))):
    await ensure_course_owner(user, course_id)
    policy = await get_policy(course_id)
    return {**policy.model_dump(mode="json"), "hint_levels": HINT_LEVELS}


@router.put("/courses/{course_id}/policy/settings")
async def update_policy_settings(course_id: uuid.UUID, req: PolicyUpdate, user: User = Depends(require_role("professor"))):
    await ensure_course_owner(user, course_id)
    for level in (req.max_hint_level, req.default_hint_level):
        if level is not None and level not in HINT_LEVELS:
            raise HTTPException(status_code=400, detail=f"Unknown hint level '{level}'")
    for override in req.topic_overrides or []:
        if override.max_hint_level is not None and override.max_hint_level not in HINT_LEVELS:
            raise HTTPException(status_code=400, detail=f"Unknown hint level '{override.max_hint_level}'")
    if req.scope is not None and req.scope not in ("course_materials", "selected_documents"):
        raise HTTPException(status_code=400, detail="scope must be course_materials or selected_documents")

    policy = await TutorPolicy.find_one(TutorPolicy.course_id == course_id) or TutorPolicy(course_id=course_id)
    for key, value in req.model_dump(exclude_unset=True).items():
        if key == "topic_overrides":
            value = [TopicPolicyOverride(**o) for o in value]
        setattr(policy, key, value)
    policy.updated_by = user.id
    policy.updated_at = datetime.now(timezone.utc)
    await policy.save()
    return {**policy.model_dump(mode="json"), "hint_levels": HINT_LEVELS}


#   Answer feedback

class FeedbackRequest(BaseModel):
    message_id: uuid.UUID
    rating: str
    comment: Optional[str] = Field(default=None, max_length=1000)


@router.post("/feedback")
async def submit_feedback(req: FeedbackRequest, user: User = Depends(current_active_user)):
    if req.rating not in FEEDBACK_RATINGS:
        raise HTTPException(status_code=400, detail=f"rating must be one of {', '.join(FEEDBACK_RATINGS)}")
    message = await ChatMessage.get(req.message_id)
    if not message or message.role != "assistant":
        raise HTTPException(status_code=404, detail="Answer not found")
    run = await TutorRun.find_one(TutorRun.message_id == req.message_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only rate answers you received")

    feedback = await AnswerFeedback.find_one(
        AnswerFeedback.message_id == req.message_id, AnswerFeedback.student_id == user.id
    )
    if feedback is None:
        feedback = AnswerFeedback(message_id=req.message_id, student_id=user.id, rating=req.rating)
    feedback.rating = req.rating
    feedback.comment = req.comment
    feedback.run_id = run.id
    feedback.course_id = run.course_id
    feedback.node_id = run.node_id
    feedback.question = run.question
    feedback.status = "open"
    feedback.updated_at = datetime.now(timezone.utc)
    await feedback.save()

    safe_track_event(
        "answer_feedback", "chat", user.id, user.role, course_id=run.course_id, node_id=run.node_id,
        payload={"rating": req.rating, "message_id": str(req.message_id), "decision": run.decision},
    )
    return {"status": "ok", "rating": feedback.rating}


@router.get("/courses/{course_id}/feedback")
async def list_feedback(
    course_id: uuid.UUID,
    status: Optional[str] = "open",
    include_helpful: bool = False,
    user: User = Depends(require_role("professor")),
):
    """Instructor review list: answers students flagged as wrong or not in their notes."""
    await ensure_course_owner(user, course_id)
    filters = [AnswerFeedback.course_id == course_id]
    if status:
        filters.append(AnswerFeedback.status == status)
    items = await AnswerFeedback.find(*filters).sort(-AnswerFeedback.updated_at).to_list()
    if not include_helpful:
        items = [f for f in items if f.rating != "helpful"]
    runs = {r.id: r for r in await TutorRun.find({"_id": {"$in": [f.run_id for f in items if f.run_id]}}).to_list()}
    result = []
    for f in items:
        run = runs.get(f.run_id)
        result.append({
            "id": str(f.id),
            "rating": f.rating,
            "comment": f.comment,
            "status": f.status,
            "question": f.question,
            "answer": run.answer if run else None,
            "decision": run.decision if run else None,
            "support": run.support_level if run else None,
            "citations": [s for s in (run.sources if run else []) if s.get("sid") in (run.cited_sids if run else [])],
            "node_id": f.node_id,
            "updated_at": f.updated_at.isoformat(),
        })
    return {"items": result}


class FeedbackStatusUpdate(BaseModel):
    status: str


@router.patch("/feedback/{feedback_id}")
async def update_feedback_status(feedback_id: uuid.UUID, req: FeedbackStatusUpdate, user: User = Depends(require_role("professor"))):
    if req.status not in ("open", "resolved"):
        raise HTTPException(status_code=400, detail="status must be open or resolved")
    feedback = await AnswerFeedback.get(feedback_id)
    if not feedback or not feedback.course_id:
        raise HTTPException(status_code=404, detail="Feedback not found")
    await ensure_course_owner(user, feedback.course_id)
    feedback.status = req.status
    feedback.resolved_by = user.id if req.status == "resolved" else None
    feedback.updated_at = datetime.now(timezone.utc)
    await feedback.save()
    return {"status": feedback.status}
