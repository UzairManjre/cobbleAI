import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from app.models.user import User
from app.models.course import Course, Enrolment
from app.models.document import DocumentModel
from app.models.graph import KnowledgeGraph
from app.models.analytics.event import AnalyticsEvent
from app.models.analytics.llm_usage import AnalyticsLLMUsage
from app.models.tutor import TutorRun
from beanie.operators import In
from app.core.qdrant import qdrant_async  # shared singleton — no per-request instantiation
from app.core.qdrant import collection_name as qdrant_collection_name, legacy_collection_name


RETRIEVAL_STAGES = ("expansion", "embedding", "search", "rerank")
FUNNEL_COLORS = {
    "Questions": "#64748b", "Answered": "#10b981", "Declined": "#f59e0b", "Error": "#ef4444",
    "Strong support": "#059669", "Weak support": "#facc15", "No support": "#f97316",
}


async def answer_funnel(course_ids: List[uuid.UUID]) -> dict:
    """Questions -> answered/declined/error -> support level, counted from live tutor runs."""
    rows = await TutorRun.find(
        In(TutorRun.course_id, course_ids), TutorRun.eval_run == None, TutorRun.user_role == "student",  # noqa: E711
    ).aggregate([{"$group": {"_id": {"decision": "$decision", "support": "$support_level"}, "n": {"$sum": 1}}}]).to_list()
    decisions: dict = {}
    supports: dict = {}
    for row in rows:
        decision, support = row["_id"].get("decision"), row["_id"].get("support")
        name = {"answered": "Answered", "declined": "Declined"}.get(decision, "Error")
        decisions[name] = decisions.get(name, 0) + row["n"]
        if name == "Answered":
            label = {"strong": "Strong support", "weak": "Weak support"}.get(support, "No support")
            supports[label] = supports.get(label, 0) + row["n"]
    links = [{"source": "Questions", "target": k, "value": v} for k, v in decisions.items() if v > 0]
    links += [{"source": "Answered", "target": k, "value": v} for k, v in supports.items() if v > 0]
    used = {"Questions"} | {link["target"] for link in links}
    nodes = [{"id": n, "nodeColor": FUNNEL_COLORS[n]} for n in FUNNEL_COLORS if n in used] if links else []
    return {"nodes": nodes, "links": links}


async def struggling_concepts(courses: List[Course], per_course: int = 5) -> List[dict]:
    from app.services.learner.confusion_model import score_course
    flags = []
    for course in courses:
        try:
            scored = await score_course(course.id)
        except Exception as e:
            import logging
            logging.error(f"Concept flags failed for course {course.id}: {e}")
            continue
        for concept in [c for c in scored["concepts"] if c.get("flagged")][:per_course]:
            flags.append({
                "course_id": str(course.id), "course": course.title, "node_id": concept["node_id"],
                "label": concept.get("label") or concept["node_id"], "probability": concept.get("probability"),
                "method": scored["method"],
                "reasons": [s["label"] for s in concept.get("signals", []) if s.get("contribution", 0) > 0][:3],
            })
    return flags


def _course_of(collection: str) -> str:
    """course_<id> or course_<id>_v2 -> <id>"""
    return collection.removeprefix("course_").removesuffix("_v2")

