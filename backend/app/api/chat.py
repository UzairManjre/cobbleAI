from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.api.auth import current_active_user, fastapi_users
from app.models.user import User
from app.core.limiter import limiter
from app.services.llm import LLMAdapter
from app.services.rag import retrieve_context
from app.core.prompts import TEACH_MODE_SYSTEM, TEST_MODE_SYSTEM, REVIEW_MODE_SYSTEM
from app.models.document import DocumentModel
import uuid
import json
import time
import asyncio

router = APIRouter(prefix="/chat", tags=["chat"])
llm_client = LLMAdapter()


def _safe_track_event(event_type, event_category, user_id, user_role, **kwargs):
    """Fire-and-forget event tracking that never breaks the route handler."""
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=event_type,
                event_category=event_category,
                user_id=user_id,
                user_role=user_role,
                **kwargs,
            )
        except Exception:
            pass
    asyncio.create_task(_track())


@router.post("/")
@limiter.limit("20/minute")
async def chat_interaction(
    request: Request,
    session_id: uuid.UUID,
    message: str,
    course_id: uuid.UUID | None = None,
    mode: str = "teach",
    user: User | None = Depends(fastapi_users.current_user(optional=True))
):
    """Core Chat Orchestrator with RAG - Retrieves context from course documents."""
    start_time = time.time()

    user_id = user.id if user else uuid.UUID("00000000-0000-0000-0000-000000000000")
    user_role = user.role if user else "unknown"

    # Track standalone chat message
    _safe_track_event(
        "chat_standalone_sent", "chat", user_id, user_role,
        course_id=course_id,
        payload={
            "message_length_chars": len(message),
            "mode": mode,
            "has_course_context": course_id is not None,
        },
    )

    # Retrieve context from course documents if course_id is provided
    context_str = "General knowledge context."
    sources = []

    if course_id:
        course_id_str = str(course_id)
        print(f"  Retrieving context for query: '{message}' in course {course_id_str}")
        context_str, sources = await retrieve_context(message, course_id_str, top_k=5, use_rerank=True)
        print(f"  Retrieved {len(sources)} sources")

        # Resolve document filenames
        for source in sources:
            did = source.get("doc_id", "")
            filename = source.get("filename")  # May already be from Qdrant
            
            if not filename and did and did != "unknown" and _is_valid_uuid(did):
                try:
                    doc = await DocumentModel.get(uuid.UUID(did))
                    if doc:
                        filename = doc.filename
                        print(f"  Resolved doc {did} -> {filename}")
                    else:
                        print(f"  Document {did} not found in MongoDB")
                except Exception as e:
                    print(f"  Failed to resolve doc {did}: {e}")
            
            source["filename"] = filename or "Unknown Document"

    # Track RAG query
    if course_id and sources:
        _safe_track_event(
            "rag_query", "rag", user_id, user_role,
            course_id=course_id,
            payload={
                "query_text": message[:200],
                "retrieved_count": len(sources),
                "source_doc_ids": doc_ids if doc_ids else [],
                "avg_relevance_score": sum(s.get("relevance_score", 0) for s in sources) / max(len(sources), 1),
            },
        )
    elif course_id and not sources:
        _safe_track_event(
            "rag_no_results", "rag", user_id, user_role,
            course_id=course_id,
            payload={"query_text": message[:200]},
        )

    # Select prompt template based on mode
    prompt_template = TEACH_MODE_SYSTEM
    if mode == "test":
        prompt_template = TEST_MODE_SYSTEM
    elif mode == "review":
        prompt_template = REVIEW_MODE_SYSTEM

    system_prompt = prompt_template.format(context=context_str)
    messages = [{"role": "user", "content": message}]

    # Stream LLM Response with metadata
    async def generate():
        try:
            # Send sources first as metadata
            if sources:
                yield f"<sources>{json.dumps(sources)}</sources>"

            # Stream LLM response
            total_chars = 0
            async for chunk in llm_client.generate_response(
                system=system_prompt,
                messages=messages,
                stream=True
            ):
                total_chars += len(chunk)
                yield chunk

            # Track LLM usage after streaming completes
            latency_ms = int((time.time() - start_time) * 1000)
            _safe_track_event(
                "llm_call", "llm", user_id, user_role,
                payload={
                    "endpoint": "/chat/",
                    "model": llm_client.model,
                    "latency_ms": latency_ms,
                    "response_length_chars": total_chars,
                    "rag_retrieved_count": len(sources),
                    "rag_success": len(sources) > 0,
                },
            )
        except Exception as e:
            print(f"  Chat error: {e}")
            import traceback
            print(traceback.format_exc())
            # Track error
            _safe_track_event(
                "llm_error", "llm", user_id, user_role,
                payload={
                    "endpoint": "/chat/",
                    "model": llm_client.model,
                    "error": str(e),
                },
            )
            yield f"Error: {str(e)}"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

def _is_valid_uuid(uuid_string: str) -> bool:
    """Check if a string is a valid UUID"""
    try:
        uuid.UUID(uuid_string)
        return True
    except (ValueError, AttributeError):
        return False
