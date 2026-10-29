"""Captions (WebVTT) and plain transcripts, with instructor-excluded ranges removed."""

from typing import Iterable, List


def is_excluded(start: float, end: float, ranges: Iterable) -> bool:
    """A segment is masked when its midpoint falls inside an excluded range."""
    mid = (start + end) / 2
    for r in ranges or []:
        r_start = r["start"] if isinstance(r, dict) else r.start
        r_end = r["end"] if isinstance(r, dict) else r.end
        if r_start <= mid <= r_end:
            return True
    return False


def visible_segments(segments: List[dict], ranges) -> List[dict]:
    return [s for s in segments if not is_excluded(s["start"], s["end"], ranges)]


def vtt_timestamp(seconds: float) -> str:
    ms = int(round(max(seconds, 0) * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def to_vtt(segments: List[dict], ranges=None) -> str:
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(visible_segments(segments, ranges), start=1):
        text = seg["text"].replace("-->", "->").strip()
        lines += [str(i), f"{vtt_timestamp(seg['start'])} --> {vtt_timestamp(seg['end'])}", text, ""]
    return "\n".join(lines)


def to_text(segments: List[dict], ranges=None, title: str = "") -> str:
    from app.services.retrieval.hybrid import format_timestamp
    lines = [title, ""] if title else []
    for seg in visible_segments(segments, ranges):
        lines.append(f"[{format_timestamp(seg['start'])}] {seg['text']}")
    return "\n".join(lines) + "\n"
