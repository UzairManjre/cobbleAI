from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Form
from app.models.document import DocumentModel
from app.api.auth import current_active_user
from app.models.user import User
from app.core.storage import get_s3_client, S3_BUCKET
from app.core.config import settings
import uuid
import asyncio
import time
from datetime import datetime, timezone
from app.worker import process_document
from concurrent.futures import ThreadPoolExecutor
from typing import List

router = APIRouter(prefix="/documents", tags=["documents"])
_executor = ThreadPoolExecutor(max_workers=2)


def _safe_track_event(event_type, event_category, user_id, user_role, **kwargs):
    """Fire-and-forget event tracking that never breaks the route handler."""
    async def _track():
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type=event_type,
                event_category=event_category,
                user_id=user_id,
                user_role=user_role,
                **kwargs,
            )
        except Exception:
            pass
    asyncio.create_task(_track())

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
}
MAX_SIZE = 50 * 1024 * 1024 # 50 MB

async def _generate_graph_for_course(course_id: str):
    """Auto-generate knowledge graph from course documents after processing.

    Uses a Redis distributed lock to prevent race conditions when multiple
    documents finish processing concurrently. Only one graph generation task
    will execute per course, even if 5 documents finish at the same time.
    """
    try:
        from app.services.advanced_graph_generator import AdvancedGraphGenerator
        from app.models.graph import KnowledgeGraph, StudySession
        import redis

        # Acquire distributed lock - only one graph generation per course at a time
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        lock_key = f"graph_gen_lock:{course_id}"
        # Lock expires after 10 minutes (generous for graph generation)
        acquired = redis_client.set(lock_key, "1", nx=True, ex=600)

        if not acquired:
            print(f"🔒 Another worker is already generating graph for course {course_id}, skipping")
            return

        try:
            # Double-check: does a graph already exist for this course?
            existing_graph = await KnowledgeGraph.find_one(
                KnowledgeGraph.course_id == uuid.UUID(course_id)
            ).to_list()

            if existing_graph:
                print(f"⏭️ Graph already exists for course {course_id}, skipping generation")
                return

            # Wait a bit for database to settle
            await asyncio.sleep(2)

            print(f"🧠 Generating graph for course {course_id}...")
            generator = AdvancedGraphGenerator()
            graph_data = await generator.generate_from_course(course_id)

            if not graph_data["nodes"]:
                print(f"⚠️ No graph nodes generated for course {course_id}")
                return

            # Convert course_id to UUID
            course_uuid = uuid.UUID(course_id) if isinstance(course_id, str) else course_id

            # Save to database
            graph = KnowledgeGraph(
                topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
                course_id=course_uuid,
                nodes=graph_data["nodes"],
                edges=graph_data["edges"],
                created_by=course_uuid  # Use the course ID as owner, not phantom user
            )
            await graph.insert()

            print(f"✅ Graph generated and saved: {len(graph_data['nodes'])} nodes, {len(graph_data['edges'])} edges")

        finally:
            # Always release the lock
            redis_client.delete(lock_key)

    except Exception as e:
        import traceback
        print(f"❌ Auto graph generation failed: {e}")
        print(traceback.format_exc())

