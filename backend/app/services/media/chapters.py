"""Split a lecture into chapters with short summaries and timestamped notes.

The local LLM proposes chapters from a time-stamped transcript; if it fails or
returns something unusable, a deterministic fallback cuts ~5-minute windows
snapped to nearby slide changes. Chapter summaries also feed the retrieval
chapter prior, so every lecture always gets chapters.
"""

import json
import re
from typing import List, Optional

from app.services.llm import LLMAdapter
from app.utils.llm_text import split_thinking

CHAPTER_PROMPT = """Below is a lecture transcript. Each line starts with its start time in seconds.
Split the lecture into between {min_chapters} and {max_chapters} chapters at natural topic changes.
For each chapter give: "start" (seconds; use one of the line times), a short "title", a 2-3 sentence
"summary", and 2-4 "notes" (key points), each with the time "t" in seconds where it is said.
Use only what is said in the transcript.
Return ONLY a JSON list: [{{"start": 0, "title": "...", "summary": "...", "notes": [{{"t": 12.5, "text": "..."}}]}}]

Transcript:
{lines}
"""

FALLBACK_WINDOW_S = 300.0
SNAP_S = 60.0
NOTE_MATCH_MIN = 70  # rapidfuzz partial_ratio a transcript line needs before a note's time is moved to it


def transcript_lines(segments: List[dict], line_seconds: float = 20.0, max_chars: int = 60_000) -> str:
    lines, buf, start = [], [], None
    for seg in segments:
        if start is None:
            start = seg["start"]
        buf.append(seg["text"])
        if seg["end"] - start >= line_seconds:
            lines.append(f"[{start:.0f}] {' '.join(buf)}")
            buf, start = [], None
    if buf:
        lines.append(f"[{start:.0f}] {' '.join(buf)}")
    text = "\n".join(lines)
    if len(text) > max_chars:
        # Keep the shape of a long lecture: trim each line rather than dropping the end
        per_line = max(40, max_chars // max(len(lines), 1))
        text = "\n".join(l[:per_line] for l in lines)
    return text


def _sentences(text: str) -> List[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]


def snap_note_time(text: str, t: float, start: float, end: float, segments: List[dict]) -> float:
    """The LLM only sees 20-second transcript lines, so its note times are coarse. Move a note to the
    start of the transcript segment in its chapter that best matches the note text."""
    from rapidfuzz import fuzz
    best, best_score = t, NOTE_MATCH_MIN
    for seg in segments:
        if start <= seg["start"] < end:
            score = fuzz.partial_ratio(text.lower(), seg["text"].lower())
            if score > best_score:
                best, best_score = seg["start"], score
    return best


def finalize_chapters(raw: List[dict], duration: float, generated_by: str,
                      segments: Optional[List[dict]] = None) -> List[dict]:
    """Sort, de-duplicate and close chapter ranges so they tile [0, duration]."""
    items = []
    for c in raw:
        try:
            start = max(0.0, min(float(c.get("start", 0)), duration))
        except (TypeError, ValueError):
            continue
        title = str(c.get("title") or "").strip()[:120]
        if not title:
            continue
        items.append({"start": start, "title": title, "summary": str(c.get("summary") or "").strip()[:800],
                      "notes": c.get("notes") or []})
    items.sort(key=lambda c: c["start"])
    deduped = []
    for c in items:
        if deduped and c["start"] - deduped[-1]["start"] < 20:
            continue
        deduped.append(c)
    if not deduped:
        return []
    deduped[0]["start"] = 0.0
    chapters = []
    for i, c in enumerate(deduped):
        end = deduped[i + 1]["start"] if i + 1 < len(deduped) else duration
        notes = []
        for n in c["notes"][:6]:
            try:
                t = float(n.get("t", c["start"]))
                text = str(n.get("text", "")).strip()
            except (AttributeError, TypeError, ValueError):
                continue
            if text:
                t = min(max(t, c["start"]), end)
                if segments:
                    t = snap_note_time(text, t, c["start"], end, segments)
                notes.append({"t": round(t, 2), "text": text[:300]})
        chapters.append({"index": i, "start": round(c["start"], 2), "end": round(end, 2), "title": c["title"],
                         "summary": c["summary"], "notes": notes, "generated_by": generated_by})
    return chapters


def fallback_chapters(segments: List[dict], duration: float, slide_times: Optional[List[float]] = None) -> List[dict]:
    slide_times = sorted(slide_times or [])
    boundaries = [0.0]
    t = FALLBACK_WINDOW_S
    while t < duration - FALLBACK_WINDOW_S / 3:
        nearby = [s for s in slide_times if abs(s - t) <= SNAP_S]
        boundaries.append(min(nearby, key=lambda s: abs(s - t)) if nearby else t)
        t += FALLBACK_WINDOW_S
    raw = []
    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else duration
        segs = [s for s in segments if start <= s["start"] < end]
        text = " ".join(s["text"] for s in segs)
        sentences = _sentences(text)
        first_words = " ".join(text.split()[:8])
        notes, next_note = [], start
        for s in segs:
            if s["start"] >= next_note:
                notes.append({"t": s["start"], "text": _sentences(s["text"])[0] if _sentences(s["text"]) else s["text"]})
                next_note = s["start"] + 60
        raw.append({
            "start": start,
            "title": (first_words + "…") if first_words else f"Part {i + 1}",
            "summary": " ".join(sentences[:2])[:400],
            "notes": notes[:4],
        })
    return finalize_chapters(raw, duration, "fallback")


async def generate_chapters(segments: List[dict], duration: float, slide_times: Optional[List[float]] = None) -> List[dict]:
    if not segments:
        return []
    minutes = duration / 60 if duration else 0
    min_c, max_c = max(1, int(minutes // 15) or 1), max(2, min(12, int(minutes // 4) or 2))
    try:
        response = await LLMAdapter().generate_full_response(
            system="Return only valid JSON.",
            messages=[{"role": "user", "content": CHAPTER_PROMPT.format(
                min_chapters=min_c, max_chapters=max_c, lines=transcript_lines(segments))}],
            max_tokens=4096,
        )
        text = split_thinking(response)[0]
        data = json.loads(text[text.find("["): text.rfind("]") + 1])
        chapters = finalize_chapters(data if isinstance(data, list) else [], duration, "llm", segments)
        if chapters:
            return chapters
        print("  Chaptering returned no usable chapters; using fallback")
    except Exception as e:
        print(f"  Chaptering failed ({e}); using fallback")
    return fallback_chapters(segments, duration, slide_times)
