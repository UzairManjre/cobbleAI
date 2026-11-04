"""Ask by voice: short spoken questions to text with a local Whisper model.

The recording is decoded and transcribed on this server, then deleted. Nothing goes to a cloud
speech service (the browser's own speech recognition would send it to Google). A small model stays
loaded in the API process, so a question transcribes in a second or two instead of paying the
model load each time.
"""

import os
import re
import tempfile
import threading
import time
from typing import List, Optional

from app.core.config import settings
from app.services.media.transcribe import SAMPLE_RATE, _register_cuda_libraries, decode_audio

MAX_SECONDS = 90  # a question, not a lecture
MAX_BYTES = 10 * 1024 * 1024
LANGUAGE_CODE = re.compile(r"^[a-z]{2}$")

_lock = threading.Lock()  # one transcription at a time per process: it is CPU/GPU bound
_model = None
_model_device: Optional[str] = None


def _device_attempts():
    device = settings.VOICE_ASR_DEVICE
    attempts = []
    if device in ("auto", "cuda"):
        attempts.append(("cuda", settings.WHISPER_COMPUTE_TYPE))
    if device in ("auto", "cpu"):
        attempts.append(("cpu", "int8"))
    return attempts


def _load_model(skip: Optional[str] = None):
    global _model, _model_device
    from faster_whisper import WhisperModel
    _register_cuda_libraries()
    last_error = None
    for dev, compute in _device_attempts():
        if dev == skip:
            continue
        try:
            _model = WhisperModel(settings.VOICE_ASR_MODEL, device=dev, compute_type=compute)
            _model_device = dev
            return _model
        except Exception as e:
            last_error = e
            print(f"  Voice model failed to load on {dev} ({compute}): {e}")
    raise RuntimeError(f"No device could load the voice model '{settings.VOICE_ASR_MODEL}': {last_error}")


def vocabulary_prompt(terms: List[str], max_chars: int = 600) -> str:
    """Course terms (concept names) that bias recognition: "Banker's algorithm", "dropna"."""
    picked, size = [], 0
    for term in terms:
        term = (term or "").strip()
        if not term or size + len(term) + 2 > max_chars:
            continue
        picked.append(term)
        size += len(term) + 2
    return ("Course terms: " + ", ".join(picked) + ".") if picked else ""


def _decode(data: bytes, suffix: str):
    fd, path = tempfile.mkstemp(suffix=suffix or ".webm")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        return decode_audio(path)
    finally:
        os.remove(path)  # the recording is never kept


def _run(model, audio, prompt: Optional[str], language: Optional[str]):
    segments, info = model.transcribe(
        audio,
        beam_size=5,
        vad_filter=True,  # trims silence before and after the question
        initial_prompt=prompt or None,
        language=language,
        condition_on_previous_text=False,
    )
    return " ".join((s.text or "").strip() for s in segments).strip(), getattr(info, "language", None)


def transcribe_question(data: bytes, suffix: str = ".webm", prompt: Optional[str] = None,
                        language: Optional[str] = None) -> dict:
    """Spoken question -> {text, language, duration_sec, seconds}. Raises ValueError for recordings
    that are empty or too long."""
    started = time.perf_counter()
    try:
        audio = _decode(data, suffix)
    except Exception as e:
        raise ValueError("Could not read the recording.") from e
    duration = audio.size / SAMPLE_RATE
    if duration < 0.3:
        raise ValueError("The recording is empty. Check that the right microphone is selected.")
    if duration > MAX_SECONDS:
        raise ValueError(f"Keep voice questions under {MAX_SECONDS} seconds.")
    language = language if language and LANGUAGE_CODE.match(language) else None

    global _model
    with _lock:
        model = _model or _load_model()
        try:
            text, detected = _run(model, audio, prompt, language)
        except Exception as e:
            # CUDA problems can show up only on the first decode: fall back to the CPU once
            if _model_device != "cuda" or "cpu" not in {d for d, _ in _device_attempts()}:
                raise
            print(f"  Voice transcription failed on cuda ({e}); using the CPU")
            _model = None
            text, detected = _run(_load_model(skip="cuda"), audio, prompt, language)
    return {
        "text": text,
        "language": detected,
        "duration_sec": round(duration, 1),
        "seconds": round(time.perf_counter() - started, 2),
    }
