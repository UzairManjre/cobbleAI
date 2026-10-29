import os
import uuid
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.celery_app import celery_app
from app.services.ingestion.segments import extract_segments
from app.services.chunking import chunk_segments, index_chunks
from app.core.storage import get_s3_client, S3_BUCKET
from app.core.config import settings
from app.core.db import connect_to_mongo
from app.repositories.document_repository import DocumentRepository


class NonRetryableProcessingError(Exception):
    """A failure that will repeat on every retry (bad file, unsupported type, no text)."""


LEGACY_DOCUMENT_TYPES = ("pdf", "docx", "pptx")  # v1 never indexed lecture recordings


async def reindex_legacy_documents(course_id: str, just_indexed: str) -> int:
    """Retrieval reads `course_<id>_v2` as soon as it exists, so the first 2.0 upload to a course
    that was never migrated would hide every v1-only document. Queue those documents for
    re-indexing (what scripts.migrate_qdrant_v2 does by hand). Returns how many were queued."""
    from qdrant_client import models
    from app.core import qdrant as qdrant_core
    from app.models.document import DocumentModel
    client = qdrant_core.qdrant_sync
    v2 = qdrant_core.collection_name(course_id)
    if not client.collection_exists(qdrant_core.legacy_collection_name(course_id)) or not client.collection_exists(v2):
        return 0
    docs = await DocumentModel.find(DocumentModel.course_id == uuid.UUID(course_id), DocumentModel.status == "ready").to_list()
    queued = 0
    for d in docs:
        if str(d.id) == just_indexed or (d.file_type or "pdf") not in LEGACY_DOCUMENT_TYPES:
            continue
        in_v2 = client.count(v2, count_filter=models.Filter(must=[models.FieldCondition(
            key="doc_id", match=models.MatchValue(value=str(d.id)))]), exact=True).count
        if in_v2:
            continue
        # "pending" first, so the next document's check does not queue it a second time
        await DocumentModel.find_one({"_id": d.id}).update({"$set": {"status": "pending"}})
        process_document.delay(str(d.id))
        queued += 1
    if queued:
        print(f"  Queued {queued} v1-only documents of course {course_id} for re-indexing into {v2}")
    return queued


async def run_process_document(doc_id_str: str, task):
    print(f"Beginning processing for document: {doc_id_str}")
    
    # Initialize Beanie inside the celery worker for this task
    await connect_to_mongo()
    
    try:
        doc_id = uuid.UUID(doc_id_str)
    except ValueError:
        print(f"Invalid UUID string: {doc_id_str}")
        return

    doc_repo = DocumentRepository()
    
    # 1. Fetch metadata
    doc = await doc_repo.get_by_id(doc_id)
    if not doc:
        print(f"Document {doc_id} not found in database")
        return

    await doc_repo.update_status(doc_id, "processing")

    try:
        # 2. Download from S3 (MinIO)
        s3 = get_s3_client()
        s3_key = getattr(doc, "s3_path", None) or getattr(doc, "s3_key", None)
        if not s3_key:
            raise NonRetryableProcessingError(f"Document {doc_id} has no S3 path")
        
        print(f"Downloading from S3: {s3_key}")
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        file_bytes = response['Body'].read()

        # 3. Extract located text segments (pages / slides / paragraphs)
        file_type = getattr(doc, "file_type", "pdf")
        print(f"Extracting segments from {file_type}...")
        try:
            segments = extract_segments(file_type, file_bytes)
        except ValueError as e:
            raise NonRetryableProcessingError(str(e)) from e
        print(f"Extracted {len(segments)} segments")
        if not any(seg.text.strip() for seg in segments):
            raise NonRetryableProcessingError("No extractable text found in document (scanned or empty file?).")

        # 4. Chunk (chunks keep their page/slide span; one summary per section for the chapter prior)
        print("Chunking...")
        chunks, summaries = chunk_segments(segments, str(doc_id))
        print(f"Created {len(chunks)} chunks")

        # 5. Embed & push to Qdrant
        course_id_raw = getattr(doc, "course_id", "")
        # Standardize course ID (Beanie stores it as Binary UUID)
        if isinstance(course_id_raw, bytes):
            course_id = str(uuid.UUID(bytes=course_id_raw))
        else:
            course_id = str(course_id_raw)
        
        print(f"Pushing {len(chunks)} chunks to Qdrant for course {course_id}...")
        filename = getattr(doc, "filename", "")
        pushed_count = index_chunks(chunks, course_id, str(doc_id), filename, summaries=summaries)
        print(f"Pushed {pushed_count} chunks to Qdrant")

        if pushed_count == 0:
            raise RuntimeError("No chunks were successfully pushed to Qdrant. Document is empty or embedding failed.")

        # 6. Mark Success
        await doc_repo.update_status(doc_id, "ready", chunks=pushed_count)
        print(f"  Document {doc_id} processed successfully.")
        try:
            await reindex_legacy_documents(course_id, str(doc_id))
        except Exception as e:  # never fail the document that did index
            print(f"  Legacy re-index check failed: {e}")
        return True

    except Exception as e:
        import traceback
        error_msg = f"Processing failed: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        await doc_repo.update_status(doc_id, "failed", error=str(e))
        if isinstance(e, NonRetryableProcessingError):
            return False
        raise task.retry(exc=e)

@celery_app.task(name="process_document", bind=True, max_retries=3)
def process_document(self, doc_id_str: str):
    """Celery task to process a document (PDF -> Text -> Chunks -> Qdrant)."""
    return asyncio.run(run_process_document(doc_id_str, self))
