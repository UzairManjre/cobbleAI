"""Retrieval metrics against gold sources (page/slide or timestamp level)."""

import math
from typing import List, Optional

from eval.gold import GoldSource

TIMESTAMP_TOLERANCE_S = 30.0  # RQ4: a timestamp "hit" lands within 30 s of the gold range


def _same_document(source: dict, gold: GoldSource) -> bool:
    if gold.doc_id and source.get("doc_id") == gold.doc_id:
        return True
    if gold.filename and (source.get("filename") or "").lower() == gold.filename.lower():
        return True
    return False


def _in_span(value: Optional[int], start: Optional[int], end: Optional[int]) -> bool:
    if value is None or start is None:
        return False
    return start <= value <= (end if end is not None else start)


def timestamp_hit(source: dict, gold: GoldSource, tolerance: float = TIMESTAMP_TOLERANCE_S) -> bool:
    """Retrieved time range overlaps the gold range, widened by `tolerance` seconds each side."""
    if gold.t_start is None or source.get("t_start") is None:
        return False
    g_start, g_end = gold.t_start - tolerance, (gold.t_end if gold.t_end is not None else gold.t_start) + tolerance
    s_start = source["t_start"]
    s_end = source.get("t_end", s_start)
    return s_start <= g_end and s_end >= g_start


def source_matches(source: dict, gold: GoldSource, tolerance: float = TIMESTAMP_TOLERANCE_S) -> bool:
    """Same document, and the same location when the gold source gives one."""
    if not _same_document(source, gold):
        return False
    if gold.page is not None:
        return _in_span(gold.page, source.get("page_start"), source.get("page_end"))
    if gold.slide is not None:
        return _in_span(gold.slide, source.get("slide_start"), source.get("slide_end"))
    if gold.t_start is not None:
        return timestamp_hit(source, gold, tolerance)
    return True  # document-level gold


def relevance_vector(sources: List[dict], gold: List[GoldSource], tolerance: float = TIMESTAMP_TOLERANCE_S) -> List[int]:
    return [1 if any(source_matches(s, g, tolerance) for g in gold) else 0 for s in sources]


def recall_at_k(sources: List[dict], gold: List[GoldSource], k: int = 5) -> float:
    """Fraction of gold sources found in the top k (1.0 when every gold location was retrieved)."""
    if not gold:
        return 0.0
    top = sources[:k]
    return sum(1 for g in gold if any(source_matches(s, g) for s in top)) / len(gold)


def hit_at_k(sources: List[dict], gold: List[GoldSource], k: int = 5) -> float:
    return 1.0 if any(relevance_vector(sources[:k], gold)) else 0.0


def reciprocal_rank(sources: List[dict], gold: List[GoldSource]) -> float:
    for rank, rel in enumerate(relevance_vector(sources, gold), start=1):
        if rel:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(sources: List[dict], gold: List[GoldSource], k: int = 5) -> float:
    rels = relevance_vector(sources[:k], gold)
    dcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(rels))
    ideal = sorted(rels, reverse=True)
    # The ideal ranking can contain at most one relevant hit per gold source
    n_ideal = min(len(gold), k)
    idcg = sum(1 / math.log2(i + 2) for i in range(n_ideal))
    return dcg / idcg if idcg else 0.0


def video_hit(sources: List[dict], gold: List[GoldSource], k: int = 5) -> float:
    """Right lecture recording in the top k, regardless of timestamp."""
    lecture_gold = [g for g in gold if g.t_start is not None]
    if not lecture_gold:
        return 0.0
    return 1.0 if any(_same_document(s, g) for s in sources[:k] for g in lecture_gold) else 0.0


def timestamp_hit_at_k(sources: List[dict], gold: List[GoldSource], k: int = 5, tolerance: float = TIMESTAMP_TOLERANCE_S) -> float:
    lecture_gold = [g for g in gold if g.t_start is not None]
    if not lecture_gold:
        return 0.0
    return 1.0 if any(_same_document(s, g) and timestamp_hit(s, g, tolerance) for s in sources[:k] for g in lecture_gold) else 0.0


def retrieval_metrics(sources: List[dict], gold: List[GoldSource], k: int = 5) -> dict:
    metrics = {
        f"recall@{k}": recall_at_k(sources, gold, k),
        f"hit@{k}": hit_at_k(sources, gold, k),
        "mrr": reciprocal_rank(sources, gold),
        f"ndcg@{k}": ndcg_at_k(sources, gold, k),
    }
    if any(g.t_start is not None for g in gold):
        metrics["video_hit"] = video_hit(sources, gold, k)
        metrics["timestamp_hit@30s"] = timestamp_hit_at_k(sources, gold, k)
    return metrics
