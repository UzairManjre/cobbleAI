import asyncio

# Keep references so pending fire-and-forget tasks are not garbage-collected mid-flight
_pending_tasks: set = set()


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
            logging.error(f"Analytics tracking failed for {event_type}: {e}")
    task = asyncio.create_task(_track())
    _pending_tasks.add(task)
    task.add_done_callback(_pending_tasks.discard)
