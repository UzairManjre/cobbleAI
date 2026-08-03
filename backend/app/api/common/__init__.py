from fastapi import APIRouter
from . import analytics, chat

router = APIRouter(tags=["common"])
router.include_router(analytics.router)
router.include_router(chat.router)
