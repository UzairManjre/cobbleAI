from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.api.auth import current_active_user
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
    user: User = Depends(current_active_user)
):
    """Generate a knowledge graph from a topic."""
    if user.role != "professor":
        raise HTTPException(
            status_code=403,
            detail="Only professors are allowed to generate knowledge graphs."
        )
    return await GraphService.generate_graph(req.topic, user, req.course_id)

@router.post("/generate-from-docs")
async def generate_graph_from_docs(
    req: GenerateFromDocsRequest,
    user: User = Depends(current_active_user)
):
    """Generate an interconnected knowledge graph from all uploaded course documents."""
    if user.role != "professor":
        raise HTTPException(
            status_code=403,
            detail="Only professors are allowed to generate knowledge graphs."
        )
    return await GraphService.generate_graph_from_docs(req.course_id, user)

@router.get("/generate-from-docs-stream/{course_id}")
async def generate_graph_from_docs_stream(
    course_id: uuid.UUID,
    user_id: uuid.UUID
):
    """Stream graph generation progress via Server-Sent Events."""
    return await GraphService.generate_graph_from_docs_stream(course_id, user_id)

@router.get("/{graph_id}")
async def get_graph(
    graph_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Get a knowledge graph by ID."""
    return await GraphService.get_graph(graph_id, user)

@router.get("/course/{course_id}")
async def get_course_graphs(
    course_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Get all knowledge graphs for a course."""
    return await GraphService.get_course_graphs(course_id, user)

@router.get("/course/{course_id}/status")
async def get_course_graph_status(
    course_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Check if a knowledge graph exists for a course."""
    return await GraphService.get_course_graph_status(course_id, user)
