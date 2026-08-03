from fastapi import APIRouter
from . import tests, courses, documents, graphs

router = APIRouter(prefix="/professor", tags=["professor"])
router.include_router(tests.router)
router.include_router(courses.router)
router.include_router(documents.router)
router.include_router(graphs.router)