def _process_document_sync(doc_id: str):
    """Process document synchronously in thread pool"""
    try:
        import sys
        import os
        
        from app.services.pdf_extractor import extract_text
        from app.services.chunking import split_into_chunks, embed_and_store
        from motor.motor_asyncio import AsyncIOMotorClient
        from app.core.config import settings

        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def process():
            client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
            db = client.get_default_database()
            
            try:
                # Convert doc_id string to UUID for MongoDB query
                doc_uuid = uuid.UUID(doc_id)
                doc = await db["documents"].find_one({"_id": doc_uuid})

                if not doc:
                    print(f"❌ Document {doc_id} not found in database")
                    return

                # Update status to processing
                await db["documents"].update_one(
                    {"_id": doc_uuid},
                    {"$set": {"status": "processing"}}
                )
                print(f"🔄 Processing document: {doc.get('filename', 'unknown')}")

                try:
                    proc_start = time.time()
                    # Download from S3
                    s3 = get_s3_client()
                    s3_key = doc.get("s3_path") or doc.get("s3_key")
                    print(f"📥 Downloading from MinIO: {s3_key}")
                    response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
                    file_bytes = response['Body'].read()
                    print(f"✅ Downloaded {len(file_bytes)} bytes")

                    # Extract text
                    file_type = doc.get("file_type", "pdf")
                    print(f"📝 Extracting text from {file_type}...")
                    raw_text = extract_text(file_type, file_bytes)
                    print(f"✅ Extracted {len(raw_text)} characters")

                    # Chunk
                    print(f"✂️ Chunking text...")
                    chunks = split_into_chunks(raw_text)
                    print(f"✅ Created {len(chunks)} chunks")

                    # Embed & store
                    course_id_raw = doc.get("course_id", "")
                    if isinstance(course_id_raw, bytes):
                        course_id = str(uuid.UUID(bytes=course_id_raw))
                    else:
                        course_id = str(course_id_raw)

                    doc_id_str = str(uuid.UUID(bytes=doc_id)) if isinstance(doc_id, bytes) else str(doc_id)
                    filename = doc.get("filename")

                    print(f"💾 Embedding and storing in Qdrant...")
                    pushed_count = embed_and_store(chunks, course_id, doc_id_str, filename)

                    # Mark success
                    processing_time_ms = int((time.time() - proc_start) * 1000)
                    await db["documents"].update_one(
                        {"_id": doc_uuid},
                        {"$set": {
                            "status": "ready",
                            "chunk_count": pushed_count,
                            "processed_at": datetime.now(timezone.utc)
                        }}
                    )
                    print(f"✅ Document {doc_id} processed: {pushed_count} chunks stored")

                    # Track document_processed event (fire and forget)
                    try:
                        from app.services.analytics import analytics_service
                        asyncio.run(analytics_service.track_event(
                            event_type="document_processed",
                            event_category="document",
                            user_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
                            user_role="system",
                            course_id=doc.get("course_id"),
                            document_id=doc_uuid,
                            payload={
                                "filename": doc.get("filename", "unknown"),
                                "file_type": file_type,
                                "char_count": len(raw_text),
                                "chunk_count": pushed_count,
                                "processing_time_ms": processing_time_ms,
                            },
                        ))
                    except Exception:
                        pass

                    # Auto-trigger graph generation if this is the last pending document
                    pending_count = await db["documents"].count_documents({
                        "course_id": doc.get("course_id"),
                        "status": "pending"
                    })
                    
                    if pending_count == 0:
                        print(f"🚀 All documents processed, triggering graph generation...")
                        # Fire and forget - don't await this
                        asyncio.create_task(_generate_graph_for_course(course_id))

                except Exception as e:
                    import traceback
                    print(f"❌ Processing failed: {e}")
                    print(traceback.format_exc())
                    processing_time_ms = int((time.time() - proc_start) * 1000)
                    await db["documents"].update_one(
                        {"_id": doc_uuid},
                        {"$set": {
                            "status": "failed",
                            "error_message": str(e),
                            "processed_at": datetime.now(timezone.utc)
                        }}
                    )

                    # Track document_failed event
                    try:
                        from app.services.analytics import analytics_service
                        asyncio.run(analytics_service.track_event(
                            event_type="document_failed",
                            event_category="document",
                            user_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
                            user_role="system",
                            course_id=doc.get("course_id"),
                            document_id=doc_uuid,
                            payload={
                                "filename": doc.get("filename", "unknown"),
                                "file_type": file_type,
                                "error": str(e),
                                "processing_time_ms": processing_time_ms,
                            },
                        ))
                    except Exception:
                        pass
            finally:
                client.close()
        
        # Run the async process
        loop.run_until_complete(process())
        
    except Exception as e:
        import traceback
        print(f"❌ Document processing failed: {e}")
        print(traceback.format_exc())

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    course_id: str = Form(...),
    files: List[UploadFile] = File(...),
    user: User = Depends(current_active_user)
):
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only professors can upload documents")

    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course_id")

    uploaded_docs = []
    upload_start = time.time()

    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid file type for {file.filename}. Allowed: PDF, DOCX, PPTX")

        file.file.seek(0, 2)
        size = file.file.tell()
        if size > MAX_SIZE:
            raise HTTPException(status_code=400, detail=f"File size exceeds 50MB limit for {file.filename}")
        file.file.seek(0)

        # Check if document with same filename already exists for this course
        existing_doc = await DocumentModel.find_one(
            DocumentModel.course_id == course_uuid,
            DocumentModel.filename == file.filename
        )

        if existing_doc:
            print(f"⚠️ Document '{file.filename}' already exists for course {course_id}, skipping duplicate upload")
            uploaded_docs.append({
                "id": str(existing_doc.id),
                "filename": existing_doc.filename,
                "status": "duplicate",
                "message": "Document already exists"
            })
            continue

        doc_id = uuid.uuid4()
        s3_key = f"courses/{course_uuid}/{doc_id}/{file.filename}"

        # Upload to S3
        s3 = get_s3_client()
        file_bytes = await file.read()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, lambda: s3.put_object(
            Bucket=S3_BUCKET, Key=s3_key, Body=file_bytes))

        file_type = ALLOWED_TYPES.get(file.content_type, "pdf")
        doc = DocumentModel(
            id=doc_id,
            course_id=course_uuid,
            filename=file.filename,
            s3_path=s3_key,
            status="pending",
            file_type=file_type,
            file_size_bytes=size,
            created_at=datetime.now(timezone.utc)
        )
        await doc.insert()

        # Increment docs_count on Course
        from app.models.course import Course
        await Course.find_one(Course.id == course_uuid).inc(Course.docs_count, 1)

        # Track upload event
        _safe_track_event(
            "document_uploaded", "document", user.id, user.role,
            course_id=course_uuid,
            document_id=doc_id,
            payload={
                "filename": file.filename,
                "file_type": file_type,
                "file_size_bytes": size,
            },
        )

        print(f"📄 Queued document {doc_id} for processing")
        uploaded_docs.append({"id": str(doc_id), "filename": file.filename, "status": "processing"})

    # Start processing all uploaded documents in background
    for doc_info in uploaded_docs:
        if doc_info["status"] == "processing":
            asyncio.create_task(_process_document_async(doc_info["id"]))

    return {"uploaded": uploaded_docs}

