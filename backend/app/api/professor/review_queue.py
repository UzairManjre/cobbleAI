"""Grading review queue (Upgrade C): AI grades with evidence and confidence; the instructor
approves or overrides, results are released, and agreement is reported (RQ3)."""

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.auth import require_role
from app.models.test import Test, TestAttempt
from app.models.user import User
from app.services.access import ensure_course_owner

router = APIRouter(prefix="/grading", tags=["grading review (professor)"])

GRADED_BY_AI = ("short_answer", "code", "essay")


async def _course_tests(course_id: uuid.UUID, test_id: Optional[uuid.UUID]) -> dict:
    filters = [Test.course_id == course_id]
    if test_id:
        filters.append(Test.id == test_id)
    return {t.id: t for t in await Test.find(*filters).to_list()}


async def _rows(course_id: uuid.UUID, test_id: Optional[uuid.UUID] = None):
    """(test, attempt, question, answer) for every free-text answer the AI graded."""
    from app.models.user import User as UserModel
    tests = await _course_tests(course_id, test_id)
    if not tests:
        return [], {}
    attempts = await TestAttempt.find({"test_id": {"$in": list(tests)}}).to_list()
    students = {u.id: u for u in await UserModel.find({"_id": {"$in": list({a.student_id for a in attempts})}}).to_list()}
    rows = []
    for attempt in attempts:
        test = tests[attempt.test_id]
        by_q = {str(q.id): q for q in test.questions}
        for answer in attempt.answers:
            q = by_q.get(str(answer.question_id))
            if q and q.type in GRADED_BY_AI and answer.review_status:
                rows.append((test, attempt, q, answer))
    return rows, students


def _item(test, attempt, q, a, students) -> dict:
    student = students.get(attempt.student_id)
    return {
        "attempt_id": str(attempt.id), "question_id": str(q.id), "test_id": str(test.id), "test_title": test.title,
        "student": {"id": str(attempt.student_id), "name": student.name if student else "Unknown"},
        "question": q.question_text, "cognitive_level": q.cognitive_level, "max_marks": q.marks,
        "rubric": q.rubric, "model_answer": q.explanation,
        "answer": a.answer_text, "ai_score": a.ai_score, "final_score": a.marks_awarded,
        "confidence": a.grade_confidence, "evidence": a.evidence, "ai_feedback": a.ai_feedback,
        "ai_rationale": a.ai_rationale, "feedback": a.feedback, "review_status": a.review_status,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
    }


@router.get("/queue")
async def review_queue(course_id: uuid.UUID, status: str = "needs_review", test_id: Optional[uuid.UUID] = None,
                       user: User = Depends(require_role("professor"))):
    """Answers to review, least confident first. status: needs_review | reviewed | all"""
    await ensure_course_owner(user, course_id)
    rows, students = await _rows(course_id, test_id)
    if status == "needs_review":
        rows = [r for r in rows if r[3].review_status == "needs_review"]
    elif status == "reviewed":
        rows = [r for r in rows if r[3].review_status in ("approved", "overridden")]
    rows.sort(key=lambda r: (r[3].grade_confidence if r[3].grade_confidence is not None else -1))
    return {"items": [_item(*r, students) for r in rows],
            "counts": {"needs_review": sum(1 for r in (await _rows(course_id, test_id))[0] if r[3].review_status == "needs_review")}}


class ReviewDecision(BaseModel):
    action: str  # approve | override
    score: Optional[float] = None
    feedback: Optional[str] = None


