"""Research participation consent (pilot study S7). Opt-in, versioned, timestamped and
revocable; research exports include only users whose latest decision is consent."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.auth import current_active_user
from app.models.user import User

router = APIRouter(prefix="/consent", tags=["research consent"])

CONSENT_VERSION = "2026-10-v1"
CONSENT_TEXT = (
    "CobbleAI is part of a research study on AI tutoring. If you agree, your tutor questions and answers, "
    "how you use course materials and lecture videos, and your quiz results may be analysed by the research team. "
    "Exports replace your identity with a random code, and nothing is shared outside the study. "
    "Saying no does not change how CobbleAI works for you or affect your grades, and you can change your answer at any time."
)


class ConsentRequest(BaseModel):
    consent: bool


def _status(user: User) -> dict:
    return {
        "research_consent": user.research_consent,
        "research_consent_at": user.research_consent_at.isoformat() if user.research_consent_at else None,
        "research_consent_version": user.research_consent_version,
        "current_version": CONSENT_VERSION,
        "needs_decision": user.research_consent is None or user.research_consent_version != CONSENT_VERSION,
        "text": CONSENT_TEXT,
    }


@router.get("")
async def get_consent(user: User = Depends(current_active_user)):
    return _status(user)


@router.put("")
async def set_consent(req: ConsentRequest, user: User = Depends(current_active_user)):
    user.research_consent = req.consent
    user.research_consent_at = datetime.now(timezone.utc)
    user.research_consent_version = CONSENT_VERSION
    await user.save()
    return _status(user)
