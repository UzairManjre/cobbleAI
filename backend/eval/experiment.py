"""Experiment configuration (YAML) and its expansion into concrete runs."""

import hashlib
import itertools
import json
from pathlib import Path
from typing import Dict, List, Optional

import yaml
from pydantic import BaseModel, Field

from app.services.retrieval.config import RetrievalConfig, get_preset


class RetrievalSpec(BaseModel):
    preset: str = "hybrid"
    overrides: Dict = Field(default_factory=dict)

    def resolve(self, extra: Optional[Dict] = None) -> RetrievalConfig:
        return get_preset(self.preset).model_copy(update={**self.overrides, **(extra or {})})


class GenerationSpec(BaseModel):
    enabled: bool = True
    rag: bool = True  # False = no-retrieval baseline (the LLM answers from its own knowledge)
    mode: str = "teach"
    hint_level: str = "full_answer"  # full answers are needed to judge faithfulness and correctness


class JudgeSpec(BaseModel):
    enabled: bool = True
    metrics: List[str] = Field(default_factory=lambda: ["faithfulness", "context_precision", "answer_relevancy", "correctness"])
    base_url: Optional[str] = None
    model: Optional[str] = None


class ExperimentConfig(BaseModel):
    name: str
    study: str = "S1"
    description: str = ""
    gold: List[str]
    split: Optional[str] = "test"
    qtypes: Optional[List[str]] = None
    limit: Optional[int] = None
    retrieval: RetrievalSpec = Field(default_factory=RetrievalSpec)
    generation: GenerationSpec = Field(default_factory=GenerationSpec)
    judge: JudgeSpec = Field(default_factory=JudgeSpec)
    # Optional grid over retrieval fields, e.g. {"w_bm25": [0, 0.2, 0.4]}; one run per combination
    sweep: Dict[str, List] = Field(default_factory=dict)
    seed: int = 13

    @classmethod
    def load(cls, path: str | Path) -> "ExperimentConfig":
        return cls.model_validate(yaml.safe_load(Path(path).read_text(encoding="utf-8")))

    def variants(self) -> List[tuple[str, RetrievalConfig]]:
        """(variant name, resolved retrieval config) for every sweep combination."""
        if not self.sweep:
            return [(self.name, self.retrieval.resolve())]
        keys = sorted(self.sweep)
        out = []
        for values in itertools.product(*(self.sweep[k] for k in keys)):
            extra = dict(zip(keys, values))
            suffix = "_".join(f"{k}={v}" for k, v in extra.items())
            out.append((f"{self.name}__{suffix}", self.retrieval.resolve(extra)))
        return out

    def run_hash(self, retrieval: RetrievalConfig) -> str:
        blob = json.dumps({
            "experiment": self.model_dump(exclude={"name", "description"}),
            "retrieval": retrieval.model_dump(),
        }, sort_keys=True, default=str)
        return hashlib.sha1(blob.encode()).hexdigest()[:10]
