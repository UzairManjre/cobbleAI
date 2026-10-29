"""Speech-to-text word error rate on a hand-corrected sample (RQ4 / S6)."""

import re


def normalize_transcript(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"\[[^\]]*\]", " ", text)  # [inaudible], [music]
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def word_error_rate(reference: str, hypothesis: str) -> dict:
    import jiwer
    ref, hyp = normalize_transcript(reference), normalize_transcript(hypothesis)
    if not ref:
        raise ValueError("reference transcript is empty")
    out = jiwer.process_words(ref, hyp)
    return {
        "wer": out.wer,
        "substitutions": out.substitutions,
        "deletions": out.deletions,
        "insertions": out.insertions,
        "reference_words": len(ref.split()),
    }
