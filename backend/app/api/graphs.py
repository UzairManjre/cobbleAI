from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.api.auth import current_active_user
from app.models.user import User
from app.models.graph import KnowledgeGraph, StudySession
from app.services.graph_generator import GraphGenerator
from app.services.doc_extractor import extract_all_text_from_course
from app.services.triplet_extractor import TripletExtractor
from app.services.graph_builder import GraphBuilder
from app.services.advanced_graph_generator import AdvancedGraphGenerator
from pydantic import BaseModel
import uuid
import json
import asyncio
import time
from datetime import datetime

router = APIRouter(prefix="/graph", tags=["graph"])


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

class GenerateGraphRequest(BaseModel):
    topic: str
    course_id: uuid.UUID | None = None

class GenerateFromDocsRequest(BaseModel):
    course_id: uuid.UUID

class NavigateRequest(BaseModel):
    node_id: str

class AskRequest(BaseModel):
    node_id: str
    question: str

@router.post("/generate")
async def generate_graph(
    req: GenerateGraphRequest,
    user: User = Depends(current_active_user)
):
    """Generate a knowledge graph from a topic."""
    start_time = time.time()
    generator = GraphGenerator()

    # Track generation started
    _safe_track_event(
        "graph_generation_started", "graph", user.id, user.role,
        payload={"topic": req.topic, "source": "topic", "course_id": str(req.course_id) if req.course_id else None},
    )

    try:
        # Smart context detection: if the topic is a course UUID, use the advanced generator
        is_course_uuid = False
        try:
            topic_uuid = uuid.UUID(req.topic)
            from app.models.course import CourseModel
            course = await CourseModel.get(topic_uuid)
            if course:
                is_course_uuid = True
                req.course_id = topic_uuid
        except Exception:
            pass

        if is_course_uuid or req.course_id:
            print(f"  Topic is course ID: {req.topic}. Using Advanced Document Generator.")
            from app.services.advanced_graph_generator import AdvancedGraphGenerator
            adv_generator = AdvancedGraphGenerator()
            graph_data = await adv_generator.generate_from_course(str(req.course_id or req.topic))
        else:
            graph_data = await generator.generate_graph(req.topic)
    except Exception as e:
        # Track failure
        _safe_track_event(
            "graph_generation_failed", "graph", user.id, user.role,
            payload={"topic": req.topic, "error": str(e)},
        )
        raise HTTPException(status_code=500, detail=f"Graph generation failed: {str(e)}")

    # Save to database
    graph = KnowledgeGraph(
        topic=req.topic,
        course_id=req.course_id,
        nodes=graph_data["nodes"],
        edges=graph_data["edges"],
        created_by=user.id
    )
    await graph.insert()

    # Create a study session for the user
    session = StudySession(
        graph_id=graph.id,
        student_id=user.id,
        current_node_id=graph_data["nodes"][0]["id"] if graph_data["nodes"] else None,
        visited_nodes=[graph_data["nodes"][0]["id"]] if graph_data["nodes"] else []
    )
    await session.insert()

    # Track success
    generation_time_ms = int((time.time() - start_time) * 1000)
    _safe_track_event(
        "graph_generated", "graph", user.id, user.role,
        graph_id=graph.id,
        session_id=session.id,
        payload={
            "node_count": len(graph_data["nodes"]),
            "edge_count": len(graph_data["edges"]),
            "generation_time_ms": generation_time_ms,
            "topic": req.topic,
        },
    )

    return {
        "graph_id": str(graph.id),
        "session_id": str(session.id),
        "nodes": graph_data["nodes"],
        "edges": graph_data["edges"]
    }

