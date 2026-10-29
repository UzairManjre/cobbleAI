"""Draft candidate gold questions from a course's indexed chunks — for HUMAN review only.

Drafts are written with split "dev" and reviewed_by_instructor=false. They must be
checked (and corrected) by a person before use, and the frozen test split should
be written or approved by the instructor, not generated.
"""

import json
import random
from pathlib import Path

from app.core import qdrant as qdrant_core
from app.services.llm import LLMAdapter
from eval.judge import extract_json

PROMPT = """Write one exam-style question that is answered by the passage below, plus a short reference answer.
The question must be answerable from the passage alone. Return JSON:
{{"question": "...", "expected_answer": "...", "qtype": "factual"|"conceptual"|"procedural"}}

Passage ({where}):
{text}
"""


async def draft_gold(course_id: str, n: int, out: Path, seed: int = 13) -> None:
    collection = qdrant_core.collection_name(course_id)
    points, offset = [], None
    while True:
        batch, offset = qdrant_core.qdrant_sync.scroll(collection, limit=256, offset=offset, with_payload=True)
        points += [p for p in batch if (p.payload or {}).get("source_type") != "chapter_summary"]
        if offset is None:
            break
    if not points:
        raise SystemExit(f"{collection} has no indexed chunks")
    random.Random(seed).shuffle(points)

    from app.services.retrieval.hybrid import location_label
    llm = LLMAdapter()
    out.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with out.open("w", encoding="utf-8") as f:
        for point in points:
            if written >= n:
                break
            p = point.payload
            if len(p.get("text", "").split()) < 30:
                continue
            try:
                data = extract_json(await llm.generate_full_response(
                    system="Return only valid JSON.",
                    messages=[{"role": "user", "content": PROMPT.format(where=location_label(p), text=p["text"][:3000])}],
                    max_tokens=600, think=False,
                ))
            except Exception as e:
                print(f"  skipped a chunk: {e}")
                continue
            source = {"doc_id": p["doc_id"], "filename": p.get("filename")}
            if p.get("t_start") is not None:
                source.update(t_start=p["t_start"], t_end=p.get("t_end"))
            elif p.get("slide_start") is not None:
                source["slide"] = p["slide_start"]
            elif p.get("page_start") is not None:
                source["page"] = p["page_start"]
            written += 1
            f.write(json.dumps({
                "qid": f"draft-{course_id[:8]}-{written:03d}", "course_id": course_id,
                "question": data.get("question", ""), "expected_answer": data.get("expected_answer", ""),
                "qtype": data.get("qtype", "factual") if data.get("qtype") in ("factual", "conceptual", "procedural") else "factual",
                "answerable": True, "gold_sources": [source], "split": "dev", "reviewed_by_instructor": False,
                "notes": "LLM draft — review before use",
            }) + "\n")
    print(f"wrote {written} drafts to {out} (review every item before use)")
