"""Professor insights (question clusters, coverage gaps, per-slide and per-lecture question
counts, one-click reports) and the course FAQ that students see once it is published."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel

from app.api.auth import current_active_user, require_role
from app.models.insights import FAQEntry, QuestionInsight
from app.models.user import User
from app.services.access import ensure_course_access, ensure_course_owner

router = APIRouter(tags=["insights"])
professor = require_role("professor")


@router.get("/insights/courses/{course_id}/questions")
async def latest_question_insight(course_id: uuid.UUID, user: User = Depends(professor)):
    from app.services.insights.questions import insight_to_dict, latest_insight
    await ensure_course_owner(user, course_id)
    insight = await latest_insight(course_id)
    return {"insight": insight_to_dict(insight) if insight else None}


@router.post("/insights/courses/{course_id}/questions/generate")
async def generate_question_insight(course_id: uuid.UUID, days: int = Query(7, ge=1, le=365), user: User = Depends(professor)):
    from app.services.insights.questions import generate_question_insights, insight_to_dict
    await ensure_course_owner(user, course_id)
    return {"insight": insight_to_dict(await generate_question_insights(course_id, days=days))}


@router.get("/insights/courses/{course_id}/coverage-gaps")
async def coverage_gap_report(course_id: uuid.UUID, days: int = Query(30, ge=1, le=365), user: User = Depends(professor)):
    from app.services.insights.coverage import coverage_gaps
    await ensure_course_owner(user, course_id)
    return await coverage_gaps(course_id, days=days)


@router.get("/insights/courses/{course_id}/source-counts")
async def question_counts(course_id: uuid.UUID, days: int = Query(30, ge=1, le=365), limit: int = Query(50, ge=1, le=500),
                          user: User = Depends(professor)):
    from app.services.insights.counts import source_question_counts
    await ensure_course_owner(user, course_id)
    return await source_question_counts(course_id, days=days, limit=limit)


@router.get("/insights/courses/{course_id}/reports/{report_file}")
async def course_report(course_id: uuid.UUID, report_file: str, user: User = Depends(professor)):
    """weekly.csv, weekly.pdf, term.csv or term.pdf"""
    from app.services.insights.reports import build_report, to_csv, to_pdf
    kind, _, fmt = report_file.partition(".")
    if kind not in ("weekly", "term") or fmt not in ("csv", "pdf", "json"):
        raise HTTPException(status_code=404, detail="Report must be weekly or term, as .csv, .pdf or .json")
    course = await ensure_course_owner(user, course_id)
    report = await build_report(course, kind)
    if fmt == "json":
        return report
    filename = f"{(getattr(course, 'code', '') or 'course').replace(' ', '_')}_{kind}_{report['period_end'][:10]}.{fmt}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if fmt == "csv":
        return PlainTextResponse(to_csv(report), media_type="text/csv", headers=headers)
    return Response(to_pdf(report), media_type="application/pdf", headers=headers)


#   FAQ

@router.get("/faq/courses/{course_id}")
async def list_faq(course_id: uuid.UUID, user: User = Depends(current_active_user)):
    """Students see published entries; the course's professor also sees drafts."""
    from app.services.insights.faq import faq_to_dict
    await ensure_course_access(user, course_id)
    is_owner = user.role == "professor"
    query = [FAQEntry.course_id == course_id] + ([] if is_owner else [FAQEntry.status == "published"])
    entries = await FAQEntry.find(*query).sort(+FAQEntry.order).to_list()
    return {"entries": [faq_to_dict(e, include_meta=is_owner) for e in entries]}


@router.post("/faq/courses/{course_id}/draft")
async def draft_faq_entries(course_id: uuid.UUID, top_n: int = Query(5, ge=1, le=20), insight_id: Optional[uuid.UUID] = None,
                            user: User = Depends(professor)):
    from app.services.insights.faq import draft_faq
    from app.services.insights.questions import latest_insight
    await ensure_course_owner(user, course_id)
    insight = await QuestionInsight.get(insight_id) if insight_id else await latest_insight(course_id)
    if not insight or insight.course_id != course_id:
        raise HTTPException(status_code=404, detail="Generate question insights first")
    return await draft_faq(course_id, insight, user=user, top_n=top_n)


class FAQCreate(BaseModel):
    question: str
    answer: str = ""


class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    status: Optional[str] = None
    order: Optional[int] = None


@router.post("/faq/courses/{course_id}")
async def create_faq_entry(course_id: uuid.UUID, req: FAQCreate, user: User = Depends(professor)):
    from app.services.insights.faq import faq_to_dict
    await ensure_course_owner(user, course_id)
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")
    last = await FAQEntry.find(FAQEntry.course_id == course_id).sort(-FAQEntry.order).first_or_none()
    entry = FAQEntry(course_id=course_id, question=req.question.strip(), answer=req.answer.strip(),
                     order=(last.order + 1) if last else 0, created_by=user.id)
    await entry.insert()
    return faq_to_dict(entry)


async def _owned_entry(entry_id: uuid.UUID, user: User) -> FAQEntry:
    entry = await FAQEntry.get(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="FAQ entry not found")
    await ensure_course_owner(user, entry.course_id)
    return entry


@router.patch("/faq/{entry_id}")
async def edit_faq_entry(entry_id: uuid.UUID, req: FAQUpdate, user: User = Depends(professor)):
    from app.services.insights.faq import faq_to_dict, update_faq
    entry = await _owned_entry(entry_id, user)
    try:
        entry = await update_faq(entry, user, **req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return faq_to_dict(entry)


@router.delete("/faq/{entry_id}")
async def delete_faq_entry(entry_id: uuid.UUID, user: User = Depends(professor)):
    entry = await _owned_entry(entry_id, user)
    await entry.delete()
    return {"deleted": str(entry_id)}
