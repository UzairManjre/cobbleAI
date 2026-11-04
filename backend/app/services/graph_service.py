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
from app.utils.telemetry import safe_track_event

class GraphService:
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
            "nodes": graph.nodes_as_dicts(),
            "edges": graph.edges_as_dicts()
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
            # Documents still pending are processed by the Celery worker; the graph
            # is built from the documents that are ready now.
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
                "nodes": graph.nodes_as_dicts(),
                "edges": graph.edges_as_dicts(),
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
        """Server-Sent Events view of a background build (kept for older clients).

        The build runs as a Celery task (app/services/graph_build.py); this stream only follows
        it, so closing the connection no longer stops or duplicates anything.
        """
        from fastapi.responses import StreamingResponse
        import json
        from app.models.graph import GraphBuild
        from app.services import graph_build

        def frame(event_type: str, data: dict) -> str:
            return f"event: {event_type}\ndata: {json.dumps({'type': event_type, **data})}\n\n"

        async def event_generator():
            user = await User.get(user_id)
            course = await Course.get(course_id)
            if not user or not course or (user.role == "professor" and course.professor_id != user.id):
                yield frame("error", {"message": "Not your course"})
                return
            try:
                build, _ = await graph_build.start_build(course_id, user_id)
            except ValueError as e:
                yield frame("error", {"message": str(e)})
                return
            last, quiet = None, 0
            while True:
                current = await GraphBuild.get(build.id)
                current = await graph_build._expire_if_stale(current)
                data = graph_build.serialize_build(current)
                key = (data["step"], data["detail"], data["status"])
                if key != last:
                    last, quiet = key, 0
                    yield frame("progress", {"step": data["step"], "totalSteps": data["total_steps"],
                                             "message": data["message"], "detail": data["detail"],
                                             "elapsed": data["elapsed_s"] or 0})
                if data["status"] == "complete":
                    yield frame("complete", {"graph_id": data["graph_id"], "nodes_count": data["nodes_count"],
                                             "edges_count": data["edges_count"], "elapsed": data["elapsed_s"] or 0})
                    return
                if data["status"] in ("failed", "cancelled"):
                    yield frame("error", {"message": data["error"] or "The build was cancelled"})
                    return
                await asyncio.sleep(2)
                quiet += 2
                if quiet >= 14:  # keep proxies and browsers from closing an idle stream
                    quiet = 0
                    yield ": keep-alive\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    @staticmethod
    async def get_graph(graph_id: uuid.UUID, user: User) -> Dict[str, Any]:
        graph = await KnowledgeGraph.get(graph_id)
        if not graph:
            raise HTTPException(status_code=404, detail="Graph not found")

        if graph.course_id:
            from app.services.access import ensure_course_access
            await ensure_course_access(user, graph.course_id)
        elif graph.created_by != user.id:
            raise HTTPException(status_code=403, detail="Not your graph")

        return {
            "id": str(graph.id),
            "topic": graph.topic,
            "nodes": graph.nodes_as_dicts(),
            "edges": graph.edges_as_dicts(),
            "created_at": graph.created_at.isoformat()
        }

    @staticmethod
    async def get_course_graphs(course_id: uuid.UUID, user: User) -> List[Dict[str, Any]]:
        from app.services.access import ensure_course_access
        await ensure_course_access(user, course_id)

        graphs = await KnowledgeGraph.find(
            KnowledgeGraph.course_id == course_id
        ).sort(-KnowledgeGraph.created_at).to_list()
        return [
            {
                "id": str(graph.id),
                "topic": graph.topic,
                "nodes": graph.nodes_as_dicts(),
                "edges": graph.edges_as_dicts(),
                "created_at": graph.created_at.isoformat(),
                "nodes_count": len(graph.nodes),
                "edges_count": len(graph.edges)
            }
            for graph in graphs
        ]

    @staticmethod
    async def get_course_graph_status(course_id: uuid.UUID, user: User) -> Dict[str, Any]:
        from app.services.access import ensure_course_access
        await ensure_course_access(user, course_id)

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

        from app.services.graph_build import active_build, serialize_build
        build = await active_build(course_id)
        if build:
            progress = serialize_build(build)
            return {
                "status": "building",
                "build": {k: progress[k] for k in ("id", "status", "step", "total_steps", "message", "detail",
                                                   "percent", "eta_s", "elapsed_s", "waiting_for_worker")},
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
