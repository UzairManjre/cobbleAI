"""Celery task for concept-map builds.

Builds run on the `media` queue with the lecture jobs. Both are long GPU jobs, and running them
one at a time keeps Whisper and the LLM from competing for the card's memory. Progress is saved
on the GraphBuild document (see app/services/graph_build.py).
"""

import asyncio
import uuid

from app.core.celery_app import celery_app
from app.core.config import settings


async def run_build_course_graph(build_id_str: str):
    from app.core.db import connect_to_mongo
    from app.services.graph_build import run_build

    await connect_to_mongo()
    return await run_build(uuid.UUID(build_id_str))


@celery_app.task(
    name="build_course_graph",
    soft_time_limit=settings.GRAPH_BUILD_TIME_LIMIT_S,
    time_limit=settings.GRAPH_BUILD_TIME_LIMIT_S + 300,
)
def build_course_graph(build_id_str: str):
    """Course materials -> provenance-backed concept map, reporting progress as it goes."""
    graph_id = asyncio.run(run_build_course_graph(build_id_str))
    return str(graph_id) if graph_id else None
