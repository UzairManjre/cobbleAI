"""Concept-map builds as background jobs with saved progress.

A build used to run inside the professor's browser connection: dismissing the progress dialog
or leaving the page hid it, and every click on "Regenerate Graph" started another build. Now a
build is a GraphBuild document worked by a Celery task, so:

- any page can show its progress (course page, map page, a student waiting for the map);
- asking again while one is queued or running joins that build instead of starting a second;
- a course's first map is built automatically once all of its materials are processed;
- a build whose worker died is reported as interrupted instead of spinning forever.
"""

import asyncio
import traceback
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from beanie.operators import In

from app.core.config import settings
from app.models.course import Course, Enrolment
from app.models.document import DocumentModel
from app.models.graph import BuildEvent, GraphBuild, KnowledgeGraph, StudySession

ACTIVE = ("queued", "running")
STALE_AFTER = timedelta(minutes=5)  # a running build whose heartbeat is older than this has lost its worker
HEARTBEAT_EVERY_S = 30
SLOW_START_AFTER = timedelta(minutes=1)  # still queued after this: probably no media worker is running
MAX_EVENTS = 40
INTERRUPTED = "Interrupted: the worker stopped during the build. Start it again."


class BuildCancelled(Exception):
    """Raised from the progress callback when the professor cancels a running build."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


#   Progress as the UI shows it

def build_percent(build: GraphBuild) -> int:
    """Concept extraction is almost all of the time, so it gets most of the bar."""
    if build.status == "complete":
        return 100
    if build.step <= 0:
        return 0
    if build.step == 3:
        done = build.chunks_done / build.chunks_total if build.chunks_total else 0.0
        return int(5 + 80 * done)
    return {1: 2, 2: 4, 4: 86, 5: 90}.get(build.step, 96)


def eta_seconds(build: GraphBuild, now: Optional[datetime] = None) -> Optional[int]:
    """Time left, from the average time per chunk so far; unknown until one chunk is done."""
    started = _aware(build.extract_started_at)
    if build.status != "running" or build.step != 3 or not build.chunks_done or not started:
        return None
    per_chunk = ((now or _now()) - started).total_seconds() / build.chunks_done
    # Enrichment and the provenance checks take about as long as one more chunk
    return int(per_chunk * (build.chunks_total - build.chunks_done + 1))


def serialize_build(build: GraphBuild, now: Optional[datetime] = None) -> dict:
    now = now or _now()
    started, finished = _aware(build.started_at), _aware(build.finished_at)
    queued_for = (now - _aware(build.created_at)) if build.status == "queued" else None
    return {
        "id": str(build.id),
        "course_id": str(build.course_id),
        "status": build.status,
        "trigger": build.trigger,
        "step": build.step,
        "total_steps": build.total_steps,
        "message": build.message,
        "detail": build.detail,
        "percent": build_percent(build),
        "sources": build.sources,
        "passages": build.passages,
        "chunks_total": build.chunks_total,
        "chunks_done": build.chunks_done,
        "concepts_found": build.concepts_found,
        "relations_found": build.relations_found,
        "events": [{"at": _aware(e.at).isoformat(), "message": e.message} for e in build.events[-10:]],
        "cancel_requested": build.cancel_requested,
        "graph_id": str(build.graph_id) if build.graph_id else None,
        "nodes_count": build.nodes_count,
        "edges_count": build.edges_count,
        "unsupported_edges": build.unsupported_edges,
        "error": build.error,
        "created_at": _aware(build.created_at).isoformat(),
        "started_at": started.isoformat() if started else None,
        "finished_at": finished.isoformat() if finished else None,
        "elapsed_s": int(((finished or now) - started).total_seconds()) if started else None,
        "eta_s": eta_seconds(build, now),
        "waiting_for_worker": queued_for is not None and queued_for > SLOW_START_AFTER,
    }


#   Finding builds

async def _expire_if_stale(build: GraphBuild) -> GraphBuild:
    if build.status != "running":
        return build
    beat = _aware(build.heartbeat_at or build.started_at or build.created_at)
    if _now() - beat <= STALE_AFTER:
        return build
    await GraphBuild.find_one({"_id": build.id, "status": "running"}).update({"$set": {
        "status": "failed", "error": INTERRUPTED, "message": "Interrupted", "finished_at": _now(),
    }})
    build.status, build.error, build.message, build.finished_at = "failed", INTERRUPTED, "Interrupted", _now()
    return build


async def latest_build(course_id: uuid.UUID) -> Optional[GraphBuild]:
    build = await GraphBuild.find(GraphBuild.course_id == course_id).sort(-GraphBuild.created_at).first_or_none()
    return await _expire_if_stale(build) if build else None


async def active_build(course_id: uuid.UUID) -> Optional[GraphBuild]:
    build = await latest_build(course_id)
    return build if build and build.status in ACTIVE else None


#   Starting, running and cancelling

async def start_build(course_id: uuid.UUID, user_id: Optional[uuid.UUID], trigger: str = "manual") -> Tuple[GraphBuild, bool]:
    """Queue a build, or return the one already queued or running. Returns (build, created)."""
    current = await active_build(course_id)
    if current:
        return current, False
    ready = await DocumentModel.find(DocumentModel.course_id == course_id, DocumentModel.status == "ready").count()
    if not ready:
        raise ValueError("No processed materials yet. Upload files and wait for them to finish processing.")
    first = "Started automatically: every uploaded file is processed" if trigger == "auto" else "Build requested"
    build = GraphBuild(course_id=course_id, requested_by=user_id, trigger=trigger, events=[BuildEvent(message=first)])
    await build.insert()
    from app.tasks.graph import build_course_graph
    build_course_graph.delay(str(build.id))
    return build, True


async def maybe_auto_build(course_id: uuid.UUID) -> Optional[GraphBuild]:
    """Build a course's first map once nothing is waiting to be processed. Only the first: after
    a map exists, or after any build was tried (it may have failed or been cancelled), the
    professor decides when to build again."""
    if not settings.AUTO_BUILD_MAP:
        return None
    if await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_id):
        return None
    if await GraphBuild.find_one(GraphBuild.course_id == course_id):
        return None
    busy = await DocumentModel.find(DocumentModel.course_id == course_id,
                                    In(DocumentModel.status, ["pending", "processing"])).count()
    if busy:
        return None
    try:
        build, _ = await start_build(course_id, None, trigger="auto")
    except ValueError:  # every file failed: nothing to build from
        return None
    return build


async def cancel_build(build_id: uuid.UUID) -> Optional[GraphBuild]:
    """A queued build stops at once; a running one stops after the chunk it is working on."""
    stopped = await GraphBuild.find_one({"_id": build_id, "status": "queued"}).update({"$set": {
        "status": "cancelled", "cancel_requested": True, "message": "Cancelled", "finished_at": _now(),
    }})
    if not getattr(stopped, "matched_count", 0):
        await GraphBuild.find_one({"_id": build_id, "status": "running"}).update({"$set": {
            "cancel_requested": True, "detail": "Stopping after the current chunk...",
        }})
    return await GraphBuild.get(build_id)


async def run_build(build_id: uuid.UUID) -> Optional[uuid.UUID]:
    """Work one queued build (the Celery task body). Returns the new graph's id."""
    from app.services.advanced_graph_generator import AdvancedGraphGenerator

    build = await GraphBuild.get(build_id)
    if not build or build.status != "queued":
        return None  # cancelled before a worker picked it up, or already worked
    started = _now()
    claimed = await GraphBuild.find_one({"_id": build.id, "status": "queued"}).update({"$set": {
        "status": "running", "started_at": started, "heartbeat_at": started, "message": "Starting", "detail": "",
    }})
    if not getattr(claimed, "matched_count", 0):
        return None

    events = list(build.events)
    seen = {"step": 0, "extract_started": False}

    def note(message: str) -> None:
        events.append(BuildEvent(message=message))
        del events[:-MAX_EVENTS]

    async def save(**fields) -> None:
        await GraphBuild.find_one({"_id": build.id}).update({"$set": {
            **fields, "events": [e.model_dump() for e in events],
        }})

    async def progress(step: int, total_steps: int, message: str, detail: str = "", **stats) -> None:
        fields = {"step": step, "total_steps": total_steps, "message": message, "detail": detail,
                  "heartbeat_at": _now(), **stats}
        if step == 3 and not seen["extract_started"]:
            seen["extract_started"] = True
            fields["extract_started_at"] = _now()
        # The log keeps step changes and results ("Chunk 3/12: found ..."), not "Processing chunk 3..."
        if detail and (stats or step != seen["step"]):
            note(detail)
        seen["step"] = step
        await save(**fields)
        fresh = await GraphBuild.get(build.id)
        if fresh and fresh.cancel_requested:
            raise BuildCancelled()

    async def heartbeat() -> None:
        # LLM calls take minutes; the heartbeat shows the worker is still alive between updates
        while True:
            await asyncio.sleep(HEARTBEAT_EVERY_S)
            await GraphBuild.find_one({"_id": build.id}).update({"$set": {"heartbeat_at": _now()}})

    beat = asyncio.create_task(heartbeat())
    try:
        graph_data = await AdvancedGraphGenerator().generate_from_course(str(build.course_id), progress_callback=progress)
        course = await Course.get(build.course_id)
        owner = build.requested_by or (course.professor_id if course else build.course_id)
        graph = KnowledgeGraph(
            topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
            course_id=build.course_id,
            nodes=graph_data["nodes"],
            edges=graph_data["edges"],
            created_by=owner,
        )
        await graph.insert()
        first_node = graph_data["nodes"][0]["id"] if graph_data["nodes"] else None
        await StudySession(graph_id=graph.id, student_id=owner, current_node_id=first_node,
                           visited_nodes=[first_node] if first_node else []).insert()
        unsupported = sum(1 for e in graph_data["edges"] if not e.get("supported", True))
        note(f"Map ready: {len(graph.nodes)} concepts, {len(graph.edges)} connections")
        await save(status="complete", step=build.total_steps, message="Complete", detail="",
                   graph_id=graph.id, nodes_count=len(graph.nodes), edges_count=len(graph.edges),
                   unsupported_edges=unsupported, error=None, finished_at=_now())
        return graph.id
    except BuildCancelled:
        note("Cancelled by the instructor")
        await save(status="cancelled", message="Cancelled", detail="", finished_at=_now())
    except Exception as e:
        print(traceback.format_exc())
        note(f"Failed: {str(e)[:200]}")
        await save(status="failed", message="Failed", detail="", error=str(e)[:500], finished_at=_now())
    finally:
        beat.cancel()
    return None


