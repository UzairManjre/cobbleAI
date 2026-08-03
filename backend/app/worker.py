import os
import uuid
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.celery_app import celery_app
from app.services.pdf_extractor import extract_text
from app.services.chunking import split_into_chunks, embed_and_store
from app.core.storage import get_s3_client, S3_BUCKET
from app.core.config import settings
from app.core.db import connect_to_mongo
from app.repositories.document_repository import DocumentRepository

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
            raise ValueError(f"Document {doc_id} has no S3 path")
        
        print(f"Downloading from S3: {s3_key}")
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        file_bytes = response['Body'].read()

        # 3. Extract text
        file_type = getattr(doc, "file_type", "pdf")
        print(f"Extracting text from {file_type}...")
        raw_text = extract_text(file_type, file_bytes)
        print(f"Extracted {len(raw_text)} characters")

        # 4. Chunk
        print("Chunking...")
        chunks = split_into_chunks(raw_text)
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
        pushed_count = embed_and_store(chunks, course_id, str(doc_id), filename)
        print(f"Pushed {pushed_count} chunks to Qdrant")

        if pushed_count == 0:
            raise RuntimeError("No chunks were successfully pushed to Qdrant. Document is empty or embedding failed.")

        # 6. Mark Success
        await doc_repo.update_status(doc_id, "ready", chunks=pushed_count)
        print(f"  Document {doc_id} processed successfully.")
        return True

    except Exception as e:
        import traceback
        error_msg = f"Processing failed: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        await doc_repo.update_status(doc_id, "failed", error=str(e))
        raise task.retry(exc=e)

@celery_app.task(name="process_document", bind=True, max_retries=3)
def process_document(self, doc_id_str: str):
    """Celery task to process a document (PDF -> Text -> Chunks -> Qdrant)."""
    return asyncio.run(run_process_document(doc_id_str, self))
