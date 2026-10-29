from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.api.auth import current_active_user, require_role, get_user_from_token
from app.models.user import User
from app.services.graph_service import GraphService
from pydantic import BaseModel
import uuid

router = APIRouter(prefix="/graph", tags=["graph (professor)"])

class GenerateGraphRequest(BaseModel):
    topic: str
    course_id: uuid.UUID | None = None

class GenerateFromDocsRequest(BaseModel):
    course_id: uuid.UUID

@router.post("/generate")
async def generate_graph(
    req: GenerateGraphRequest,
    user: User = Depends(require_role("professor"))
):
    """Generate a knowledge graph from a topic."""
    return await GraphService.generate_graph(req.topic, user, req.course_id)

@router.post("/generate-from-docs")
async def generate_graph_from_docs(
    req: GenerateFromDocsRequest,
    user: User = Depends(require_role("professor"))
):
    """Generate an interconnected knowledge graph from all uploaded course documents."""
    return await GraphService.generate_graph_from_docs(req.course_id, user)

@router.get("/generate-from-docs-stream/{course_id}")
async def generate_graph_from_docs_stream(
    course_id: uuid.UUID,
    user_id: uuid.UUID,
    user: User = Depends(require_role("professor"))
):
    """Stream graph generation progress via Server-Sent Events."""
    if user.id != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return await GraphService.generate_graph_from_docs_stream(course_id, user_id)

@router.get("/{graph_id}")
async def get_graph(
    graph_id: uuid.UUID,
    user: User = Depends(require_role("professor"))
):
    """Get a knowledge graph by ID."""
    return await GraphService.get_graph(graph_id, user)

@router.get("/course/{course_id}")
async def get_course_graphs(
    course_id: uuid.UUID,
    user: User = Depends(require_role("professor"))
):
    """Get all knowledge graphs for a course."""
    return await GraphService.get_course_graphs(course_id, user)

@router.get("/course/{course_id}/status")
async def get_course_graph_status(
    course_id: uuid.UUID,
    user: User = Depends(require_role("professor"))
):
    """Check if a knowledge graph exists for a course."""
    return await GraphService.get_course_graph_status(course_id, user)


#   Edge audit (Upgrade D): instructors judge a stratified sample of relations

class EdgeVerdict(BaseModel):
    status: str  # correct | incorrect | unreviewed
    note: str | None = None


async def _owned_graph(graph_id: uuid.UUID, user: User):
    from app.models.graph import KnowledgeGraph
    from app.services.access import ensure_course_owner
    graph = await KnowledgeGraph.get(graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    if graph.course_id:
        await ensure_course_owner(user, graph.course_id)
    elif graph.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not your graph")
    return graph


def _audit_item(graph, edge) -> dict:
    from app.models.graph import edge_to_dict
    labels = {n.id: n.label for n in graph.nodes}
    return {**edge_to_dict(edge), "from_label": labels.get(edge.source, ""), "to_label": labels.get(edge.target, "")}


@router.post("/{graph_id}/audit-sample")
async def create_audit_sample(graph_id: uuid.UUID, n: int = 30, user: User = Depends(require_role("professor"))):
    from app.services.graph_audit import stratified_sample
    graph = await _owned_graph(graph_id, user)
    sample = stratified_sample(graph, max(1, min(n, 200)))
    await graph.save()
    return {"items": [_audit_item(graph, e) for e in sample]}


@router.patch("/{graph_id}/edges/{edge_id}/audit")
async def judge_edge(graph_id: uuid.UUID, edge_id: str, req: EdgeVerdict, user: User = Depends(require_role("professor"))):
    from app.services.graph_audit import record_verdict
    graph = await _owned_graph(graph_id, user)
    record_verdict(graph, edge_id, req.status, req.note, user.id)
    await graph.save()
    edge = next(e for e in graph.edges if e.id == edge_id)
    return _audit_item(graph, edge)


@router.get("/{graph_id}/audit-report")
async def get_audit_report(graph_id: uuid.UUID, user: User = Depends(require_role("professor"))):
    from app.services.graph_audit import audit_report
    return audit_report(await _owned_graph(graph_id, user))
