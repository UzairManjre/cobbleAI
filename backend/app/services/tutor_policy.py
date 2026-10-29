"""Resolve the tutor policy in force for one student, course and topic."""

import uuid
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from app.models.tutor import HINT_LEVELS, TutorPolicy

# Highest help level allowed while an assessment is running: no worked steps or answers
ASSESSMENT_MAX_HINT = "guiding_question"


@dataclass
class EffectivePolicy:
    max_hint_level: str = "full_answer"
    default_hint_level: str = "guiding_question"
    allow_full_answers: bool = True
    assessment_active: bool = False
    assessment_reason: Optional[str] = None
    cite_or_decline: bool = True
    allowed_doc_ids: List[str] = field(default_factory=list)

    @property
    def allowed_levels(self) -> List[str]:
        return HINT_LEVELS[: HINT_LEVELS.index(self.max_hint_level) + 1]

    def to_dict(self) -> dict:
        data = asdict(self)
        data["allowed_levels"] = self.allowed_levels
        return data


def _level(value: Optional[str], fallback: str) -> str:
    return value if value in HINT_LEVELS else fallback


def _cap(level: str, cap: str) -> str:
    return HINT_LEVELS[min(HINT_LEVELS.index(level), HINT_LEVELS.index(cap))]


async def get_policy(course_id: uuid.UUID) -> TutorPolicy:
    """Stored policy, or the default (unsaved) one when the instructor has not set any."""
    policy = await TutorPolicy.find_one(TutorPolicy.course_id == course_id)
    return policy or TutorPolicy(course_id=course_id)


async def _active_assessment(student_id: uuid.UUID, course_id: uuid.UUID) -> Optional[str]:
    """Title of a test the student is taking right now, if any."""
    from app.models.test import Test, TestAttempt
    attempts = await TestAttempt.find(
        TestAttempt.student_id == student_id,
        TestAttempt.course_id == course_id,
        TestAttempt.status == "in_progress",
    ).to_list()
    now = datetime.now(timezone.utc)
    for attempt in attempts:
        test = await Test.get(attempt.test_id)
        if not test or test.test_type == "mock_test":
            continue
        started = attempt.started_at if attempt.started_at.tzinfo else attempt.started_at.replace(tzinfo=timezone.utc)
        # Abandoned attempts stop counting once their time (plus a grace period) is up
        if now <= started + timedelta(minutes=test.duration_minutes + 10):
            return test.title
    return None


async def effective_policy(course_id: Optional[uuid.UUID], user=None, node_id: Optional[str] = None) -> EffectivePolicy:
    if course_id is None:
        return EffectivePolicy()
    policy = await get_policy(course_id)
    eff = EffectivePolicy(
        max_hint_level=_level(policy.max_hint_level, "full_answer"),
        default_hint_level=_level(policy.default_hint_level, "guiding_question"),
        allow_full_answers=policy.allow_full_answers,
        cite_or_decline=policy.cite_or_decline,
        allowed_doc_ids=list(policy.allowed_doc_ids) if policy.scope == "selected_documents" else [],
    )
    override = next((o for o in policy.topic_overrides if node_id and o.node_id == node_id), None)
    if override:
        if override.max_hint_level in HINT_LEVELS:
            eff.max_hint_level = override.max_hint_level
        if override.allow_full_answers is not None:
            eff.allow_full_answers = override.allow_full_answers

    if policy.assessment_mode:
        eff.assessment_active, eff.assessment_reason = True, "Assessment mode is on for this course"
    elif policy.auto_assessment_mode and user is not None and getattr(user, "role", None) == "student":
        title = await _active_assessment(user.id, course_id)
        if title:
            eff.assessment_active, eff.assessment_reason = True, f"You have '{title}' in progress"

    if eff.assessment_active:
        eff.max_hint_level = _cap(eff.max_hint_level, ASSESSMENT_MAX_HINT)
        eff.allow_full_answers = False
    if not eff.allow_full_answers:
        eff.max_hint_level = _cap(eff.max_hint_level, "worked_step")
    eff.default_hint_level = _cap(eff.default_hint_level, eff.max_hint_level)
    return eff


def clamp_hint(requested: Optional[str], policy: EffectivePolicy) -> str:
    level = requested if requested in HINT_LEVELS else policy.default_hint_level
    return _cap(level, policy.max_hint_level)
