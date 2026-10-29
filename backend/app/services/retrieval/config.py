"""Retrieval configuration and named presets.

Every knob the evaluation harness ablates lives here, and each run logs the
config and its hash, so a reported number can be traced to the exact settings.
"""

import hashlib
import json
from typing import List, Optional

from pydantic import BaseModel, Field


class RetrievalConfig(BaseModel):
    name: str = "hybrid"
    query_expansion: bool = True  # LLM rewrites the question into up to 3 extra queries
    max_expansions: int = 3
    k_dense: int = 20  # candidates per query from the dense vector
    k_bm25: int = 20  # candidates per query from BM25 (0 disables BM25)
    k_chapters: int = 3  # section/chapter summaries used for the chapter prior
    w_dense: float = 0.5
    w_bm25: float = 0.35
    w_chapter: float = 0.15
    normalize: bool = True  # min-max normalise each signal over the candidate pool before fusing
    rerank: bool = True
    rerank_pool: int = 30  # top hybrid candidates passed to the cross-encoder
    # final = alpha * hybrid + (1 - alpha) * rerank. v1 used 0.2 * cosine + 0.8 * raw logit.
    alpha_hybrid_vs_rerank: float = 0.2
    top_k: int = 5
    # Cite-or-decline: decline when the best reranked support is below this (0-1, sigmoid of logit)
    decline_min_support: float = 0.15
    source_types: Optional[List[str]] = None  # restrict evidence (e.g. ["slide","pdf_page"] = slides-only)
    media_types: Optional[List[str]] = None  # restrict to "document" or "lecture"
    doc_ids: Optional[List[str]] = None  # scope to specific documents/lectures
    legacy_v1_scoring: bool = False  # exact v1 behaviour: raw cosine * 0.2 + raw logit * 0.8, dense only

    def config_hash(self) -> str:
        # Scope filters are per-question, not part of the method being compared
        method = self.model_dump(exclude={"doc_ids"})
        return hashlib.sha1(json.dumps(method, sort_keys=True).encode()).hexdigest()[:12]

    def with_scope(self, doc_ids: Optional[List[str]] = None, media_types: Optional[List[str]] = None) -> "RetrievalConfig":
        update = {}
        if doc_ids:
            update["doc_ids"] = doc_ids
        if media_types:
            update["media_types"] = media_types
        return self.model_copy(update=update)


PRESETS = {
    # Reproduces the v1 pipeline exactly (the S1 baseline)
    "v1": RetrievalConfig(
        name="v1", k_bm25=0, k_chapters=0, w_dense=1.0, w_bm25=0.0, w_chapter=0.0,
        normalize=False, rerank_pool=40, k_dense=10, legacy_v1_scoring=True,
        decline_min_support=0.0,
    ),
    "dense": RetrievalConfig(name="dense", k_bm25=0, k_chapters=0, w_dense=1.0, w_bm25=0.0, w_chapter=0.0),
    "dense_bm25": RetrievalConfig(name="dense_bm25", k_chapters=0, w_dense=0.6, w_bm25=0.4, w_chapter=0.0),
    "hybrid": RetrievalConfig(name="hybrid"),
    "no_rerank": RetrievalConfig(name="no_rerank", rerank=False),
    "no_expansion": RetrievalConfig(name="no_expansion", query_expansion=False),
}


def get_preset(name: str) -> RetrievalConfig:
    if name not in PRESETS:
        raise ValueError(f"Unknown retrieval preset '{name}'. Known: {', '.join(PRESETS)}")
    return PRESETS[name].model_copy(deep=True)


def default_config() -> RetrievalConfig:
    from app.core.config import settings
    return get_preset(settings.RETRIEVAL_PRESET if settings.HYBRID_RETRIEVAL else "v1")
