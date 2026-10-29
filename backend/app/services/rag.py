"""Backward-compatible retrieval entry point.

`retrieve_context` keeps its v1 signature and (context, sources) return shape;
the work is done by app.services.retrieval.hybrid using the configured preset
(HYBRID_RETRIEVAL=False selects the exact v1 pipeline).
"""

from typing import Optional

from app.services.retrieval.config import RetrievalConfig, default_config
from app.services.retrieval.hybrid import RetrievalResult, chunk_to_source, format_context, retrieve

# Re-exported for older imports
from app.services.retrieval.hybrid import EXPANSION_PROMPT  # noqa: F401


async def retrieve_with_details(query: str, course_id: str, config: Optional[RetrievalConfig] = None) -> RetrievalResult:
    try:
        return await retrieve(query, course_id, config)
    except Exception as e:
        import traceback
        print(f"  RAG Error: {e}")
        print(traceback.format_exc())
        return RetrievalResult(query=query, chunks=[], config=config or default_config(), error=str(e))


async def retrieve_context(query: str, course_id: str, top_k: int = 5, use_rerank: bool = True) -> tuple[str, list[dict]]:
    """Returns (context_str, sources). Never injects error text into the context."""
    config = default_config().model_copy(update={"top_k": top_k, "rerank": use_rerank})
    result = await retrieve_with_details(query, course_id, config)
    if not result.chunks:
        return "", []
    return format_context(result.chunks, numbered=False), [chunk_to_source(c) for c in result.chunks]
