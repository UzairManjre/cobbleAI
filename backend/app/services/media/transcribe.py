"""Local speech-to-text with faster-whisper (no audio leaves the machine)."""

import gc
import time
from dataclasses import dataclass, field
from typing import List, Optional

from app.core.config import settings


@dataclass
class TranscriptResult:
    segments: List[dict] = field(default_factory=list)  # {id, start, end, text, avg_logprob, no_speech_prob}
    language: Optional[str] = None
    duration_sec: float = 0.0
    model: str = ""
    real_time_factor: Optional[float] = None


def _register_cuda_libraries():
    """On Windows, make cuBLAS/cuDNN from the `nvidia-*-cu12` pip wheels loadable by CTranslate2.
    The wheels put their DLLs in site-packages/nvidia/<lib>/bin, which is not on the DLL search path."""
    import os
    import sys
    if sys.platform != "win32":
        return
    import site
    roots = list(site.getsitepackages()) + [site.getusersitepackages()]
    for root in roots:
        for lib in ("cublas", "cudnn", "cuda_nvrtc", "cuda_runtime"):
            bin_dir = os.path.join(root, "nvidia", lib, "bin")
            if os.path.isdir(bin_dir) and bin_dir not in os.environ.get("PATH", ""):
                os.add_dll_directory(bin_dir)
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


def _device_attempts():
    device = settings.WHISPER_DEVICE
    attempts = []
    if device in ("auto", "cuda"):
        attempts.append(("cuda", settings.WHISPER_COMPUTE_TYPE))
    if device in ("auto", "cpu"):
        attempts.append(("cpu", "int8"))
    return attempts


def _free_gpu_memory():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


SAMPLE_RATE = 16000  # what Whisper expects


def decode_audio(path: str):
    """Decode the first audio stream to 16 kHz mono float32 with PyAV. faster-whisper's own decoder
    passes `metadata_errors` to av.open, which PyAV 14+ no longer accepts."""
    import av
    import numpy as np
    chunks = []
    with av.open(path, mode="r") as container:
        if not container.streams.audio:
            return np.zeros(0, dtype=np.float32)
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def transcribe(path: str, initial_prompt: Optional[str] = None, language: Optional[str] = None) -> TranscriptResult:
    """Transcribe an audio/video file. The model is released afterwards because the GPU
    is shared with the local LLM."""
    started = time.perf_counter()
    audio = decode_audio(path)
    if audio.size == 0:  # e.g. a screen recording without sound: frames and OCR still run
        return TranscriptResult(model=f"faster-whisper {settings.WHISPER_MODEL} (no audio stream)")
    from faster_whisper import WhisperModel
    _register_cuda_libraries()
    last_error = None
    # CUDA problems (missing cuBLAS/cuDNN) can surface at load time or only on the first decode, so the
    # whole transcription is retried on the next device.
    for dev, compute in _device_attempts():
        model = None
        try:
            model = WhisperModel(settings.WHISPER_MODEL, device=dev, compute_type=compute)
            segments, info = _run(model, audio, initial_prompt, language)
        except Exception as e:
            last_error = e
            print(f"  faster-whisper failed on {dev} ({compute}): {e}")
            continue
        finally:
            model = None  # the GPU is shared with the local LLM: release Whisper after every job
            _free_gpu_memory()
        duration = float(getattr(info, "duration", 0.0) or (segments[-1]["end"] if segments else 0.0))
        elapsed = time.perf_counter() - started
        return TranscriptResult(
            segments=segments,
            language=getattr(info, "language", None),
            duration_sec=duration,
            model=f"faster-whisper {settings.WHISPER_MODEL} ({dev}/{compute})",
            real_time_factor=round(elapsed / duration, 3) if duration else None,
        )
    raise RuntimeError(f"faster-whisper model '{settings.WHISPER_MODEL}' failed on every device: {last_error}")


def _run(model, audio, initial_prompt, language):
    segments_iter, info = model.transcribe(
        audio,
        beam_size=5,
        vad_filter=True,  # skip silence; reduces hallucinated text in pauses
        initial_prompt=initial_prompt or None,
        language=language,
        condition_on_previous_text=False,  # limits run-on hallucinations in long recordings
    )
    segments = []
    for i, seg in enumerate(segments_iter):  # decoding happens lazily, here
        text = (seg.text or "").strip()
        if not text:
            continue
        segments.append({
            "id": i,
            "start": round(float(seg.start), 2),
            "end": round(float(seg.end), 2),
            "text": text,
            "avg_logprob": round(float(seg.avg_logprob), 4) if seg.avg_logprob is not None else None,
            "no_speech_prob": round(float(seg.no_speech_prob), 4) if seg.no_speech_prob is not None else None,
        })
    return segments, info


def course_vocabulary_prompt(texts: List[str], max_terms: int = 60) -> str:
    """Bias recognition toward course terms: the most distinctive words from the slides and notes.
    Whisper's prompt window is ~224 tokens, so keep it short."""
    import re
    from collections import Counter
    from app.services.retrieval.sparse import STOPWORDS
    counts = Counter()
    for text in texts:
        for word in re.findall(r"[A-Za-z][A-Za-z0-9\-+#]{3,}", text or ""):
            if word.lower() not in STOPWORDS:
                counts[word] += 1
    # Prefer capitalised / technical terms that recur, then frequency
    ranked = sorted(counts.items(), key=lambda kv: (-(kv[0][0].isupper() or "-" in kv[0]), -kv[1]))
    terms = [w for w, c in ranked if c >= 2][:max_terms]
    return ("Lecture vocabulary: " + ", ".join(terms) + ".") if terms else ""
