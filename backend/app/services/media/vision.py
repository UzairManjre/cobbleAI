"""Read slide frames: OCR (easyocr) and optional captions from a local vision model via Ollama."""

import base64
from functools import lru_cache
from io import BytesIO
from typing import Optional

import httpx

from app.core.config import settings

CAPTION_PROMPT = (
    "This is a frame from a university lecture recording. Describe any diagram, chart, table or "
    "equation on it in two or three sentences, using the labels shown. If it is only text, say "
    "what the slide is about in one sentence."
)


@lru_cache(maxsize=1)
def _ocr_reader():
    import easyocr
    try:
        import torch
        gpu = torch.cuda.is_available()
    except Exception:
        gpu = False
    return easyocr.Reader(["en"], gpu=gpu, verbose=False)


def ocr_image(jpeg: bytes) -> str:
    if settings.OCR_ENGINE != "easyocr":
        return ""
    try:
        import numpy as np
        from PIL import Image
        image = np.array(Image.open(BytesIO(jpeg)).convert("RGB"))
        lines = _ocr_reader().readtext(image, detail=0, paragraph=True)
        return "\n".join(l.strip() for l in lines if l and l.strip())
    except ImportError:
        print("  easyocr is not installed; skipping frame OCR")
        return ""
    except Exception as e:
        print(f"  OCR failed on a frame: {e}")
        return ""


async def caption_image(jpeg: bytes, ocr_text: str = "") -> str:
    """Caption with a vision-capable Ollama model. Returns "" when captioning is off or unavailable."""
    if not settings.FRAME_CAPTIONING:
        return ""
    model = settings.CAPTION_MODEL or settings.LLM_MODEL
    prompt = CAPTION_PROMPT + (f"\nText read from the slide: {ocr_text[:800]}" if ocr_text else "")
    payload = {
        "model": model,
        "stream": False,
        "think": False,  # thinking models otherwise spend the whole num_predict budget thinking and return ""
        "messages": [{"role": "user", "content": prompt, "images": [base64.b64encode(jpeg).decode()]}],
        "options": {"temperature": 0.1, "num_predict": 160},
    }
    base = settings.LLM_BASE_URL.rstrip("/").removesuffix("/v1")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(f"{base}/api/chat", json=payload)
            if res.status_code != 200:
                print(f"  Captioning unavailable ({model}): HTTP {res.status_code}")
                return ""
            text = (res.json().get("message") or {}).get("content", "")
            from app.utils.llm_text import split_thinking
            return split_thinking(text)[0][:600]
    except Exception as e:
        print(f"  Captioning failed: {e}")
        return ""
