"""Hybrid evidence retrieval: dense + BM25 + chapter prior, then cross-encoder rerank.

Pipeline (each stage is switchable through RetrievalConfig for ablations):
  1. optional LLM query expansion
  2. dense and BM25 candidates for every query, in one Qdrant batch request
  3. chapter prior: similarity of the query to the summary of each candidate's
     chapter (lecture chapter or document section)
  4. per-signal min-max normalisation and weighted fusion
  5. cross-encoder rerank of the best candidates; logits -> [0,1] support via sigmoid
  6. final = alpha * hybrid + (1 - alpha) * support

`support` of the top chunk is an absolute relevance estimate, which the tutor's
cite-or-decline gate compares against `decline_min_support`.
"""

import asyncio
import json
import math
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from qdrant_client import models

from app.core import qdrant as qdrant_core
from app.services.embeddings import embedder
from app.services.retrieval.config import RetrievalConfig, default_config
from app.services.retrieval.sparse import encode_query

EXPANSION_PROMPT = """You are an AI specialized in Retrieval Augmented Generation (RAG).
Given a user's query, generate 3 search queries that cover different aspects of the request.
These queries will be used to search a vector database.
Keep them short, distinct, and focused on core concepts.
Return ONLY a JSON list of 3 strings.

Query: {query}
"""


@dataclass
class RetrievedChunk:
    point_id: str
    text: str
    payload: dict
    dense: float = 0.0  # best raw cosine over all queries
    bm25: float = 0.0  # best raw BM25 over all queries
    chapter: float = 0.0  # raw cosine between the query and this chunk's chapter summary
    hybrid: float = 0.0
    rerank_logit: Optional[float] = None
    support: float = 0.0  # absolute relevance in [0, 1]
    score: float = 0.0  # final fused score used for ranking
    rank: int = 0

    def signals(self) -> dict:
        return {
            "dense": round(self.dense, 4),
            "bm25": round(self.bm25, 4),
            "chapter": round(self.chapter, 4),
            "hybrid": round(self.hybrid, 4),
            "rerank_logit": None if self.rerank_logit is None else round(self.rerank_logit, 4),
            "support": round(self.support, 4),
            "score": round(self.score, 4),
        }


@dataclass
class RetrievalResult:
    query: str
    chunks: List[RetrievedChunk]
    config: RetrievalConfig
    expanded_queries: List[str] = field(default_factory=list)
    collection: Optional[str] = None
    candidates_considered: int = 0
    timings_ms: Dict[str, int] = field(default_factory=dict)
    error: Optional[str] = None

    @property
    def config_hash(self) -> str:
        return self.config.config_hash()

    @property
    def top_support(self) -> float:
        return max((c.support for c in self.chunks), default=0.0)


def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)


