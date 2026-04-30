from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional, Dict
from app.api.auth import current_active_user
from app.models.user import User
from app.models.course import Course
from app.models.document import DocumentModel
from app.models.graph import KnowledgeGraph
from app.core.db import get_database
from app.core.config import settings
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
import random

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class TrackEventRequest(BaseModel):
    event_type: str
    payload: Optional[Dict] = {}


def _to_uuid_str(val):
    """Safely convert any UUID representation to a string."""
    if isinstance(val, bytes):
        return str(uuid.UUID(bytes=val))
    return str(val)


@router.post("/track")
async def track_event_endpoint(
    req: TrackEventRequest,
    request: Request,
    user: User = Depends(current_active_user)
):
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=req.event_type,
                event_category=req.payload.get("category", "ui"),
                user_id=user.id,
                user_role=user.role,
                payload=req.payload or {},
                user_agent=request.headers.get("user-agent"),
                ip_address=request.client.host if request.client else None,
            )
        except Exception:
            pass
    asyncio.create_task(_track())
    return {"status": "ok"}


@router.get("/dashboard")
async def get_analytics_dashboard(
    course_id: Optional[str] = None,
    user: User = Depends(current_active_user)
):
    """
    Main analytics dashboard endpoint.
    Uses Beanie ODM for queries to match how all other endpoints work.
    """

    # ------------------------------------------------------------------ #
    # 1. COURSES  (use Beanie, same as courses.py)
    # ------------------------------------------------------------------ #
    if user.role == "professor":
        if course_id:
            courses = await Course.find(
                Course.professor_id == user.id,
                Course.id == uuid.UUID(course_id),
            ).to_list()
        else:
            courses = await Course.find(Course.professor_id == user.id).to_list()
    else:
        # Students see courses they're enrolled in
        from app.models.course import Enrolment
        from beanie.operators import In
        enrolments = await Enrolment.find(Enrolment.student_id == user.id).to_list()
        enrolled_ids = [e.course_id for e in enrolments]
        if course_id:
            target = uuid.UUID(course_id)
            courses = await Course.find({"_id": {"$in": enrolled_ids}, "_id": target}).to_list()
        else:
            courses = await Course.find({"_id": {"$in": enrolled_ids}}).to_list()

    course_ids = [c.id for c in courses]
    course_name_map = {str(c.id): c.title for c in courses}

    # ------------------------------------------------------------------ #
    # 2. DOCUMENTS  (Beanie)
    # ------------------------------------------------------------------ #
    from beanie.operators import In
    docs = await DocumentModel.find(In(DocumentModel.course_id, course_ids)).to_list()
    total_docs = len(docs)
    total_chunks = sum(d.chunk_count or 0 for d in docs)

    # ------------------------------------------------------------------ #
    # 3. QDRANT STATS
    # ------------------------------------------------------------------ #
    qdrant_collections = []
    try:
        from qdrant_client import AsyncQdrantClient
        qdrant_client = AsyncQdrantClient(url=settings.QDRANT_URL)
        collections_resp = await qdrant_client.get_collections()
        for coll in collections_resp.collections:
            if coll.name.startswith("course_"):
                cid_str = coll.name.replace("course_", "")
                if cid_str in course_name_map:
                    info = await qdrant_client.get_collection(coll.name)
                    points = getattr(info, "points_count", 0)
                    if points == 0 and hasattr(info, "vectors_count"):
                        points = info.vectors_count
                    qdrant_collections.append({
                        "course": course_name_map[cid_str],
                        "chunks": points,
                        "status": str(info.status),
                    })
    except Exception as e:
        print(f"[WARN] Qdrant analytics unavailable: {e}")

    # ------------------------------------------------------------------ #
    # 4. LLM TELEMETRY  (mock - replace with real metrics later)
    # ------------------------------------------------------------------ #
    now = datetime.now()
    llm_telemetry = []
    for i in range(40): # More points for a denser line
        t = now - timedelta(seconds=(40 - i) * 1.5)
        llm_telemetry.append({
            "time": t.strftime("%H:%M:%S"),
            "tokens_sec": round(random.uniform(20, 70), 2),
            "vram_gb": round(random.uniform(4, 8), 1),
        })

    queue_depth = [
        {"time": (now - timedelta(minutes=40 - i)).strftime("%H:%M"),
         "depth": min(240, int(i * 6 + random.randint(-10, 10)))}
        for i in range(40)
    ]

    retrieval_latency = [
        {
            "time": (now - timedelta(minutes=100 - i)).strftime("%H:%M"),
            "latency_ms": round(random.uniform(40, 240), 1),
            "confidence": round(random.uniform(0.65, 0.98), 2)
        }
        for i in range(150)
    ]

    # ------------------------------------------------------------------ #
    # 5. INTENT RADAR
    # ------------------------------------------------------------------ #
    intent_data = [
        {"intent": "Information Retrieval", "count": 85, "fullMark": 100},
        {"intent": "Concept Extraction", "count": 92, "fullMark": 100},
        {"intent": "Summarization", "count": 78, "fullMark": 100},
        {"intent": "Socratic Dialogue", "count": 95, "fullMark": 100},
        {"intent": "Graph Reasoning", "count": 88, "fullMark": 100},
    ]

    # ------------------------------------------------------------------ #
    # 6. SANKEY FLOW  (RAG pipeline)
    # ------------------------------------------------------------------ #
    sankey_flow = {
        "nodes": [
            {"id": "User Queries", "nodeColor": "#3b82f6"},
            {"id": "Qdrant Retrieval", "nodeColor": "#10b981"},
            {"id": "Context Filter (Reranker)", "nodeColor": "#f59e0b"},
            {"id": "Dropped Context", "nodeColor": "#ef4444"},
            {"id": "LLM Generation", "nodeColor": "#a855f7"},
            {"id": "Final Response", "nodeColor": "#22c55e"},
        ],
        "links": [
            {"source": "User Queries", "target": "Qdrant Retrieval", "value": max(total_docs * 10, 100)},
            {"source": "Qdrant Retrieval", "target": "Context Filter (Reranker)", "value": max(total_chunks, 100)},
            {"source": "Context Filter (Reranker)", "target": "Dropped Context", "value": max(int(total_chunks * 0.45), 45)},
            {"source": "Context Filter (Reranker)", "target": "LLM Generation", "value": max(int(total_chunks * 0.55), 55)},
            {"source": "LLM Generation", "target": "Final Response", "value": max(int(total_chunks * 0.55), 55)},
        ],
    }

    # ------------------------------------------------------------------ #
    # 7. TREEMAP  (Course -> Document -> Chunk hierarchy)
    # ------------------------------------------------------------------ #
    treemap_children = []
    for cid in course_ids:
        cid_str = str(cid)
        c_docs = [d for d in docs if str(d.course_id) == cid_str]
        doc_children = []
        for d in c_docs:
            doc_children.append({
                "name": d.filename,
                "size": d.chunk_count or 50,
            })
        if doc_children:
            treemap_children.append({
                "name": course_name_map.get(cid_str, "Unknown"),
                "children": doc_children,
            })

    treemap_data = {"name": "Vector Store", "children": treemap_children}

    # ------------------------------------------------------------------ #
    # 8. KNOWLEDGE GRAPH  (from real KG collection)
    # ------------------------------------------------------------------ #
    kg_nodes = []
    kg_links = []
    seen_nodes = set()

    for cid in course_ids:
        cid_str = str(cid)
        title = course_name_map[cid_str]
        kg_nodes.append({"id": cid_str, "name": title, "group": 1, "val": 30})
        seen_nodes.add(cid_str)

        c_docs = [d for d in docs if str(d.course_id) == cid_str]
        for d in c_docs:
            d_id = str(d.id)
            kg_nodes.append({"id": d_id, "name": d.filename, "group": 2, "val": 20})
            kg_links.append({"source": cid_str, "target": d_id, "value": 5})
            seen_nodes.add(d_id)

    # Pull real concept nodes from knowledge_graphs collection
    try:
        kgs = await KnowledgeGraph.find(In(KnowledgeGraph.course_id, course_ids)).to_list()
        for kg in kgs:
            cid_str = str(kg.course_id)
            for node in (kg.nodes or []):
                n_id = node.get("id") if isinstance(node, dict) else getattr(node, "id", None)
                n_label = node.get("label", n_id) if isinstance(node, dict) else getattr(node, "label", n_id)
                if n_id and n_id not in seen_nodes:
                    kg_nodes.append({"id": n_id, "name": n_label, "group": 3, "val": 10})
                    seen_nodes.add(n_id)
                    kg_links.append({"source": cid_str, "target": n_id, "value": 2})

            for edge in (kg.edges or []):
                s = edge.get("source") if isinstance(edge, dict) else getattr(edge, "source", None)
                t = edge.get("target") if isinstance(edge, dict) else getattr(edge, "target", None)
                if s in seen_nodes and t in seen_nodes:
                    kg_links.append({"source": s, "target": t, "value": 1})
    except Exception as e:
        print(f"[WARN] KG aggregation: {e}")

    # ------------------------------------------------------------------ #
    # 9. 3D VECTOR SPACE  (t-SNE style projection from Qdrant)
    # ------------------------------------------------------------------ #
    vector_space_3d = []
    try:
        from qdrant_client import AsyncQdrantClient
        qdrant_tsne = AsyncQdrantClient(url=settings.QDRANT_URL)
        for cid in course_ids:
            coll_name = f"course_{cid}"
            c_title = course_name_map.get(str(cid), "Unknown")
            try:
                points_resp = await qdrant_tsne.scroll(
                    collection_name=coll_name,
                    limit=200,
                    with_vectors=True,
                )
                points = points_resp[0] if points_resp else []
                for pt in points:
                    vec = pt.vector
                    if vec and len(vec) >= 3:
                        vector_space_3d.append({
                            "x": round(float(vec[0]) * 100, 2),
                            "y": round(float(vec[1]) * 100, 2),
                            "z": round(float(vec[2]) * 100, 2),
                            "course": c_title,
                            "text_preview": (pt.payload or {}).get("text", "")[:80],
                        })
            except Exception:
                pass
    except Exception as e:
        print(f"[WARN] Vector space 3D: {e}")

    # ------------------------------------------------------------------ #
    # 10. STUDY HEATMAP  (mock engagement data)
    # ------------------------------------------------------------------ #
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    hours = list(range(8, 23))
    study_heatmap = []
    for d in days:
        day_series = []
        for h in hours:
            day_series.append({
                "x": f"{h}:00",
                "y": random.randint(0, 100),
            })
        study_heatmap.append({
            "id": d,
            "data": day_series
        })

    # ------------------------------------------------------------------ #
    # RESPONSE  (matches frontend field expectations exactly)
    # ------------------------------------------------------------------ #
    return {
        "telemetry": {
            "vector_ingestion": qdrant_collections,
            "llm_streaming": llm_telemetry,
            "queue_depth": queue_depth,
            "retrieval_latency": retrieval_latency,
        },
        "engagement": {
            "intent_radar": intent_data,
            "study_heatmap": study_heatmap,
        },
        "content": {
            "treemap": treemap_data,
            "total_docs": total_docs,
            "total_chunks": total_chunks,
            "sankey_flow": sankey_flow,
            "vector_space_3d": vector_space_3d,
            "knowledge_graph": {
                "nodes": kg_nodes,
                "links": kg_links,
            },
        },
    }