class DashboardAnalyticsService:
    @staticmethod
    async def get_dashboard(user: User, course_id: Optional[str] = None):
        # 1. COURSES
        if user.role == "professor":
            if course_id:
                courses = await Course.find(
                    Course.professor_id == user.id,
                    Course.id == uuid.UUID(course_id)
                ).to_list()
            else:
                courses = await Course.find(Course.professor_id == user.id).to_list()
        else:
            enrolments = await Enrolment.find(Enrolment.student_id == user.id).to_list()
            enrolled_ids = [e.course_id for e in enrolments]
            if course_id:
                wanted = uuid.UUID(course_id)
                enrolled_ids = [cid for cid in enrolled_ids if cid == wanted]
            courses = await Course.find(In(Course.id, enrolled_ids)).to_list() if enrolled_ids else []

        course_ids = [c.id for c in courses]
        course_name_map = {str(c.id): c.title for c in courses}

        # 2. DOCUMENTS
        docs = await DocumentModel.find(In(DocumentModel.course_id, course_ids)).to_list()
        total_docs = len(docs)
        total_chunks = sum(d.chunk_count or 0 for d in docs)

        # 3. QDRANT STATS — batch fetch to avoid N+1 sequential get_collection calls
        qdrant_collections = []
        try:
            collections_resp = await qdrant_async.get_collections()
            # Filter to only collections belonging to this user's courses
            relevant = [
                coll for coll in collections_resp.collections
                if coll.name.startswith("course_")
                and _course_of(coll.name) in course_name_map
            ]
            if relevant:
                # Single concurrent batch — one gather instead of N sequential awaits
                infos = await asyncio.gather(
                    *[qdrant_async.get_collection(coll.name) for coll in relevant],
                    return_exceptions=True,
                )
                for coll, info in zip(relevant, infos):
                    if isinstance(info, Exception):
                        import logging
                        logging.error(f"Qdrant get_collection failed for {coll.name}: {info}")
                        continue
                    cid_str = _course_of(coll.name)
                    points = getattr(info, "points_count", 0)
                    if points == 0 and hasattr(info, "vectors_count"):
                        points = info.vectors_count
                    qdrant_collections.append({
                        "course": course_name_map[cid_str] + (" (v2)" if coll.name.endswith("_v2") else ""),
                        "chunks": points,
                        "status": str(info.status),
                    })
        except Exception as e:
            import logging
            logging.error(f"Qdrant stats error: {e}")

        # 4. LLM / RETRIEVAL TELEMETRY — measured values only; empty lists mean "not measured yet"
        llm_telemetry = []
        retrieval_latency = []
        try:
            llm_calls = await AnalyticsLLMUsage.find().sort(-AnalyticsLLMUsage.timestamp).limit(40).to_list()
            for call in reversed(llm_calls):
                seconds = (call.latency_ms or 0) / 1000
                llm_telemetry.append({
                    "time": call.timestamp.strftime("%H:%M:%S"),
                    "tokens_sec": round(call.estimated_output_tokens / seconds, 2) if seconds > 0 else None,
                    "vram_gb": None,  # not measured
                })
            if course_ids:
                # Live tutor runs (v2); each logs per-stage retrieval timings and the top support score
                tutor_runs = await TutorRun.find(
                    In(TutorRun.course_id, course_ids), TutorRun.eval_run == None,  # noqa: E711
                ).sort(-TutorRun.created_at).limit(150).to_list()
                for run in reversed(tutor_runs):
                    stages = [run.latency_ms.get(k) for k in RETRIEVAL_STAGES if run.latency_ms.get(k) is not None]
                    retrieval_latency.append({
                        "time": run.created_at.strftime("%H:%M"),
                        "latency_ms": sum(stages) if stages else run.latency_ms.get("prepare"),
                        "confidence": round(run.top_support, 2),
                    })
        except Exception as e:
            import logging
            logging.error(f"Telemetry query error: {e}")

        # Celery queue depth is not instrumented yet
        queue_depth = []

        # 5. INTENT RADAR
        real_teach_count = real_test_count = real_review_count = real_rag_count = real_total_chats = 0
        try:
            # Run all 5 count queries in parallel — one MongoDB round-trip each, all concurrent
            (
                real_teach_count,
                real_test_count,
                real_review_count,
                real_rag_count,
                real_total_chats,
            ) = await asyncio.gather(
                AnalyticsEvent.find(
                    In(AnalyticsEvent.course_id, course_ids),
                    AnalyticsEvent.event_type == "chat_standalone_sent",
                    {"payload.mode": "teach"}
                ).count(),
                AnalyticsEvent.find(
                    In(AnalyticsEvent.course_id, course_ids),
                    AnalyticsEvent.event_type == "chat_standalone_sent",
                    {"payload.mode": "test"}
                ).count(),
                AnalyticsEvent.find(
                    In(AnalyticsEvent.course_id, course_ids),
                    AnalyticsEvent.event_type == "chat_standalone_sent",
                    {"payload.mode": "review"}
                ).count(),
                AnalyticsEvent.find(
                    In(AnalyticsEvent.course_id, course_ids),
                    AnalyticsEvent.event_type == "rag_query"
                ).count(),
                AnalyticsEvent.find(
                    In(AnalyticsEvent.course_id, course_ids),
                    AnalyticsEvent.event_type == "chat_standalone_sent"
                ).count(),
            )
        except Exception as e:
            import logging
            logging.error(f"Analytics count error: {e}")

        general_chats = max(real_total_chats - (real_teach_count + real_test_count + real_review_count), 0)
        intent_data = [
            {"intent": "Socratic Dialogue", "count": real_teach_count, "fullMark": 100},
            {"intent": "Concept Extraction", "count": real_review_count, "fullMark": 100},
            {"intent": "Quiz & Test Mode", "count": real_test_count, "fullMark": 100},
            {"intent": "Document Search (RAG)", "count": real_rag_count, "fullMark": 100},
            {"intent": "General Q&A", "count": general_chats, "fullMark": 100},
        ]

        # 6. SANKEY FLOW — what happened to student questions: answered (by support) or declined
        sankey_flow = {"nodes": [], "links": []}
        try:
            if course_ids:
                sankey_flow = await answer_funnel(course_ids)
        except Exception as e:
            import logging
            logging.error(f"Answer funnel failed: {e}")

        # 6b. CONCEPTS STUDENTS STRUGGLE WITH — flags with the signals behind them (professors only)
        confusion_flags = []
        if user.role == "professor":
            confusion_flags = await struggling_concepts(courses[:5])

        # 7. TREEMAP
        treemap_children = []
        for cid in course_ids:
            cid_str = str(cid)
            c_docs = [d for d in docs if str(d.course_id) == cid_str]
            doc_children = [{"name": d.filename, "size": d.chunk_count} for d in c_docs if d.chunk_count]
            if doc_children:
                treemap_children.append({
                    "name": course_name_map.get(cid_str, "Unknown"),
                    "children": doc_children,
                })
        treemap_data = {"name": "Vector Store", "children": treemap_children}

        # 8. KNOWLEDGE GRAPH
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

        try:
            kgs = await KnowledgeGraph.find(In(KnowledgeGraph.course_id, course_ids)).to_list()
            for kg in kgs:
                cid_str = str(kg.course_id)
                for node in kg.nodes_as_dicts():
                    n_id = node["id"]
                    if n_id and n_id not in seen_nodes:
                        kg_nodes.append({
                            "id": n_id,
                            "name": node["label"] or n_id,
                            "group": 3,
                            "val": 10,
                            "description": node["description"],
                            "category": node["category"] or "",
                            "source_docs": node["source_docs"],
                            "difficulty": node["difficulty"] or "",
                        })
                        seen_nodes.add(n_id)
                        kg_links.append({"source": cid_str, "target": n_id, "value": 2})

                for edge in kg.edges_as_dicts():
                    src, tgt = edge["from"], edge["to"]
                    if src in seen_nodes and tgt in seen_nodes:
                        kg_links.append({"source": src, "target": tgt, "value": 1})
        except Exception as e:
            import logging
            logging.error(f"Dashboard section failed: {e}")

        # 9. 3D VECTOR SPACE — batch scroll across all course collections in parallel
        vector_space_3d = []
        if course_ids:
            async def _scroll_course(cid: uuid.UUID) -> list:
                coll_name = qdrant_collection_name(str(cid))
                if not await qdrant_async.collection_exists(coll_name):
                    coll_name = legacy_collection_name(str(cid))
                c_title = course_name_map.get(str(cid), "Unknown")
                try:
                    points_resp = await qdrant_async.scroll(
                        collection_name=coll_name,
                        limit=200,
                        with_vectors=True,
                    )
                    points = points_resp[0] if points_resp else []
                    result = []
                    for pt in points:
                        vec = pt.vector
                        if isinstance(vec, dict):
                            vec = vec.get("dense")
                        if vec and len(vec) >= 3:
                            result.append({
                                "x": round(float(vec[0]) * 100, 2),
                                "y": round(float(vec[1]) * 100, 2),
                                "z": round(float(vec[2]) * 100, 2),
                                "course": c_title,
                                "text_preview": (pt.payload or {}).get("text", "")[:80],
                            })
                    return result
                except Exception as e:
                    import logging
                    logging.error(f"Vector space scroll failed for course {cid}: {e}")
                    return []

            scroll_results = await asyncio.gather(
                *[_scroll_course(cid) for cid in course_ids],
                return_exceptions=False,
            )
            for batch in scroll_results:
                vector_space_3d.extend(batch)

        # 10. STUDY HEATMAP
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        hours = list(range(8, 23))
        heatmap_matrix = {d: {h: 0 for h in hours} for d in days}
        
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            events_cursor = await AnalyticsEvent.find(
                In(AnalyticsEvent.course_id, course_ids),
                AnalyticsEvent.timestamp >= cutoff
            ).to_list()
            for ev in events_cursor:
                dt = ev.timestamp
                day_name = dt.strftime("%a")
                hour = dt.hour
                if day_name in heatmap_matrix and hour in heatmap_matrix[day_name]:
                    heatmap_matrix[day_name][hour] += 1
        except Exception as e:
            import logging
            logging.error(f"Dashboard section failed: {e}")
            
        study_heatmap = []
        for d in days:
            day_series = []
            for h in hours:
                day_series.append({"x": f"{h}:00", "y": heatmap_matrix[d][h]})
            study_heatmap.append({"id": d, "data": day_series})

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
                "confusion_flags": confusion_flags,
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