def _minmax(values: List[float]) -> List[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [1.0 if hi > 0 else 0.0 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def _scope_filter(config: RetrievalConfig, summaries: bool) -> models.Filter:
    must = []
    must_not = []
    if summaries:
        must.append(models.FieldCondition(key="source_type", match=models.MatchValue(value="chapter_summary")))
    else:
        must_not.append(models.FieldCondition(key="source_type", match=models.MatchValue(value="chapter_summary")))
        if config.source_types:
            must.append(models.FieldCondition(key="source_type", match=models.MatchAny(any=list(config.source_types))))
    if config.media_types:
        must.append(models.FieldCondition(key="media_type", match=models.MatchAny(any=list(config.media_types))))
    if config.doc_ids:
        must.append(models.FieldCondition(key="doc_id", match=models.MatchAny(any=list(config.doc_ids))))
    return models.Filter(must=must or None, must_not=must_not or None)


async def expand_query(query: str, max_expansions: int = 3) -> List[str]:
    from app.services.llm import LLMAdapter
    try:
        response = await LLMAdapter().generate_full_response(
            system=EXPANSION_PROMPT.format(query=query),
            messages=[{"role": "user", "content": "Generate queries."}],
            max_tokens=1024, think=False,
        )
        if "</thought>" in response:
            response = response.split("</thought>")[-1]
        if "[" in response and "]" in response:
            parsed = json.loads(response[response.find("["):response.rfind("]") + 1])
            if isinstance(parsed, list):
                return [str(q) for q in parsed if str(q).strip()][:max_expansions]
    except Exception as e:
        print(f"  Query expansion skipped: {e}")
    return []


async def _resolve_collection(course_id: str):
    client = qdrant_core.qdrant_async
    v2 = qdrant_core.collection_name(course_id)
    if await client.collection_exists(v2):
        return v2, True
    legacy = qdrant_core.legacy_collection_name(course_id)
    if await client.collection_exists(legacy):
        return legacy, False
    return None, False


async def retrieve(query: str, course_id: str, config: Optional[RetrievalConfig] = None) -> RetrievalResult:
    config = config or default_config()
    timings: Dict[str, int] = {}
    t0 = time.perf_counter()
    result = RetrievalResult(query=query, chunks=[], config=config)

    collection, is_v2 = await _resolve_collection(course_id)
    result.collection = collection
    if not collection:
        return result

    # 1. Query expansion
    queries = [query]
    if config.query_expansion:
        t = time.perf_counter()
        result.expanded_queries = await expand_query(query, config.max_expansions)
        queries.extend(result.expanded_queries)
        timings["expansion"] = int((time.perf_counter() - t) * 1000)

    # 2. Encode
    t = time.perf_counter()
    loop = asyncio.get_running_loop()
    dense_vectors = await loop.run_in_executor(None, lambda: [list(map(float, v)) for v in embedder.encode(queries)])
    timings["embedding"] = int((time.perf_counter() - t) * 1000)

    use_bm25 = is_v2 and config.k_bm25 > 0 and not config.legacy_v1_scoring
    use_chapters = is_v2 and config.k_chapters > 0 and config.w_chapter > 0 and not config.legacy_v1_scoring
    content_filter = _scope_filter(config, summaries=False) if is_v2 else None
    using = qdrant_core.DENSE_VECTOR if is_v2 else None

    requests = []
    plan = []  # what each request in the batch is for
    for vec in dense_vectors:
        requests.append(models.QueryRequest(query=vec, using=using, limit=config.k_dense,
                                            filter=content_filter, with_payload=True))
        plan.append("dense")
    if use_bm25:
        for q in queries:
            sparse = encode_query(q)
            if sparse.indices:
                requests.append(models.QueryRequest(query=sparse, using=qdrant_core.SPARSE_VECTOR,
                                                    limit=config.k_bm25, filter=content_filter, with_payload=True))
                plan.append("bm25")
    if use_chapters:
        requests.append(models.QueryRequest(query=dense_vectors[0], using=using, limit=config.k_chapters,
                                            filter=_scope_filter(config, summaries=True), with_payload=True))
        plan.append("chapter")

    # 3. Search
    t = time.perf_counter()
    try:
        responses = await qdrant_core.qdrant_async.query_batch_points(collection_name=collection, requests=requests)
    except Exception as e:
        result.error = f"search failed: {e}"
        print(f"  Retrieval search error: {e}")
        return result
    timings["search"] = int((time.perf_counter() - t) * 1000)

    candidates: Dict[str, RetrievedChunk] = {}
    chapter_scores: Dict[str, float] = {}
    for kind, response in zip(plan, responses):
        for point in response.points:
            payload = point.payload or {}
            if kind == "chapter":
                cid = payload.get("chapter_id")
                if cid:
                    chapter_scores[cid] = max(chapter_scores.get(cid, 0.0), float(point.score))
                continue
            if payload.get("source_type") == "chapter_summary":
                continue
            pid = str(point.id)
            chunk = candidates.get(pid)
            if chunk is None:
                chunk = candidates[pid] = RetrievedChunk(point_id=pid, text=payload.get("text", ""), payload=payload)
            if kind == "dense":
                chunk.dense = max(chunk.dense, float(point.score))
            else:
                chunk.bm25 = max(chunk.bm25, float(point.score))

    pool = list(candidates.values())
    result.candidates_considered = len(pool)
    if not pool:
        timings["total"] = int((time.perf_counter() - t0) * 1000)
        result.timings_ms = timings
        return result

    for chunk in pool:
        chunk.chapter = chapter_scores.get(chunk.payload.get("chapter_id"), 0.0)

    # 4. Fusion
    if config.legacy_v1_scoring:
        for chunk in pool:
            chunk.hybrid = chunk.dense
    else:
        if config.normalize:
            d, b, c = (_minmax([getattr(ch, s) for ch in pool]) for s in ("dense", "bm25", "chapter"))
        else:
            d, b, c = ([getattr(ch, s) for ch in pool] for s in ("dense", "bm25", "chapter"))
        for i, chunk in enumerate(pool):
            chunk.hybrid = config.w_dense * d[i] + config.w_bm25 * b[i] + config.w_chapter * c[i]
    pool.sort(key=lambda ch: ch.hybrid, reverse=True)

    # 5. Rerank
    reranked = False
    if config.rerank and len(pool) > 0:
        to_rerank = pool[: config.rerank_pool]
        t = time.perf_counter()
        try:
            from app.services.reranker import reranker_client
            logits = await loop.run_in_executor(
                None, lambda: reranker_client.rerank(query, [ch.text for ch in to_rerank])
            )
            for chunk, logit in zip(to_rerank, logits):
                chunk.rerank_logit = float(logit)
                chunk.support = _sigmoid(float(logit))
                if config.legacy_v1_scoring:
                    chunk.score = chunk.dense * 0.2 + chunk.rerank_logit * 0.8
                else:
                    chunk.score = config.alpha_hybrid_vs_rerank * chunk.hybrid + (1 - config.alpha_hybrid_vs_rerank) * chunk.support
            pool = to_rerank
            reranked = True
        except Exception as e:
            print(f"  Reranker error: {e}")
        timings["rerank"] = int((time.perf_counter() - t) * 1000)
    if not reranked:
        for chunk in pool:
            chunk.score = chunk.hybrid
            # Without a cross-encoder, the raw cosine is the best absolute relevance estimate
            chunk.support = max(0.0, chunk.dense)

    # 6. Final ranking
    pool.sort(key=lambda ch: ch.score, reverse=True)
    result.chunks = pool[: config.top_k]
    for rank, chunk in enumerate(result.chunks, start=1):
        chunk.rank = rank
    timings["total"] = int((time.perf_counter() - t0) * 1000)
    result.timings_ms = timings
    return result


#   Presentation helpers

def location_label(payload: dict) -> str:
    """Human-readable location, e.g. 'p. 4', 'slides 3-5', '12:04-12:51'."""
    def span(a, b, one, many):
        if a is None:
            return ""
        return f"{one} {a}" if b in (None, a) else f"{many} {a}-{b}"

    if payload.get("t_start") is not None:
        return f"{format_timestamp(payload['t_start'])}-{format_timestamp(payload.get('t_end', payload['t_start']))}"
    label = span(payload.get("slide_start"), payload.get("slide_end"), "slide", "slides")
    if label:
        return label
    return span(payload.get("page_start"), payload.get("page_end"), "p.", "pp.")


def format_timestamp(seconds: float) -> str:
    seconds = int(seconds or 0)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def chunk_to_source(chunk: RetrievedChunk) -> dict:
    """Source/citation dict. Keeps the v1 keys (doc_id, filename, relevance_score,
    reranked_score, chunk_index) and adds location, snippet and per-signal scores."""
    p = chunk.payload
    source = {
        "sid": f"S{chunk.rank}",
        "doc_id": p.get("doc_id", "unknown"),
        "filename": p.get("filename") or "Unknown",
        "relevance_score": round(chunk.dense, 4),
        "reranked_score": round(chunk.score, 4),
        "chunk_index": chunk.rank,
        "chunk_id": p.get("chunk_id", chunk.point_id),
        "source_type": p.get("source_type"),
        "media_type": p.get("media_type", "document"),
        "location": location_label(p),
        "snippet": chunk.text[:280],
        "support": round(chunk.support, 4),
        "signals": chunk.signals(),
    }
    for key in ("page_start", "page_end", "slide_start", "slide_end", "t_start", "t_end", "chapter_id", "section_title", "chapter_title"):
        if p.get(key) is not None:
            source[key] = p[key]
    return source


def format_context(chunks: List[RetrievedChunk], numbered: bool = True) -> str:
    """Context block for the prompt. Numbered [S1] labels let the model cite sources."""
    parts = []
    for chunk in chunks:
        p = chunk.payload
        where = location_label(p)
        header = f"[S{chunk.rank}] {p.get('filename') or 'Course material'}" + (f", {where}" if where else "")
        parts.append(f"{header}\n{chunk.text}" if numbered else f"[Source {chunk.rank}]:\n{chunk.text}")
    return "\n\n---\n\n".join(parts)
