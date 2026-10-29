from fastapi import APIRouter, Depends
from app.api.auth import require_role
from app.models.user import User
from app.services.graph_service import GraphService
import uuid

# Read-only graph access for enrolled students (generation stays professor-only)
router = APIRouter(prefix="/graph", tags=["graph (student)"])


@router.get("/{graph_id}")
async def get_graph(graph_id: uuid.UUID, user: User = Depends(require_role("student"))):
    return await GraphService.get_graph(graph_id, user)


@router.get("/course/{course_id}")
async def get_course_graphs(course_id: uuid.UUID, user: User = Depends(require_role("student"))):
    return await GraphService.get_course_graphs(course_id, user)


@router.get("/course/{course_id}/status")
async def get_course_graph_status(course_id: uuid.UUID, user: User = Depends(require_role("student"))):
    return await GraphService.get_course_graph_status(course_id, user)
