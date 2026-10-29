"""Per-slide, per-page and per-lecture-moment question counts: which parts of the
material students' questions were answered from."""

import uuid
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from app.models.lecture import LectureChapter
from app.services.insights.common import period, student_runs
from app.services.retrieval.hybrid import format_timestamp

TIME_BIN_S = 30


def _chapter_at(chapters: List[LectureChapter], t: float) -> Optional[LectureChapter]:
    return next((c for c in chapters if c.start <= t < c.end), None)


def location_of(src: dict, chapters: Dict[str, List[LectureChapter]]) -> tuple:
    """(key, row metadata) for one source: a lecture chapter or 30 s bin, a slide, a page, or the whole file."""
    doc_id = src.get("doc_id")
    meta = {"doc_id": doc_id, "filename": src.get("filename"), "media_type": src.get("media_type", "document")}
    if src.get("t_start") is not None:
        t = float(src["t_start"])
        chapter = _chapter_at(chapters.get(doc_id, []), t)
        if chapter:
            return (doc_id, "chapter", chapter.index), {
                **meta, "kind": "chapter", "chapter_id": chapter.chapter_id, "chapter_title": chapter.title,
                "t_start": chapter.start, "location": f"{chapter.title} ({format_timestamp(chapter.start)})"}
        start = int(t // TIME_BIN_S) * TIME_BIN_S
        return (doc_id, "time", start), {**meta, "kind": "time", "t_start": start,
                                         "location": f"{format_timestamp(start)}-{format_timestamp(start + TIME_BIN_S)}"}
    if src.get("slide_start") is not None:
        return (doc_id, "slide", src["slide_start"]), {**meta, "kind": "slide", "slide": src["slide_start"],
                                                       "location": f"slide {src['slide_start']}"}
    if src.get("page_start") is not None:
        return (doc_id, "page", src["page_start"]), {**meta, "kind": "page", "page": src["page_start"],
                                                     "location": f"p. {src['page_start']}"}
    return (doc_id, "doc", None), {**meta, "kind": "document", "location": ""}


async def source_question_counts(course_id: uuid.UUID, days: int = 30, until: Optional[datetime] = None,
                                 limit: int = 50) -> dict:
    since, end = period(days, until)
    runs = [r for r in await student_runs(course_id, since, end) if r.decision == "answered"]
    chapters: Dict[str, List[LectureChapter]] = defaultdict(list)
    for ch in await LectureChapter.find(LectureChapter.course_id == course_id).sort(+LectureChapter.start).to_list():
        chapters[str(ch.doc_id)].append(ch)

    rows: Dict[tuple, dict] = {}
    docs: Dict[str, dict] = {}
    for run in runs:
        cited = set(run.cited_sids)
        seen, docs_seen = set(), set()
        for src in run.sources:
            key, meta = location_of(src, chapters)
            if key in seen:
                continue  # one question counts once per location
            seen.add(key)
            row = rows.setdefault(key, {**meta, "cited": 0, "retrieved": 0})
            row["retrieved"] += 1
            row["cited"] += 1 if src.get("sid") in cited else 0
            doc = docs.setdefault(meta["doc_id"], {k: meta[k] for k in ("doc_id", "filename", "media_type")} | {
                "questions": 0, "cited": 0})
            if meta["doc_id"] not in docs_seen:
                docs_seen.add(meta["doc_id"])
                doc["questions"] += 1
            doc["cited"] += 1 if src.get("sid") in cited else 0

    ranked = sorted(rows.values(), key=lambda r: (r["cited"], r["retrieved"]), reverse=True)
    return {
        "period_start": since.isoformat(), "period_end": end.isoformat(),
        "n_questions": len(runs),
        "time_bin_seconds": TIME_BIN_S,
        "locations": ranked[:limit],
        "documents": sorted(docs.values(), key=lambda d: (d["questions"], d["cited"]), reverse=True),
        "note": "'retrieved' counts questions whose answer drew on this location; 'cited' counts those where the tutor cited it.",
    }
