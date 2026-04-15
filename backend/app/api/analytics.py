from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional, Dict
from app.api.auth import current_active_user
from app.models.user import User
import asyncio
import uuid as _uuid

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class TrackEventRequest(BaseModel):
    event_type: str
    payload: Optional[Dict] = {}


@router.post("/track")
async def track_event_endpoint(
    req: TrackEventRequest,
    request: Request,
    user: User = Depends(current_active_user)
):
    """
    Receive analytics events from the frontend.
    Fire-and-forget — never blocks the response.
    """
    # Fire event tracking asynchronously without blocking
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=req.event_type,
                event_category=req.payload.get("category", "ui"),
                user_id=user.id,
                user_role=user.role,
                payload=req.payload or {},
                user_agent=request.headers.get("user-agent"),
                ip_address=request.client.host if request.client else None,
            )
        except Exception:
            pass  # Never break the app on analytics failure

    asyncio.create_task(_track())

    return {"status": "ok"}