@router.post("/answers/{attempt_id}/{question_id}/review")
async def review_answer(attempt_id: uuid.UUID, question_id: uuid.UUID, req: ReviewDecision,
                        user: User = Depends(require_role("professor"))):
    attempt = await TestAttempt.get(attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    test = await Test.get(attempt.test_id)
    await ensure_course_owner(user, test.course_id)
    question = next((q for q in test.questions if q.id == question_id), None)
    answer = next((a for a in attempt.answers if a.question_id == question_id), None)
    if not question or not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    first_resolution = answer.review_status == "needs_review"
    if req.action == "approve":
        if answer.ai_score is None:
            raise HTTPException(status_code=400, detail="There is no AI score to approve; enter a score instead")
        answer.marks_awarded = answer.ai_score
        answer.review_status = "approved"
    elif req.action == "override":
        if req.score is None or not (0 <= req.score <= question.marks):
            raise HTTPException(status_code=400, detail=f"score must be between 0 and {question.marks}")
        answer.marks_awarded = float(req.score)
        answer.review_status = "overridden"
    else:
        raise HTTPException(status_code=400, detail="action must be approve or override")
    if req.feedback is not None:
        answer.feedback = req.feedback
    answer.is_correct = answer.marks_awarded >= 0.5 * question.marks
    answer.graded_by = str(user.id)
    answer.reviewed_by = user.id
    answer.reviewed_at = datetime.now(timezone.utc)

    # Re-total, and release the attempt once nothing is left to review (if the test's results are out)
    from app.services.test_service import TestService
    attempt.total_marks_awarded = sum(a.marks_awarded or 0.0 for a in attempt.answers)
    attempt.percentage = (attempt.total_marks_awarded / test.total_marks * 100) if test.total_marks else 0
    if (attempt.status == "submitted" and TestService.results_visible(test)
            and not any(a.review_status == "needs_review" for a in attempt.answers)):
        attempt.status = "graded"
    await attempt.save()

    if first_resolution:  # a later re-review must not count the same answer twice in the learner model
        await TestService.update_mastery(attempt.student_id, test, [answer])
    await TestService.update_test_analytics(test.id, test.course_id)
    return {"attempt_status": attempt.status, "final_score": answer.marks_awarded, "review_status": answer.review_status}


CSV_COLUMNS = ["test", "student", "question", "cognitive_level", "max_marks", "ai_score", "final_score",
               "confidence", "review_status", "reviewed_at", "answer", "feedback"]


@router.get("/export.csv")
async def export_csv(course_id: uuid.UUID, test_id: Optional[uuid.UUID] = None, user: User = Depends(require_role("professor"))):
    await ensure_course_owner(user, course_id)
    rows, students = await _rows(course_id, test_id)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for test, attempt, q, a in rows:
        student = students.get(attempt.student_id)
        writer.writerow({
            "test": test.title, "student": student.name if student else str(attempt.student_id),
            "question": q.question_text, "cognitive_level": q.cognitive_level or "", "max_marks": q.marks,
            "ai_score": a.ai_score, "final_score": a.marks_awarded, "confidence": a.grade_confidence,
            "review_status": a.review_status, "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else "",
            "answer": a.answer_text or "", "feedback": a.feedback or "",
        })
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="grades.csv"'})


def agreement_stats(pairs: List[tuple]) -> dict:
    """pairs: (ai_score, instructor_score, max_marks). Scores compared in half-mark units."""
    from app.utils.stats import bootstrap_ci, exact_agreement, mae, quadratic_weighted_kappa
    if not pairs:
        return {"n": 0}
    ai = [round(p[0] * 2) for p in pairs]
    human = [round(p[1] * 2) for p in pairs]
    normalized_err = [abs(p[0] - p[1]) / p[2] for p in pairs if p[2]]
    idx = list(range(len(pairs)))

    def qwk_of(sample):
        return quadratic_weighted_kappa([ai[i] for i in sample], [human[i] for i in sample])

    return {
        "n": len(pairs),
        "qwk": quadratic_weighted_kappa(ai, human),
        "qwk_ci": bootstrap_ci(idx, qwk_of, n_resamples=500) if len(pairs) >= 5 else None,
        "mae_marks": mae([p[0] for p in pairs], [p[1] for p in pairs]),
        "mae_normalized": sum(normalized_err) / len(normalized_err) if normalized_err else None,
        "exact_agreement": exact_agreement(ai, human),
        "override_rate": sum(1 for a, h in zip(ai, human) if a != h) / len(pairs),
    }


@router.get("/agreement")
async def agreement(course_id: uuid.UUID, test_id: Optional[uuid.UUID] = None, user: User = Depends(require_role("professor"))):
    """AI-vs-instructor agreement on reviewed answers, overall and by cognitive level (RQ3)."""
    await ensure_course_owner(user, course_id)
    rows, _ = await _rows(course_id, test_id)
    reviewed = [(q, a) for _, _, q, a in rows if a.review_status in ("approved", "overridden") and a.ai_score is not None]
    by_level = {}
    for q, a in reviewed:
        by_level.setdefault(q.cognitive_level or "untagged", []).append((a.ai_score, a.marks_awarded, q.marks))
    all_pairs = [(a.ai_score, a.marks_awarded, q.marks) for q, a in reviewed]
    return {
        "overall": agreement_stats(all_pairs),
        "by_cognitive_level": {level: agreement_stats(p) for level, p in sorted(by_level.items())},
        "auto_accepted": sum(1 for _, _, _, a in rows if a.review_status == "auto"),
        "pending_review": sum(1 for _, _, _, a in rows if a.review_status == "needs_review"),
        "note": "Only instructor-reviewed answers count. Auto-accepted answers were not independently checked.",
    }