@router.post("/generate-from-docs")
async def generate_graph_from_docs(
    req: GenerateFromDocsRequest,
    user: User = Depends(current_active_user)
):
    """Generate an interconnected knowledge graph from all uploaded course documents.

    If documents are still pending, this will trigger processing and wait for them.
    """
    start_time = time.time()
    print(f"  Generating interconnected graph for course {req.course_id}...")

    # Track generation started
    _safe_track_event(
        "graph_generation_started", "graph", user.id, user.role,
        payload={"topic": "course_documents", "source": "docs", "course_id": str(req.course_id)},
    )

    try:
        # Check if there are pending documents that need processing
        from app.models.document import DocumentModel
        from app.api.documents import _process_document_sync
        import asyncio

        pending_docs = await DocumentModel.find(
            DocumentModel.course_id == req.course_id,
            DocumentModel.status == "pending"
        ).to_list()

        if pending_docs:
            print(f"  Found {len(pending_docs)} pending documents, processing them first...")

            # Process each pending document
            for doc in pending_docs:
                doc_id = str(doc.id)
                print(f"  Processing: {doc.filename}")
                # Run processing in thread pool
                loop = asyncio.get_event_loop()
                from concurrent.futures import ThreadPoolExecutor
                executor = ThreadPoolExecutor(max_workers=1)
                await loop.run_in_executor(executor, _process_document_sync, doc_id)
                executor.shutdown(wait=False)

            print(f"  All documents processed")

        # Now generate the graph
        generator = AdvancedGraphGenerator()
        graph_data = await generator.generate_from_course(str(req.course_id))

        if not graph_data["nodes"]:
            raise HTTPException(status_code=500, detail="Failed to generate graph from documents. No concepts could be extracted.")

        print(f"  Generated graph with {len(graph_data['nodes'])} nodes and {len(graph_data['edges'])} edges")

        # Save to database
        graph = KnowledgeGraph(
            topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
            course_id=req.course_id,
            nodes=graph_data["nodes"],
            edges=graph_data["edges"],
            created_by=user.id
        )
        await graph.insert()

        # Store metadata
        graph._source_docs = graph_data.get("_source_docs", [])

        # Create a study session for the user
        session = StudySession(
            graph_id=graph.id,
            student_id=user.id,
            current_node_id=graph_data["nodes"][0]["id"] if graph_data["nodes"] else None,
            visited_nodes=[graph_data["nodes"][0]["id"]] if graph_data["nodes"] else []
        )
        await session.insert()

        # Track success
        generation_time_ms = int((time.time() - start_time) * 1000)
        _safe_track_event(
            "graph_generated", "graph", user.id, user.role,
            graph_id=graph.id,
            session_id=session.id,
            course_id=req.course_id,
            payload={
                "node_count": len(graph_data["nodes"]),
                "edge_count": len(graph_data["edges"]),
                "generation_time_ms": generation_time_ms,
                "source": "docs",
                "source_docs_count": len(graph_data.get("_source_docs", [])),
            },
        )

        print(f"  Graph saved with ID: {graph.id}")
        print(f"  Session created with ID: {session.id}")

        return {
            "graph_id": str(graph.id),
            "session_id": str(session.id),
            "nodes": graph_data["nodes"],
            "edges": graph_data["edges"],
            "source": "advanced_documents",
            "nodes_count": len(graph_data["nodes"]),
            "edges_count": len(graph_data["edges"])
        }

    except ValueError as e:
        _safe_track_event(
            "graph_generation_failed", "graph", user.id, user.role,
            payload={"topic": "course_documents", "source": "docs", "error": str(e)},
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        print(f"  Graph generation failed:")
        print(traceback.format_exc())
        _safe_track_event(
            "graph_generation_failed", "graph", user.id, user.role,
            payload={"topic": "course_documents", "source": "docs", "error": str(e)},
        )
        raise HTTPException(status_code=500, detail=f"Graph generation failed: {str(e)}")

@router.get("/generate-from-docs-stream/{course_id}")
async def generate_graph_from_docs_stream(
    course_id: uuid.UUID,
    request: Request,
    user_id: str = "",
):
    """Stream graph generation progress via Server-Sent Events.
    
    Auth is skipped for this endpoint because EventSource (SSE) cannot send
    custom Authorization headers. The user_id is passed as a query parameter.
    
    Sends events:
      - event: progress  -> { step, totalSteps, message, detail }
      - event: complete   -> { graph_id, session_id, nodes_count, edges_count }
      - event: error      -> { message }
    """
    # Look up user directly — no JWT needed for SSE
    user = None
    if user_id:
        try:
            user = await User.get(uuid.UUID(user_id))
        except Exception:
            pass
    if not user:
        raise HTTPException(status_code=400, detail="Valid user_id query parameter required")

    async def event_stream():
        start_time = time.time()
        progress_queue: asyncio.Queue = asyncio.Queue()

        async def progress_callback(step, total_steps, message, detail=""):
            await progress_queue.put({
                "type": "progress",
                "step": step,
                "totalSteps": total_steps,
                "message": message,
                "detail": detail,
                "elapsed": round(time.time() - start_time, 1)
            })

        _safe_track_event(
            "graph_generation_started", "graph", user.id, user.role,
            payload={"topic": "course_documents", "source": "docs_stream", "course_id": str(course_id)},
        )

        # Run the pipeline in a background task that feeds the queue
        async def run_pipeline():
            try:
                # Check for pending documents first
                from app.models.document import DocumentModel
                from app.api.documents import _process_document_sync

                pending_docs = await DocumentModel.find(
                    DocumentModel.course_id == course_id,
                    DocumentModel.status == "pending"
                ).to_list()

                if pending_docs:
                    await progress_queue.put({
                        "type": "progress",
                        "step": 0, "totalSteps": 6,
                        "message": "Processing documents",
                        "detail": f"Processing {len(pending_docs)} pending documents...",
                        "elapsed": round(time.time() - start_time, 1)
                    })
                    for doc in pending_docs:
                        loop = asyncio.get_event_loop()
                        from concurrent.futures import ThreadPoolExecutor
                        executor = ThreadPoolExecutor(max_workers=1)
                        await loop.run_in_executor(executor, _process_document_sync, str(doc.id))
                        executor.shutdown(wait=False)

                generator = AdvancedGraphGenerator()
                graph_data = await generator.generate_from_course(
                    str(course_id),
                    progress_callback=progress_callback
                )

                if not graph_data["nodes"]:
                    await progress_queue.put({"type": "error", "message": "No concepts could be extracted."})
                    return

                # Save to database
                graph = KnowledgeGraph(
                    topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
                    course_id=course_id,
                    nodes=graph_data["nodes"],
                    edges=graph_data["edges"],
                    created_by=user.id
                )
                await graph.insert()

                session = StudySession(
                    graph_id=graph.id,
                    student_id=user.id,
                    current_node_id=graph_data["nodes"][0]["id"] if graph_data["nodes"] else None,
                    visited_nodes=[graph_data["nodes"][0]["id"]] if graph_data["nodes"] else []
                )
                await session.insert()

                generation_time_ms = int((time.time() - start_time) * 1000)
                _safe_track_event(
                    "graph_generated", "graph", user.id, user.role,
                    graph_id=graph.id, session_id=session.id, course_id=course_id,
                    payload={
                        "node_count": len(graph_data["nodes"]),
                        "edge_count": len(graph_data["edges"]),
                        "generation_time_ms": generation_time_ms,
                        "source": "docs_stream",
                    },
                )

                await progress_queue.put({
                    "type": "complete",
                    "graph_id": str(graph.id),
                    "session_id": str(session.id),
                    "nodes_count": len(graph_data["nodes"]),
                    "edges_count": len(graph_data["edges"]),
                    "elapsed": round(time.time() - start_time, 1)
                })

            except Exception as e:
                import traceback
                print(f"  SSE pipeline error:\n{traceback.format_exc()}")
                _safe_track_event(
                    "graph_generation_failed", "graph", user.id, user.role,
                    payload={"topic": "course_documents", "error": str(e)},
                )
                await progress_queue.put({"type": "error", "message": str(e)})

        # Start the pipeline as a background task
        pipeline_task = asyncio.create_task(run_pipeline())

        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    pipeline_task.cancel()
                    break

                try:
                    event = await asyncio.wait_for(progress_queue.get(), timeout=2.0)
                except asyncio.TimeoutError:
                    # Send a keepalive comment to prevent proxy/browser timeouts
                    yield ": keepalive\n\n"
                    continue

                event_type = event.pop("type", "progress")
                yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"

                if event_type in ("complete", "error"):
                    break
        except asyncio.CancelledError:
            pipeline_task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/{graph_id}")
async def get_graph(
    graph_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Get a knowledge graph by ID."""
    graph = await KnowledgeGraph.get(graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    return {
        "id": str(graph.id),
        "topic": graph.topic,
        "nodes": graph.nodes,
        "edges": graph.edges,
        "created_at": graph.created_at.isoformat()
    }

@router.get("/course/{course_id}")
async def get_course_graphs(
    course_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Get all knowledge graphs for a course."""
    graphs = await KnowledgeGraph.find(
        KnowledgeGraph.course_id == course_id
    ).sort(-KnowledgeGraph.created_at).to_list()

    return [
        {
            "id": str(graph.id),
            "topic": graph.topic,
            "nodes": graph.nodes,
            "edges": graph.edges,
            "created_at": graph.created_at.isoformat(),
            "nodes_count": len(graph.nodes),
            "edges_count": len(graph.edges)
        }
        for graph in graphs
    ]


@router.get("/course/{course_id}/status")
async def get_course_graph_status(
    course_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Check if a knowledge graph exists for a course.

    This endpoint is designed for frontend polling after document upload.
    Returns the graph data if it exists, or a "pending" status if not.
    """
    from app.models.document import DocumentModel

    # Check if a graph already exists
    graph = await KnowledgeGraph.find_one(
        KnowledgeGraph.course_id == course_id
    ).sort(-KnowledgeGraph.created_at).first_or_none()

    if graph:
        return {
            "status": "ready",
            "graph_id": str(graph.id),
            "nodes_count": len(graph.nodes),
            "edges_count": len(graph.edges),
            "created_at": graph.created_at.isoformat(),
        }

    # Check if documents are still processing
    pending_count = await DocumentModel.find(
        DocumentModel.course_id == course_id,
        DocumentModel.status == "pending"
    ).count()

    processing_count = await DocumentModel.find(
        DocumentModel.course_id == course_id,
        DocumentModel.status == "processing"
    ).count()

    total_docs = await DocumentModel.find(
        DocumentModel.course_id == course_id
    ).count()

    if pending_count > 0 or processing_count > 0:
        return {
            "status": "processing",
            "total_documents": total_docs,
            "pending_documents": pending_count,
            "processing_documents": processing_count,
        }

    # No graph, no pending docs   user hasn't uploaded anything yet
    return {
        "status": "no_documents",
        "total_documents": total_docs,
    }
