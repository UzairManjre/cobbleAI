"""Gold question sets: one JSON object per line (see eval/gold/README.md)."""

import json
from pathlib import Path
from typing import Iterable, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

QType = Literal["factual", "conceptual", "procedural", "figure", "lecture"]


class GoldSource(BaseModel):
    """Where the answer is supported. Give doc_id or filename, plus a page/slide or a time range."""
    doc_id: Optional[str] = None
    filename: Optional[str] = None
    page: Optional[int] = None
    slide: Optional[int] = None
    t_start: Optional[float] = None
    t_end: Optional[float] = None

    @model_validator(mode="after")
    def _identifies_a_document(self):
        if not self.doc_id and not self.filename:
            raise ValueError("gold source needs doc_id or filename")
        return self


class GoldItem(BaseModel):
    qid: str
    course_id: str
    question: str
    qtype: QType = "factual"
    answerable: bool = True
    expected_answer: Optional[str] = None
    gold_sources: List[GoldSource] = Field(default_factory=list)
    split: Literal["dev", "test"] = "test"
    reviewed_by_instructor: bool = False
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _answerable_items_have_evidence(self):
        if self.answerable and not self.gold_sources:
            raise ValueError(f"{self.qid}: answerable items need at least one gold source")
        return self


def load_gold(paths: Iterable[str | Path], split: Optional[str] = None, qtypes: Optional[List[str]] = None) -> List[GoldItem]:
    items: List[GoldItem] = []
    seen = set()
    for path in paths:
        for line_no, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            try:
                item = GoldItem.model_validate(json.loads(line))
            except Exception as e:
                raise ValueError(f"{path}:{line_no}: {e}") from e
            if item.qid in seen:
                raise ValueError(f"{path}:{line_no}: duplicate qid {item.qid}")
            seen.add(item.qid)
            items.append(item)
    if split:
        items = [i for i in items if i.split == split]
    if qtypes:
        items = [i for i in items if i.qtype in qtypes]
    return items
