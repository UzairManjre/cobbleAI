from fastapi import APIRouter, Depends, HTTPException
from app.api.auth import require_role
from app.models.user import User
from app.models.graph import ChatMessage, KnowledgeGraph, StudySession, node_to_dict
from app.services.tutor_engine import TutorEngine, TutorRequest
from app.services.tutor_stream import tutor_sse
from app.services.access import ensure_course_access
from app.utils.llm_text import split_thinking
from pydantic import BaseModel
import uuid
import time
from datetime import datetime, timezone
from typing import Optional

router = APIRouter(prefix="/sessions", tags=["sessions"])


from app.utils.telemetry import safe_track_event


class NavigateRequest(BaseModel):
    node_id: str

class AskRequest(BaseModel):
    node_id: str
    question: str
    mode: Optional[str] = None  # teach (default) | review | teach_back
    hint_level: Optional[str] = None  # nudge | guiding_question | worked_step | full_answer

class GetOrCreateSessionRequest(BaseModel):
    graph_id: uuid.UUID


# Students use sessions to study; professors use them to preview their own course graphs.
session_user = require_role("student", "professor")


async def _load_owned_session(session_id: uuid.UUID, user: User) -> StudySession:
    from app.repositories.session_repository import StudySessionRepository
    session = await StudySessionRepository().get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    return session


def _message_to_dict(msg: ChatMessage) -> dict:
    content, legacy_thinking = split_thinking(msg.content)
    return {
        "id": str(msg.id),
        "role": msg.role,
        "content": content,
        "thinking": msg.thinking or legacy_thinking or None,
        "sources": msg.sources or [],
        "citations": msg.citations,
        "decision": msg.decision,
        "support": msg.support,
        "mode": msg.mode,
        "hint_level": msg.hint_level,
        "created_at": msg.created_at.isoformat(),
    }


@router.get("/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    user: User = Depends(session_user)
):
    """Get current session state."""
    from app.repositories.session_repository import ChatMessageRepository

    session = await _load_owned_session(session_id, user)

    # Get chat history for current node
    chat_history = []
    if session.current_node_id:
        messages = await ChatMessageRepository().find_by_session_and_node(session_id, session.current_node_id)
        chat_history = [_message_to_dict(msg) for msg in messages]

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
    user: User = Depends(session_user)
):
    """Get the most recent session for this graph or create a new one."""

    from app.repositories.session_repository import StudySessionRepository
    session_repo = StudySessionRepository()

    graph = await KnowledgeGraph.get(req.graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    if graph.course_id:
        await ensure_course_access(user, graph.course_id)

    # Try to find an existing session for this user and graph
    session = await session_repo.find_latest_by_student_and_graph(user.id, req.graph_id)

    if not session:
        first_node_id = graph.nodes[0].id if graph.nodes else None
        session = StudySession(
            graph_id=req.graph_id,
            student_id=user.id,
            current_node_id=first_node_id,
            current_node_since=datetime.now(timezone.utc),
            visited_nodes=[first_node_id] if first_node_id else []
        )
        await session_repo.create(session)
    else:
        # Reopening a session starts the dwell clock again for the concept it shows
        session.current_node_since = datetime.now(timezone.utc)
        await session_repo.update(session)

        # Track session start
        safe_track_event(
            "session_started", "session", user.id, user.role,
            course_id=graph.course_id,
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

MAX_DWELL_MS = 30 * 60 * 1000


@router.post("/{session_id}/navigate")
async def navigate_to_node(
    session_id: uuid.UUID,
    req: NavigateRequest,
    user: User = Depends(session_user)
):
    """Navigate to a new node in the graph."""
    from app.repositories.session_repository import StudySessionRepository
    session = await _load_owned_session(session_id, user)

    # Track dwell time on previous node before navigating away
    previous_node_id = session.current_node_id
    is_revisit = req.node_id in session.visited_nodes
    now = datetime.now(timezone.utc)
    since = session.current_node_since
    if previous_node_id and since and previous_node_id != req.node_id:
        since = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
        dwell_ms = int((now - since).total_seconds() * 1000)
        if 0 <= dwell_ms <= MAX_DWELL_MS:  # longer means the tab was left open, not time spent reading
            graph_for_dwell = await KnowledgeGraph.get(session.graph_id)
            safe_track_event(
                "node_dwell", "navigation", user.id, user.role,
                course_id=graph_for_dwell.course_id if graph_for_dwell else None,
                graph_id=session.graph_id, session_id=session_id, node_id=previous_node_id,
                payload={"dwellTimeMs": dwell_ms, "source": "server"},
            )

    # Update session
    session.current_node_since = now
    session.current_node_id = req.node_id
    if req.node_id not in session.visited_nodes:
        session.visited_nodes.append(req.node_id)
    session.updated_at = datetime.now(timezone.utc)
    await StudySessionRepository().update(session)

    # Get graph to find node label
    graph = await KnowledgeGraph.get(session.graph_id)
    node = graph.find_node(req.node_id) if graph else None
    node_label = node.label if node else ""

    visit_order = len(session.visited_nodes)

    # Track navigation event
    safe_track_event(
        "node_revisited" if is_revisit else "node_visited",
        "navigation",
        user.id, user.role,
        course_id=graph.course_id if graph else None,
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

    # The node's earlier conversation: the tutor sees it as history, so the student should too
    from app.repositories.session_repository import ChatMessageRepository
    messages = await ChatMessageRepository().find_by_session_and_node(session_id, req.node_id)
    return {
        "current_node_id": session.current_node_id,
        "visited_nodes": session.visited_nodes,
        "chat_history": [_message_to_dict(m) for m in messages],
    }

@router.post("/{session_id}/ask")
async def ask_question(
    session_id: uuid.UUID,
    req: AskRequest,
    user: User = Depends(session_user)
):
    """Ask the tutor about a concept node. Streams SSE frames (see app/services/tutor_stream.py)."""
    start_time = time.time()

    from app.repositories.session_repository import ChatMessageRepository
    session = await _load_owned_session(session_id, user)

    graph = await KnowledgeGraph.get(session.graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    current_node = graph.find_node(req.node_id)
    if not current_node:
        raise HTTPException(status_code=400, detail="Node not found in graph")

    messages = await ChatMessageRepository().find_by_session_and_node(session_id, req.node_id)
    history = [{"role": m.role, "content": m.content} for m in messages]

    safe_track_event(
        "question_asked", "chat", user.id, user.role,
        course_id=graph.course_id,
        graph_id=session.graph_id,
        session_id=session_id,
        node_id=req.node_id,
        payload={
            "question_length_chars": len(req.question),
            "word_count": len(req.question.split()),
            "session_question_count": sum(1 for m in messages if m.role == "user") + 1,
            "node_label": current_node.label,
            "mode": req.mode or "teach",
            "hint_level": req.hint_level,
        },
    )

    engine = TutorEngine()
    prepared = await engine.prepare(TutorRequest(
        question=req.question,
        course_id=str(graph.course_id) if graph.course_id else None,
        mode=req.mode or "teach",
        hint_level=req.hint_level,
        node=node_to_dict(current_node),
        neighbors=graph.neighbors(req.node_id),
        history=history,
        node_id=req.node_id,
        user=user,
    ))

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        tutor_sse(
            engine, prepared,
            user=user,
            session_id=session_id,
            chat_node_id=req.node_id,
            endpoint="session_ask",
            course_id=graph.course_id,
            graph_id=session.graph_id,
            started_at=start_time,
            event_payload={"node_label": current_node.label},
        ),
        media_type="text/event-stream",
    )
