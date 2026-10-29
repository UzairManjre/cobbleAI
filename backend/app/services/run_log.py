"""Persist tutor runs (and the matching LLM usage record) without ever failing the caller."""

import logging
from typing import Optional

from app.models.tutor import TutorRun
from app.services.retrieval.hybrid import RetrievalResult


def retrieval_fields(result: Optional[RetrievalResult]) -> dict:
    if result is None:
        return {}
    from app.services.retrieval.hybrid import chunk_to_source
    return {
        "expanded_queries": result.expanded_queries,
        "retrieval_config": result.config.model_dump(),
        "config_hash": result.config_hash,
        "collection": result.collection,
        "candidates_considered": result.candidates_considered,
        "sources": [chunk_to_source(c) for c in result.chunks],
        "top_support": result.top_support,
        "retrieval_error": result.error,
    }


def _estimate_tokens(text: str) -> int:
    # Rough word-based estimate; Ollama's streaming API does not report counts per chunk
    return max(1, int(len((text or "").split()) * 1.3)) if text else 0


async def log_tutor_run(retrieval: Optional[RetrievalResult] = None, **fields) -> Optional[TutorRun]:
    try:
        run = TutorRun(**{**retrieval_fields(retrieval), **fields})
        if not run.tokens:
            run.tokens = {"prompt_est": _estimate_tokens(run.question), "answer_est": _estimate_tokens(run.answer)}
        await run.insert()

        if run.decision != "declined" and run.model:
            from app.models.analytics.llm_usage import AnalyticsLLMUsage
            await AnalyticsLLMUsage(
                user_id=run.user_id,
                session_id=run.session_id,
                endpoint=run.endpoint,
                model=run.model,
                prompt_text=run.question[:200],
                latency_ms=run.latency_ms.get("generation", run.latency_ms.get("total", 0)),
                time_to_first_token_ms=run.latency_ms.get("first_token"),
                response_length_chars=len(run.answer),
                estimated_input_tokens=run.tokens.get("prompt_est", 0),
                estimated_output_tokens=run.tokens.get("answer_est", 0),
                rag_retrieved_count=len(run.sources),
                rag_success=bool(run.sources),
                error_message=run.error,
            ).insert()
        return run
    except Exception as e:
        logging.error(f"Failed to log tutor run: {e}")
        return None
