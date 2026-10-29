"""Slide-change keyframes from a lecture video, decoded with PyAV (bundled with faster-whisper).

Frames are sampled at FRAME_SAMPLE_FPS, compared on a small greyscale thumbnail,
and a frame is kept when enough pixels changed since the last kept one (a new slide,
a board write-up, a demo switch). Counting changed pixels, not the mean difference,
catches slides that share a template and differ only in their text.
"""

from dataclasses import dataclass
from io import BytesIO
from typing import List, Optional

from app.core.config import settings

THUMB_W, THUMB_H = 160, 90  # large enough that a changed title moves ~1% of pixels
PIXEL_DELTA = 24  # grey-level change (0-255) that counts as a changed pixel; above compression noise


@dataclass
class Keyframe:
    t: float
    jpeg: bytes
    width: int
    height: int


def probe(path: str) -> dict:
    """Duration and whether the file has a video stream."""
    import av
    with av.open(path) as container:
        has_video = any(s.type == "video" for s in container.streams)
        duration = float(container.duration / 1_000_000) if container.duration else None
    return {"has_video": has_video, "duration_sec": duration}


def _changed_fraction(a, b) -> float:
    import numpy as np
    return float(np.mean(np.abs(a.astype("int16") - b.astype("int16")) > PIXEL_DELTA))


def extract_keyframes(path: str, fps: Optional[float] = None, threshold: Optional[float] = None,
                      max_frames: Optional[int] = None) -> List[Keyframe]:
    import av
    fps = fps or settings.FRAME_SAMPLE_FPS
    threshold = settings.SLIDE_CHANGE_THRESHOLD if threshold is None else threshold
    max_frames = max_frames or settings.MAX_KEYFRAMES

    keyframes: List[Keyframe] = []
    with av.open(path) as container:
        streams = [s for s in container.streams if s.type == "video"]
        if not streams:
            return []
        stream = streams[0]
        stream.thread_type = "AUTO"
        next_sample = 0.0
        last_thumb = None
        for frame in container.decode(stream):
            if frame.time is None or frame.time < next_sample:
                continue
            next_sample = frame.time + 1.0 / fps
            thumb = frame.reformat(width=THUMB_W, height=THUMB_H, format="gray").to_ndarray()
            if last_thumb is not None and _changed_fraction(thumb, last_thumb) < threshold:
                continue
            last_thumb = thumb
            image = frame.to_image()
            image.thumbnail((1280, 720))
            buf = BytesIO()
            image.save(buf, format="JPEG", quality=80)
            keyframes.append(Keyframe(t=round(float(frame.time), 2), jpeg=buf.getvalue(), width=image.width, height=image.height))
            if len(keyframes) >= max_frames:
                break
    return keyframes
