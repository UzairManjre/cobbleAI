"""Server-sent-event stream for a tutor answer, shared by every tutor endpoint.

Frame order (all `data: {json}`):
    meta       {message_id, run_id, mode, hint_level, decision, policy}
    sources    {sources: [...]}                 (v1 frame, unchanged keys plus location/snippet)
    chunk      {content}                        (repeated)
    error      {content}                        (only on LLM failure)
    citations  {answer, citations, cited_sids, support, decision, decline_reason}
    done       {}
Old clients only read sources/chunk/error/done, so the extra frames are safe.
"""

import asyncio
import json
import time
import uuid
from typing import AsyncIterator, Optional

from app.models.graph import ChatMessage
from app.services.llm import is_llm_error
from app.services.run_log import log_tutor_run
from app.services.tutor_engine import PreparedAnswer, TutorEngine
from app.utils.telemetry import safe_track_event


def _frame(payload: dict) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


async def tutor_sse(
    engine: TutorEngine,
    prepared: PreparedAnswer,
    *,
    user,
    session_id: uuid.UUID,
    chat_node_id: str,
    endpoint: str,
    course_id: Optional[uuid.UUID] = None,
    graph_id: Optional[uuid.UUID] = None,
    started_at: Optional[float] = None,
    event_payload: Optional[dict] = None,
) -> AsyncIterator[str]:
    started_at = started_at or time.time()
    req = prepared.request
    message_id = uuid.uuid4()
    run_id = uuid.uuid4()

    yield _frame({
        "type": "meta",
        "message_id": str(message_id),
        "run_id": str(run_id),
        "mode": req.mode,
        "hint_level": prepared.hint_level,
        "decision": "declined" if prepared.decision == "declined" else "pending",
        "policy": prepared.policy.to_dict(),
    })
    yield _frame({"type": "sources", "sources": prepared.sources})

    timing = {"first_token": None, "generation": 0}

    async def persist(outcome):
        """Save the chat turn and the TutorRun. Runs before the citations frame (so feedback on
        the answer can find it) and also when the client disconnects mid-answer."""
        await ChatMessage(
            session_id=session_id, node_id=chat_node_id, role="user", content=req.question, sources=[],
            mode=req.mode, hint_level=prepared.hint_level,
        ).insert()
        if outcome.decision != "error" or outcome.answer:
            await ChatMessage(
                id=message_id, session_id=session_id, node_id=chat_node_id, role="assistant",
                content=outcome.answer, thinking=outcome.thinking or None,
                sources=prepared.sources, citations=outcome.citations,
                mode=req.mode, hint_level=prepared.hint_level, decision=outcome.decision,
                support=outcome.support, run_id=run_id,
            ).insert()

        total_ms = int((time.time() - started_at) * 1000)
        await log_tutor_run(
            prepared.retrieval,
            id=run_id,
            message_id=message_id,
            user_id=getattr(user, "id", None),
            user_role=getattr(user, "role", None),
            course_id=course_id,
            graph_id=graph_id,
            session_id=session_id,
            node_id=req.node_id,
            endpoint=endpoint,
            latency_ms={
                **prepared.retrieval.timings_ms,
                "prepare": prepared.prepare_ms,
                "first_token": timing["first_token"] or 0,
                "generation": timing["generation"],
                "total": total_ms,
            },
            **engine.run_fields(prepared, outcome),
        )

        if user is not None:
            safe_track_event(
                "answer_received", "chat", user.id, user.role,
                course_id=course_id, graph_id=graph_id, session_id=session_id, node_id=req.node_id,
                payload={
                    **(event_payload or {}),
                    "answer_length_chars": len(outcome.answer),
                    "has_sources": bool(prepared.sources),
                    "source_count": len(prepared.sources),
                    "cited_count": len(outcome.citations),
                    "cited_chunk_ids": [c.get("chunk_id") for c in outcome.citations],
                    "decision": outcome.decision,
                    "decline_reason": outcome.decline_reason,
                    "support": outcome.support,
                    "top_support": round(prepared.retrieval.top_support, 4),
                    "mode": req.mode,
                    "hint_level": prepared.hint_level,
                    "message_id": str(message_id),
                    "response_latency_ms": total_ms,
                },
            )

    raw, error, persisted = "", None, False
    try:
        if prepared.decision == "declined":
            outcome = engine.finalize(prepared, "")
            yield _frame({"type": "chunk", "content": outcome.answer})
        else:
            gen_start = time.time()
            async for chunk in engine.stream(prepared):
                if is_llm_error(chunk):
                    error = chunk
                    yield _frame({"type": "error", "content": chunk})
                    break
                if timing["first_token"] is None:
                    timing["first_token"] = int((time.time() - gen_start) * 1000)
                raw += chunk
                yield _frame({"type": "chunk", "content": chunk})
            timing["generation"] = int((time.time() - gen_start) * 1000)
            outcome = engine.finalize(prepared, raw, error)

        persisted = True
        await persist(outcome)
        yield _frame({
            "type": "citations",
            "answer": outcome.answer,
            "citations": outcome.citations,
            "cited_sids": outcome.cited_sids,
            "support": outcome.support,
            "decision": outcome.decision,
            "decline_reason": outcome.decline_reason,
        })
    finally:
        if not persisted:
            # The client went away mid-answer (stop button, closed tab): keep the partial turn and its
            # run log. A task, because awaiting inside a cancelled generator is not reliable.
            asyncio.ensure_future(persist(engine.finalize(prepared, raw, error or "client_disconnected")))

    yield _frame({"type": "done", "message_id": str(message_id)})
