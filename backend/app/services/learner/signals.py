"""Video confusion heatmap (professor) and confidence calibration (student)."""

import uuid
from collections import defaultdict
from typing import Dict, List

from app.models.analytics.event import AnalyticsEvent
from app.models.document import DocumentModel
from app.models.lecture import LectureChapter, LectureFrame, LectureTranscript
from app.models.test import Test, TestAttempt

HEAT_EVENTS = ("video_replay", "video_seek", "video_pause", "question_asked")
# Display weights for the combined intensity; raw counts are always returned too
WEIGHTS = {"replays": 1.0, "rewinds": 0.5, "pauses": 0.3, "questions": 1.5}
CONFIDENCE_PROB = {1: 0.25, 2: 0.5, 3: 0.75, 4: 0.95}


async def lecture_heatmap(doc: DocumentModel, bin_s: int = 10, frame_url=None) -> dict:
    # Students only: the instructor inspecting a hotspot must not make it hotter
    events = await AnalyticsEvent.find(
        AnalyticsEvent.document_id == doc.id,
        AnalyticsEvent.user_role == "student",
        {"event_type": {"$in": list(HEAT_EVENTS)}},
    ).to_list()
    transcript = await LectureTranscript.find_one(LectureTranscript.doc_id == doc.id)
    chapters = await LectureChapter.find(LectureChapter.doc_id == doc.id).sort(LectureChapter.index).to_list()
    frames = await LectureFrame.find(LectureFrame.doc_id == doc.id).sort(LectureFrame.t).to_list()
    duration = doc.duration_sec or (transcript.duration_sec if transcript else 0) or 0

    bins: Dict[int, dict] = defaultdict(lambda: {"replays": 0, "rewinds": 0, "pauses": 0, "questions": 0, "students": set()})
    for ev in events:
        p = ev.payload or {}
        if p.get("source") == "navigation":
            continue  # a jump from a transcript line, chapter or citation is not a replay
        if ev.event_type == "video_replay":
            t = p.get("to")
            key = "replays"
        elif ev.event_type == "video_seek":
            if p.get("direction") != "back":
                continue
            t, key = p.get("to"), "rewinds"
        elif ev.event_type == "video_pause":
            t, key = p.get("t"), "pauses"
        else:
            t, key = p.get("video_t"), "questions"
        if not isinstance(t, (int, float)) or t < 0:
            continue
        b = int(t // bin_s)
        bins[b][key] += 1
        bins[b]["students"].add(ev.user_id)

    n_bins = max(int(duration // bin_s) + 1, (max(bins) + 1) if bins else 0)
    out = []
    peak = 0.0
    for b in range(n_bins):
        data = bins.get(b, {"replays": 0, "rewinds": 0, "pauses": 0, "questions": 0, "students": set()})
        intensity = sum(WEIGHTS[k] * data[k] for k in WEIGHTS)
        peak = max(peak, intensity)
        out.append({"start": b * bin_s, "end": (b + 1) * bin_s, "replays": data["replays"], "rewinds": data["rewinds"],
                    "pauses": data["pauses"], "questions": data["questions"], "students": len(data["students"]),
                    "intensity": round(intensity, 3)})

    # Context for the busiest moments: what was being said and shown there
    hot = sorted((x for x in out if x["intensity"] > 0), key=lambda x: x["intensity"], reverse=True)[:10]
    for item in hot:
        start, end = item["start"], item["end"]
        if transcript:
            item["transcript"] = " ".join(s.text for s in transcript.segments if s.end > start and s.start < end)[:400]
        shown = [f for f in frames if f.t <= end]
        if shown:
            item["frame_t"] = shown[-1].t
            item["frame_text"] = (shown[-1].caption or shown[-1].ocr_text)[:200]
            if frame_url:
                item["frame_url"] = frame_url(shown[-1].s3_key)
        chapter = next((c for c in chapters if c.start <= start < c.end), None)
        if chapter:
            item["chapter_title"] = chapter.title
    return {"lecture_id": str(doc.id), "bin_seconds": bin_s, "duration_sec": duration, "peak": peak,
            "bins": out, "hotspots": hot, "n_events": len(events)}


async def confidence_calibration(student_id: uuid.UUID, course_id: uuid.UUID) -> dict:
    """How well a student's confidence check-ins match their correctness, overall and over time."""
    attempts = await TestAttempt.find(
        TestAttempt.student_id == student_id, TestAttempt.course_id == course_id,
    ).sort(TestAttempt.submitted_at).to_list()
    points: List[dict] = []
    tests = {}
    for attempt in attempts:
        if attempt.status == "in_progress":
            continue
        if attempt.test_id not in tests:
            tests[attempt.test_id] = await Test.get(attempt.test_id)
        test = tests[attempt.test_id]
        for ans in attempt.answers:
            if ans.confidence is None or ans.is_correct is None:
                continue
            points.append({
                "at": (attempt.submitted_at or attempt.started_at).isoformat(),
                "test": test.title if test else "",
                "confidence": ans.confidence,
                "correct": bool(ans.is_correct),
            })
    levels = []
    for level in (1, 2, 3, 4):
        rows = [p for p in points if p["confidence"] == level]
        levels.append({
            "confidence": level, "expected": CONFIDENCE_PROB[level], "n": len(rows),
            "accuracy": round(sum(p["correct"] for p in rows) / len(rows), 3) if rows else None,
        })
    gap = (sum(CONFIDENCE_PROB[p["confidence"]] - p["correct"] for p in points) / len(points)) if points else None
    brier = (sum((CONFIDENCE_PROB[p["confidence"]] - p["correct"]) ** 2 for p in points) / len(points)) if points else None
    return {
        "n": len(points),
        "levels": levels,
        "overconfidence": round(gap, 3) if gap is not None else None,  # > 0: more confident than correct
        "brier": round(brier, 3) if brier is not None else None,
        "points": points,
    }
