from fastapi import APIRouter, Depends, Request
from typing import Optional
import uuid
from app.api.auth import current_active_user
from app.models.user import User
from app.schemas.analytics import TrackEventRequest, TrackBatchRequest
from app.services.analytics_service import DashboardAnalyticsService
import asyncio

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Payload keys the client may use instead of the top-level context fields
_CONTEXT_ALIASES = {
    "course_id": ("course_id", "courseId"),
    "graph_id": ("graph_id", "graphId"),
    "session_id": ("session_id", "sessionId"),
    "node_id": ("node_id", "nodeId"),
    "document_id": ("document_id", "documentId", "lecture_id", "lectureId"),
}
_UUID_FIELDS = {"course_id", "graph_id", "session_id", "document_id"}

_pending: set = set()


def _context_value(req: TrackEventRequest, field: str):
    value = getattr(req, field)
    if value is None and isinstance(req.payload, dict):
        for key in _CONTEXT_ALIASES[field]:
            if req.payload.get(key):
                value = req.payload[key]
                break
    if value is None:
        return None
    if field in _UUID_FIELDS:
        try:
            return uuid.UUID(str(value))
        except ValueError:
            return None
    return str(value)


def _event_kwargs(req: TrackEventRequest, user: User, request: Request) -> dict:
    category = req.event_category
    if not category and isinstance(req.payload, dict):
        category = req.payload.get("category")
    return dict(
        event_type=req.event_type,
        event_category=category or "ui",
        user_id=user.id,
        user_role=user.role,
        payload=req.payload or {},
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        **{field: _context_value(req, field) for field in _CONTEXT_ALIASES},
    )


async def _in_scope(user: User, event: dict, cache: dict) -> bool:
    """Course-tagged events feed the learner model, the confusion heatmap and the dashboards, so an
    event only counts for a course the user belongs to, and a document must belong to that course."""
    from fastapi import HTTPException
    from app.models.document import DocumentModel
    from app.services.access import ensure_course_access
    course_id, doc_id = event.get("course_id"), event.get("document_id")
    if doc_id:
        if ("doc", doc_id) not in cache:
            doc = await DocumentModel.get(doc_id)
            cache[("doc", doc_id)] = doc.course_id if doc else None
        doc_course = cache[("doc", doc_id)]
        if doc_course is None or (course_id and course_id != doc_course):
            return False
        course_id = event["course_id"] = doc_course
    if course_id:
        if ("course", course_id) not in cache:
            try:
                await ensure_course_access(user, course_id)
                cache[("course", course_id)] = True
            except HTTPException:
                cache[("course", course_id)] = False
        return cache[("course", course_id)]
    return True


async def _scoped(user: User, events: list) -> list:
    cache: dict = {}
    return [e for e in events if await _in_scope(user, e, cache)]


def _fire(coro_factory):
    async def _run():
        try:
            await coro_factory()
        except Exception as e:
            import logging
            logging.error(f"Analytics tracking failed: {e}")
    task = asyncio.create_task(_run())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


@router.post("/track")
async def track_event_endpoint(req: TrackEventRequest, request: Request, user: User = Depends(current_active_user)):
    from app.services.analytics import analytics_service
    kwargs = _event_kwargs(req, user, request)

    async def _track():
        if await _scoped(user, [kwargs]):
            await analytics_service.track_event(**kwargs)
    _fire(_track)
    return {"status": "ok"}


@router.post("/track/batch")
async def track_events_batch_endpoint(req: TrackBatchRequest, request: Request, user: User = Depends(current_active_user)):
    from app.services.analytics import analytics_service
    events = [_event_kwargs(e, user, request) for e in req.events]

    async def _track():
        kept = await _scoped(user, events)
        if kept:
            await analytics_service.track_events_batch(kept)
    if events:
        _fire(_track)
    return {"status": "ok", "count": len(events)}


@router.get("/dashboard")
async def get_analytics_dashboard(course_id: Optional[str] = None, user: User = Depends(current_active_user)):
    return await DashboardAnalyticsService.get_dashboard(user, course_id)
