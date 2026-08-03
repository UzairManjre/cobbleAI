import uuid
import time
import asyncio
from typing import Dict, Any, Optional, List
from fastapi import HTTPException
from app.models.graph import KnowledgeGraph, StudySession
from app.models.user import User
from app.models.course import Course
from app.services.graph_generator import GraphGenerator
from app.services.advanced_graph_generator import AdvancedGraphGenerator
from app.core.config import settings
from app.utils.telemetry import safe_track_event
import redis

class GraphService:
    @staticmethod
    async def generate_graph_for_course(course_id: str):
        """Auto-generate knowledge graph from course documents after processing."""
        try:
            redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            lock_key = f"graph_gen_lock:{course_id}"
            acquired = redis_client.set(lock_key, "1", nx=True, ex=600)

            if not acquired:
                return

            try:
                course_uuid = uuid.UUID(course_id) if isinstance(course_id, str) else course_id
                existing_graph = await KnowledgeGraph.find_one(
                    KnowledgeGraph.course_id == course_uuid
                ).to_list()

                if existing_graph:
                    return

                await asyncio.sleep(2)
                generator = AdvancedGraphGenerator()
                graph_data = await generator.generate_from_course(str(course_uuid))

                if not graph_data["nodes"]:
                    return

                graph = KnowledgeGraph(
                    topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
                    course_id=course_uuid,
                    nodes=graph_data["nodes"],
                    edges=graph_data["edges"],
                    created_by=course_uuid
                )
                await graph.insert()
            finally:
                redis_client.delete(lock_key)
        except Exception as e:
            print(f"Auto graph generation failed: {e}")

    @staticmethod
    async def generate_graph(topic: str, user: User, course_id: Optional[uuid.UUID] = None) -> Dict[str, Any]:
        start_time = time.time()
        generator = GraphGenerator()

        safe_track_event(
            "graph_generation_started", "graph", user.id, user.role,
            payload={"topic": topic, "source": "topic", "course_id": str(course_id) if course_id else None},
        )

        try:
            is_course_uuid = False
            try:
                topic_uuid = uuid.UUID(topic)
                course = await Course.get(topic_uuid)
                if course:
                    if user.role == "professor" and course.professor_id != user.id:
                        raise HTTPException(status_code=403, detail="Not your course")
                    is_course_uuid = True
                    course_id = topic_uuid
            except ValueError:
                pass
            except HTTPException as e:
                raise e

            if is_course_uuid or course_id:
                adv_generator = AdvancedGraphGenerator()
                graph_data = await adv_generator.generate_from_course(str(course_id or topic))
            else:
                graph_data = await generator.generate_graph(topic)
        except HTTPException as e:
            safe_track_event(
                "graph_generation_failed", "graph", user.id, user.role,
                payload={"topic": topic, "error": str(e)},
            )
            raise e
        except Exception as e:
            safe_track_event(
                "graph_generation_failed", "graph", user.id, user.role,
                payload={"topic": topic, "error": str(e)},
            )
            raise HTTPException(status_code=500, detail=f"Graph generation failed: {str(e)}")

        graph = KnowledgeGraph(
            topic=topic,
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
        safe_track_event(
            "graph_generated", "graph", user.id, user.role,
            graph_id=graph.id,
            session_id=session.id,
            payload={
                "node_count": len(graph_data["nodes"]),
                "edge_count": len(graph_data["edges"]),
                "generation_time_ms": generation_time_ms,
                "topic": topic,
            },
        )

        return {
            "graph_id": str(graph.id),
            "session_id": str(session.id),
            "nodes": graph_data["nodes"],
            "edges": graph_data["edges"]
        }

    @staticmethod
    async def generate_graph_from_docs(course_id: uuid.UUID, user: User) -> Dict[str, Any]:
        start_time = time.time()
        
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if user.role == "professor" and course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")

        safe_track_event(
            "graph_generation_started", "graph", user.id, user.role,
            payload={"topic": "course_documents", "source": "docs", "course_id": str(course_id)},
        )

        try:
            from app.models.document import DocumentModel
            from app.services.document_service import DocumentService
            
            pending_docs = await DocumentModel.find(
                DocumentModel.course_id == course_id,
                DocumentModel.status == "pending"
            ).to_list()

            if pending_docs:
                for doc in pending_docs:
                    loop = asyncio.get_event_loop()
                    from concurrent.futures import ThreadPoolExecutor
                    executor = ThreadPoolExecutor(max_workers=1)
                    await loop.run_in_executor(executor, DocumentService.process_document_sync, str(doc.id))
                    executor.shutdown(wait=False)

            generator = AdvancedGraphGenerator()
            graph_data = await generator.generate_from_course(str(course_id))

            if not graph_data["nodes"]:
                raise HTTPException(status_code=500, detail="Failed to generate graph from documents. No concepts could be extracted.")

            graph = KnowledgeGraph(
                topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
                course_id=course_id,
                nodes=graph_data["nodes"],
                edges=graph_data["edges"],
                created_by=user.id
            )
            await graph.insert()
            graph._source_docs = graph_data.get("_source_docs", [])

            session = StudySession(
                graph_id=graph.id,
                student_id=user.id,
                current_node_id=graph_data["nodes"][0]["id"] if graph_data["nodes"] else None,
                visited_nodes=[graph_data["nodes"][0]["id"]] if graph_data["nodes"] else []
            )
            await session.insert()

            generation_time_ms = int((time.time() - start_time) * 1000)
            safe_track_event(
                "graph_generated", "graph", user.id, user.role,
                graph_id=graph.id,
                session_id=session.id,
                course_id=course_id,
                payload={
                    "node_count": len(graph_data["nodes"]),
                    "edge_count": len(graph_data["edges"]),
                    "generation_time_ms": generation_time_ms,
                    "source": "docs",
                    "source_docs_count": len(graph_data.get("_source_docs", [])),
                },
            )

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
            safe_track_event("graph_generation_failed", "graph", user.id, user.role, payload={"topic": "course_documents", "source": "docs", "error": str(e)})
            raise HTTPException(status_code=400, detail=str(e))
        except HTTPException as e:
            safe_track_event("graph_generation_failed", "graph", user.id, user.role, payload={"topic": "course_documents", "source": "docs", "error": str(e)})
            raise e
        except Exception as e:
            safe_track_event("graph_generation_failed", "graph", user.id, user.role, payload={"topic": "course_documents", "source": "docs", "error": str(e)})
            raise HTTPException(status_code=500, detail=f"Graph generation failed: {str(e)}")

    @staticmethod
    async def generate_graph_from_docs_stream(course_id: uuid.UUID, user_id: uuid.UUID):
        from fastapi.responses import StreamingResponse
        import json
        
        async def event_generator():
            q = asyncio.Queue()
            
            async def progress_callback(step: int, total_steps: int, message: str, detail: str = ""):
                await q.put({
                    "type": "progress",
                    "step": step,
                    "totalSteps": total_steps,
                    "message": message,
                    "detail": detail,
                    "elapsed": 0
                })

            async def run_generator():
                try:
                    user = await User.get(user_id)
                    if not user:
                        await q.put({"type": "error", "message": "User not found"})
                        return
                    course = await Course.get(course_id)
                    if not course or (user.role == "professor" and course.professor_id != user.id):
                        await q.put({"type": "error", "message": "Not your course"})
                        return
                    
                    adv_generator = AdvancedGraphGenerator()
                    graph_data = await adv_generator.generate_from_course(str(course_id), progress_callback=progress_callback)
                    
                    graph = KnowledgeGraph(
                        topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
                        course_id=course_id,
                        nodes=graph_data["nodes"],
                        edges=graph_data["edges"],
                        created_by=user_id
                    )
                    await graph.insert()
                    
                    session = StudySession(
                        graph_id=graph.id,
                        student_id=user_id,
                        current_node_id=graph_data["nodes"][0]["id"] if graph_data["nodes"] else None,
                        visited_nodes=[graph_data["nodes"][0]["id"]] if graph_data["nodes"] else []
                    )
                    await session.insert()
                    
                    await q.put({
                        "type": "complete",
                        "graph_id": str(graph.id),
                        "session_id": str(session.id),
                        "nodes_count": len(graph_data["nodes"]),
                        "edges_count": len(graph_data["edges"]),
                        "elapsed": 0
                    })
                except Exception as e:
                    await q.put({"type": "error", "message": str(e)})
                finally:
                    await q.put(None)

            task = asyncio.create_task(run_generator())
            
            while True:
                try:
                    # Wait for an event, but timeout every 15s to send a keep-alive
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    if event is None:
                        break
                    
                    # Format as Server-Sent Event with event type
                    event_type = event.get("type", "message")
                    yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Send a keep-alive ping to prevent proxy/browser timeouts
                    yield ": keep-alive\n\n"
                
            await task

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    @staticmethod
    async def get_graph(graph_id: uuid.UUID, user: User) -> Dict[str, Any]:
        graph = await KnowledgeGraph.get(graph_id)
        if not graph:
            raise HTTPException(status_code=404, detail="Graph not found")

        if graph.course_id:
            course = await Course.get(graph.course_id)
            if user.role == "professor" and (not course or course.professor_id != user.id):
                raise HTTPException(status_code=403, detail="Not your course's graph")

        return {
            "id": str(graph.id),
            "topic": graph.topic,
            "nodes": graph.nodes,
            "edges": graph.edges,
            "created_at": graph.created_at.isoformat()
        }

    @staticmethod
    async def get_course_graphs(course_id: uuid.UUID, user: User) -> List[Dict[str, Any]]:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if user.role == "professor" and course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")

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

    @staticmethod
    async def get_course_graph_status(course_id: uuid.UUID, user: User) -> Dict[str, Any]:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if user.role == "professor" and course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")

        from app.models.document import DocumentModel

        graph = await KnowledgeGraph.find(
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

        return {
            "status": "no_documents",
            "total_documents": total_docs,
        }