async def _process_document_async(doc_id: str):
    """Process a document asynchronously"""
    try:
        print(f"🔄 Starting processing for document {doc_id}")
        # Run sync processing in thread pool
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, _process_document_sync, doc_id)
        print(f"✅ Completed processing for document {doc_id}")
    except Exception as e:
        print(f"❌ Error processing document {doc_id}: {e}")
        import traceback
        print(traceback.format_exc())

@router.get("/", response_model=List[dict])
async def list_documents(
    course_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    documents = await DocumentModel.find(
        DocumentModel.course_id == course_id
    ).sort(-DocumentModel.created_at).to_list()

    # Deduplicate by filename - keep only the most recent version
    seen_filenames = {}
    unique_documents = []
    
    for doc in documents:
        if doc.filename not in seen_filenames:
            seen_filenames[doc.filename] = True
            unique_documents.append(doc)

    return [
        {
            "id": str(doc.id),
            "filename": doc.filename,
            "status": doc.status,
            "created_at": doc.created_at.isoformat(),
            "chunk_count": doc.chunk_count
        }
        for doc in unique_documents
    ]

@router.post("/process-all-pending")
async def process_all_pending(user: User = Depends(current_active_user)):
    """Manually trigger processing for all pending documents"""
    from app.worker import process_document

    pending_docs = await DocumentModel.find(
        DocumentModel.status == "pending"
    ).to_list()

    processed = []
    for doc in pending_docs:
        doc_id = str(doc.id)
        # Process in background thread
        asyncio.get_event_loop().run_in_executor(_executor, _process_document_sync, doc_id)
        processed.append({"id": doc_id, "filename": doc.filename})

    return {"message": f"Processing {len(processed)} documents", "documents": processed}

@router.post("/cleanup-duplicates")
async def cleanup_duplicate_documents(user: User = Depends(current_active_user)):
    """Remove duplicate documents from the database, keeping only the most recent version of each filename"""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only professors can clean up documents")

    # Get all courses
    from app.models.course import Course
    courses = await Course.find().to_list()
    
    removed_count = 0
    for course in courses:
        # Get all documents for this course
        docs = await DocumentModel.find(
            DocumentModel.course_id == course.id
        ).sort(-DocumentModel.created_at).to_list()
        
        # Track which filenames we've seen
        seen_filenames = {}
        duplicates_to_remove = []
        
        for doc in docs:
            if doc.filename not in seen_filenames:
                seen_filenames[doc.filename] = True
            else:
                # This is a duplicate, mark for removal
                duplicates_to_remove.append(doc)
        
        # Remove duplicates
        for dup in duplicates_to_remove:
            await dup.delete()
            removed_count += 1
            print(f"🗑️ Removed duplicate document: {dup.filename} (ID: {dup.id})")

    return {"message": f"Removed {removed_count} duplicate documents", "removed_count": removed_count}
