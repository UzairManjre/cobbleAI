import asyncio

def safe_track_event(event_type: str, event_category: str, user_id, user_role: str, **kwargs):
    """Fire-and-forget event tracking that never breaks the caller."""
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=event_type,
                event_category=event_category,
                user_id=user_id,
                user_role=user_role,
                **kwargs,
            )
        except Exception as e:
            import logging
            from fastapi import HTTPException
            logging.error(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail="An error occurred")
    asyncio.create_task(_track())
