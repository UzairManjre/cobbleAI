import os
import uuid
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.celery_app import celery_app
from app.services.pdf_extractor import extract_text
from app.services.chunking import split_into_chunks, embed_and_store
from app.core.storage import get_s3_client, S3_BUCKET
from app.core.config import settings

# Shared Motor Client for the worker process
_client = None

def get_db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    return _client.get_default_database()

async def update_doc_status(doc_id: uuid.UUID, status: str, error: str = None, chunks: int = None):
    db = get_db()
    update_data = {
        "status": status,
        "processed_at": datetime.now(timezone.utc)
    }
    if error:
        update_data["error_message"] = error
    if chunks is not None:
        update_data["chunk_count"] = chunks

    result = await db["documents"].update_one(
        {"_id": doc_id},
        {"$set": update_data}
    )
    print(f"Updated document {doc_id} status to '{status}': {result.modified_count} modified")

async def get_doc_metadata(doc_id: uuid.UUID):
    db = get_db()
    return await db["documents"].find_one({"_id": doc_id})

@celery_app.task(name="process_document", bind=True, max_retries=3)
def process_document(self, doc_id_str: str):
    """Celery task to process a document (PDF -> Text -> Chunks -> Qdrant)."""
    print(f"Beginning processing for document: {doc_id_str}")
    
    # Ensure we use a UUID object for MongoDB queries
    try:
        doc_id = uuid.UUID(doc_id_str)
    except ValueError:
        print(f"Invalid UUID string: {doc_id_str}")
        return

    # 1. Fetch metadata
    doc = asyncio.run(get_doc_metadata(doc_id))
    if not doc:
        print(f"Document {doc_id} not found in database")
        return

    asyncio.run(update_doc_status(doc_id, "processing"))

    try:
        # 2. Download from S3 (MinIO)
        s3 = get_s3_client()
        s3_key = doc.get("s3_path") or doc.get("s3_key")
        if not s3_key:
            raise ValueError(f"Document {doc_id} has no S3 path")
        
        print(f"Downloading from S3: {s3_key}")
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        file_bytes = response['Body'].read()

        # 3. Extract text
        file_type = doc.get("file_type", "pdf")
        print(f"Extracting text from {file_type}...")
        raw_text = extract_text(file_type, file_bytes)
        print(f"Extracted {len(raw_text)} characters")

        # 4. Chunk
        print("Chunking...")
        chunks = split_into_chunks(raw_text)
        print(f"Created {len(chunks)} chunks")

        # 5. Embed & push to Qdrant
        course_id_raw = doc.get("course_id", "")
        # Standardize course ID (Beanie stores it as Binary UUID)
        if isinstance(course_id_raw, bytes):
            course_id = str(uuid.UUID(bytes=course_id_raw))
        else:
            course_id = str(course_id_raw)
        
        print(f"Pushing {len(chunks)} chunks to Qdrant for course {course_id}...")
        filename = doc.get("filename")
        pushed_count = embed_and_store(chunks, course_id, str(doc_id), filename)
        print(f"Pushed {pushed_count} chunks to Qdrant")

        # 6. Mark Success
        asyncio.run(update_doc_status(doc_id, "ready", chunks=pushed_count))
        print(f"  Document {doc_id} processed successfully.")
        return True

    except Exception as e:
        import traceback
        error_msg = f"Processing failed: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        asyncio.run(update_doc_status(doc_id, "failed", error=str(e)))
        raise self.retry(exc=e)
