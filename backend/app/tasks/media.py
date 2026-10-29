"""Celery task for lecture recordings. Runs on its own `media` queue with long time limits:

    celery -A app.core.celery_app worker -Q media --pool=solo -n media@%h

so a long transcription never blocks (or is killed by the limits of) document processing.
"""

import asyncio
import uuid

from app.core.celery_app import celery_app
from app.core.config import settings


async def run_process_lecture(doc_id_str: str) -> bool:
    from datetime import datetime, timezone
    from app.core.db import connect_to_mongo
    from app.models.document import DocumentModel
    from app.services.media.lecture_pipeline import process_lecture_document

    await connect_to_mongo()
    doc = await DocumentModel.get(uuid.UUID(doc_id_str))
    if not doc:
        print(f"Lecture {doc_id_str} not found")
        return False
    await DocumentModel.find_one({"_id": doc.id}).update({"$set": {"status": "processing", "error_message": None}})
    try:
        count = await process_lecture_document(doc)
        if count == 0:
            raise ValueError("Nothing could be indexed from this recording.")
        await DocumentModel.find_one({"_id": doc.id}).update({"$set": {
            "status": "ready", "chunk_count": count, "stage": None, "progress": 1.0,
            "processed_at": datetime.now(timezone.utc),
        }})
        try:
            from app.worker import reindex_legacy_documents
            await reindex_legacy_documents(str(doc.course_id), str(doc.id))
        except Exception as e:
            print(f"  Legacy re-index check failed: {e}")
        return True
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        await DocumentModel.find_one({"_id": doc.id}).update({"$set": {
            "status": "failed", "error_message": str(e)[:500], "processed_at": datetime.now(timezone.utc),
        }})
        return False


@celery_app.task(
    name="process_lecture",
    bind=True,
    soft_time_limit=settings.LECTURE_TASK_TIME_LIMIT_S,
    time_limit=settings.LECTURE_TASK_TIME_LIMIT_S + 300,
)
def process_lecture(self, doc_id_str: str):
    """Recording -> transcript, keyframes, chapters -> timestamped index."""
    return asyncio.run(run_process_lecture(doc_id_str))


async def run_rebuild_lecture(doc_id_str: str) -> int:
    from app.core.db import connect_to_mongo
    from app.models.document import DocumentModel
    from app.services.media.lecture_pipeline import rebuild_after_exclusions

    await connect_to_mongo()
    doc = await DocumentModel.get(uuid.UUID(doc_id_str))
    if not doc or doc.status != "ready":
        return 0
    count = await rebuild_after_exclusions(doc)
    await DocumentModel.find_one({"_id": doc.id}).update({"$set": {"chunk_count": count}})
    return count


@celery_app.task(name="rebuild_lecture", soft_time_limit=1800, time_limit=2100)
def rebuild_lecture(doc_id_str: str):
    """Excluded ranges changed: chapters and notes from the remaining transcript, then re-index."""
    return asyncio.run(run_rebuild_lecture(doc_id_str))