#   The course setup checklist

def _document_item(doc: DocumentModel) -> dict:
    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "file_type": doc.file_type,
        "media_type": doc.media_type,
        "status": doc.status,
        "stage": doc.stage,
        "progress": doc.progress,
        "error_message": doc.error_message,
        "chunk_count": doc.chunk_count,
        "created_at": _aware(doc.created_at).isoformat(),
        "processed_at": _aware(doc.processed_at).isoformat() if doc.processed_at else None,
    }


async def course_setup(course_id: uuid.UUID) -> dict:
    """Everything a professor needs to see while a course is being set up: each file's
    processing, the map build, whether the map is out of date, and who has joined."""
    docs = await DocumentModel.find(DocumentModel.course_id == course_id).sort(+DocumentModel.created_at).to_list()
    counts = Counter(d.status for d in docs)
    build = await latest_build(course_id)
    graph = await KnowledgeGraph.find(KnowledgeGraph.course_id == course_id).sort(-KnowledgeGraph.created_at).first_or_none()

    changed = []
    if graph:
        # Files processed after the build that made this map began reading the materials
        source = await GraphBuild.find_one(GraphBuild.graph_id == graph.id)
        cutoff = _aware(source.started_at) if source and source.started_at else _aware(graph.created_at)
        changed = [d.filename for d in docs if d.status == "ready" and d.processed_at and _aware(d.processed_at) > cutoff]

    if not docs:
        phase = "no_materials"
    elif build and build.status in ACTIVE:
        phase = "building"
    elif counts["pending"] or counts["processing"]:
        phase = "processing"
    elif graph:
        phase = "ready"
    elif not counts["ready"]:
        phase = "materials_failed"
    elif build and build.status == "failed":
        phase = "build_failed"
    else:
        phase = "ready_to_build"

    return {
        "phase": phase,
        "auto_build": settings.AUTO_BUILD_MAP,
        "documents": {
            "total": len(docs),
            "ready": counts["ready"],
            "processing": counts["processing"],
            "pending": counts["pending"],
            "failed": counts["failed"],
            "items": [_document_item(d) for d in docs],
        },
        "build": serialize_build(build) if build else None,
        "graph": {
            "id": str(graph.id),
            "nodes_count": len(graph.nodes),
            "edges_count": len(graph.edges),
            "created_at": _aware(graph.created_at).isoformat(),
        } if graph else None,
        "materials_changed": changed,
        "students": await Enrolment.find(Enrolment.course_id == course_id).count(),
    }
