from fastapi import APIRouter, Depends, HTTPException
from app.api.auth import current_active_user
from app.models.user import User
from app.models.graph import StudySession, ChatMessage
from app.models.document import DocumentModel
from app.services.tutor import TutorService
from pydantic import BaseModel
import uuid
import asyncio
import time
from datetime import datetime, timezone
from typing import List

router = APIRouter(prefix="/sessions", tags=["sessions"])


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


class NavigateRequest(BaseModel):
    node_id: str

class AskRequest(BaseModel):
    node_id: str
    question: str

class GetOrCreateSessionRequest(BaseModel):
    graph_id: uuid.UUID

@router.get("/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Get current session state."""
    session = await StudySession.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    # Get chat history for current node
    chat_history = []
    if session.current_node_id:
        messages = await ChatMessage.find(
            ChatMessage.session_id == session_id,
            ChatMessage.node_id == session.current_node_id
        ).sort(ChatMessage.created_at).to_list()

        chat_history = [
            {
                "role": msg.role,
                "content": msg.content,
                "sources": msg.sources if hasattr(msg, 'sources') else [],
                "created_at": msg.created_at.isoformat()
            }
            for msg in messages
        ]

    return {
        "id": str(session.id),
        "graph_id": str(session.graph_id),
        "current_node_id": session.current_node_id,
        "visited_nodes": session.visited_nodes,
        "chat_history": chat_history,
        "updated_at": session.updated_at.isoformat()
    }

@router.post("/get-or-create")
async def get_or_create_session(
    req: GetOrCreateSessionRequest,
    user: User = Depends(current_active_user)
):
    """Get the most recent session for this graph or create a new one."""

    # Try to find an existing session for this user and graph
    session = await StudySession.find(
        StudySession.student_id == user.id,
        StudySession.graph_id == req.graph_id
    ).sort(-StudySession.updated_at).first_or_none()

    if not session:
        # Create a new session
        from app.models.graph import KnowledgeGraph
        graph = await KnowledgeGraph.get(req.graph_id)
        if not graph:
            raise HTTPException(status_code=404, detail="Graph not found")

        session = StudySession(
            graph_id=req.graph_id,
            student_id=user.id,
            current_node_id=graph.nodes[0]["id"] if graph.nodes else None,
            visited_nodes=[graph.nodes[0]["id"]] if graph.nodes else []
        )
        await session.insert()

        # Track session start
        _safe_track_event(
            "session_started", "session", user.id, user.role,
            graph_id=req.graph_id,
            session_id=session.id,
            payload={
                "graph_id": str(req.graph_id),
                "session_id": str(session.id),
                "entry_point": "get_or_create",
                "first_node": session.current_node_id,
            },
        )

    # Return formatted session data (same as get_session)
    return await get_session(session.id, user)

@router.post("/{session_id}/navigate")
async def navigate_to_node(
    session_id: uuid.UUID,
    req: NavigateRequest,
    user: User = Depends(current_active_user)
):
    """Navigate to a new node in the graph."""
    session = await StudySession.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    # Track dwell time on previous node before navigating away
    previous_node_id = session.current_node_id
    is_revisit = req.node_id in session.visited_nodes

    # Update session
    session.current_node_id = req.node_id
    if req.node_id not in session.visited_nodes:
        session.visited_nodes.append(req.node_id)
    session.updated_at = datetime.now(timezone.utc)
    await session.save()

    # Get graph to find node label
    from app.models.graph import KnowledgeGraph
    graph = await KnowledgeGraph.get(session.graph_id)
    node_label = ""
    if graph:
        for node in graph.nodes:
            if node["id"] == req.node_id:
                node_label = node.get("label", "")
                break

    visit_order = len(session.visited_nodes)

    # Track navigation event
    _safe_track_event(
        "node_revisited" if is_revisit else "node_visited",
        "navigation",
        user.id, user.role,
        graph_id=session.graph_id,
        session_id=session_id,
        node_id=req.node_id,
        payload={
            "node_label": node_label,
            "visit_order": visit_order,
            "is_revisit": is_revisit,
            "previous_node_id": previous_node_id,
            "total_visited_nodes": len(session.visited_nodes),
        },
    )

    return {
        "current_node_id": session.current_node_id,
        "visited_nodes": session.visited_nodes
    }

@router.post("/{session_id}/ask")
async def ask_question(
    session_id: uuid.UUID,
    req: AskRequest,
    user: User = Depends(current_active_user)
):
    """Ask a question about the current node with RAG support."""
    start_time = time.time()

    session = await StudySession.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    # Get the graph
    from app.models.graph import KnowledgeGraph
    graph = await KnowledgeGraph.get(session.graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    # Find current node data
    current_node = None
    neighbors = []
    for node in graph.nodes:
        if node["id"] == req.node_id:
            current_node = node

    # Find connected neighbors
    for edge in graph.edges:
        if edge["from"] == req.node_id:
            neighbors.append({
                "node_id": edge["to"],
                "relation": edge["relation"],
                "label": next((n["label"] for n in graph.nodes if n["id"] == edge["to"]), "")
            })
        elif edge["to"] == req.node_id:
            neighbors.append({
                "node_id": edge["from"],
                "relation": edge["relation"],
                "label": next((n["label"] for n in graph.nodes if n["id"] == edge["from"]), "")
            })

    if not current_node:
        raise HTTPException(status_code=400, detail="Node not found in graph")

    # Get chat history for this node
    messages = await ChatMessage.find(
        ChatMessage.session_id == session_id,
        ChatMessage.node_id == req.node_id
    ).sort(ChatMessage.created_at).to_list()

    chat_history = [{"role": msg.role, "content": msg.content} for msg in messages]

    # Track question asked event (before LLM call)
    _safe_track_event(
        "question_asked", "chat", user.id, user.role,
        graph_id=session.graph_id,
        session_id=session_id,
        node_id=req.node_id,
        payload={
            "question_length_chars": len(req.question),
            "word_count": len(req.question.split()),
            "session_question_count": len(chat_history) + 1,
            "node_label": current_node.get("label", ""),
        },
    )

    # Get context and LLM generator
    tutor = TutorService()
    raw_sources, stream_gen = await tutor.get_context_and_stream(
        node=current_node,
        neighbors=neighbors,
        question=req.question,
        chat_history=chat_history,
        course_id=str(graph.course_id) if graph.course_id else None,
    )

    # Resolve source doc_ids to actual filenames for frontend display
    resolved_sources = []
    if raw_sources:
        for source in raw_sources:
            did = source.get("doc_id", "")
            filename = source.get("filename")  
            if not filename and did and did != "unknown":
                try:
                    doc_uuid = uuid.UUID(did)
                    doc = await DocumentModel.get(doc_uuid)
                    if doc:
                        filename = doc.filename
                except Exception as e:
                    print(f"  Failed to resolve doc {did}: {e}")
            
            resolved_sources.append({
                "doc_id": did,
                "filename": filename or "Unknown Document",
                "relevance_score": source.get("relevance_score", 0),
            })

    from fastapi.responses import StreamingResponse
    import json

    async def event_generator():
        # Yield sources right away
        yield f"data: {json.dumps({'type': 'sources', 'sources': resolved_sources})}\n\n"
        
        full_answer = ""
        # Stream LLM chunks
        async for chunk in stream_gen:
            if chunk.startswith("Error:"):
                yield f"data: {json.dumps({'type': 'error', 'content': chunk})}\n\n"
                break
            full_answer += chunk
            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

        # After streaming completes, save to DB
        user_msg = ChatMessage(
            session_id=session_id,
            node_id=req.node_id,
            role="user",
            content=req.question,
            sources=[]
        )
        await user_msg.insert()

        assistant_msg = ChatMessage(
            session_id=session_id,
            node_id=req.node_id,
            role="assistant",
            content=full_answer,
            sources=resolved_sources
        )
        await assistant_msg.insert()

        # Track answer received event
        latency_ms = int((time.time() - start_time) * 1000)
        _safe_track_event(
            "answer_received", "chat", user.id, user.role,
            graph_id=session.graph_id,
            session_id=session_id,
            node_id=req.node_id,
            payload={
                "answer_length_chars": len(full_answer),
                "has_sources": len(resolved_sources) > 0,
                "source_count": len(resolved_sources),
                "response_latency_ms": latency_ms,
                "node_label": current_node.get("label", ""),
            },
        )

        # Indicate completion
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
