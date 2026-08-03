from fastapi import APIRouter, Depends, Request
from typing import Optional
from app.api.auth import current_active_user
from app.models.user import User
from app.schemas.analytics import TrackEventRequest
from app.services.analytics_service import DashboardAnalyticsService
import asyncio

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.post("/track")
async def track_event_endpoint(req: TrackEventRequest, request: Request, user: User = Depends(current_active_user)):
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=req.event_type,
                event_category=req.payload.get("category", "ui") if isinstance(req.payload, dict) else "ui",
                user_id=user.id,
                user_role=user.role,
                payload=req.payload or {},
                user_agent=request.headers.get("user-agent"),
                ip_address=request.client.host if request.client else None,
            )
        except Exception as e:
            import logging
            from fastapi import HTTPException
            logging.error(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail="An error occurred")
    asyncio.create_task(_track())
    return {"status": "ok"}

@router.get("/dashboard")
async def get_analytics_dashboard(course_id: Optional[str] = None, user: User = Depends(current_active_user)):
    return await DashboardAnalyticsService.get_dashboard(user, course_id)
