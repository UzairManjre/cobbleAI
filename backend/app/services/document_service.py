import uuid
import time
import asyncio
from datetime import datetime, timezone
from typing import List
from fastapi import UploadFile, HTTPException
from app.models.document import DocumentModel
from app.models.user import User
from app.core.storage import get_s3_client, S3_BUCKET
from app.core.config import settings
from app.utils.telemetry import safe_track_event

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
}
MAX_SIZE = 50 * 1024 * 1024  # 50 MB

class DocumentService:
    @staticmethod
    async def upload_documents(course_id: str, files: List[UploadFile], user: User):
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course_id")

        from app.models.course import Course
        course = await Course.get(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")

        uploaded_docs = []
        upload_start = time.time()

        import re
        for file in files:
            file.filename = re.sub(r'[^a-zA-Z0-9_\.-]', '_', file.filename or "unnamed")
            if file.content_type not in ALLOWED_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid file type for {file.filename}. Allowed: PDF, DOCX, PPTX")

            file.file.seek(0, 2)
            size = file.file.tell()
            if size > MAX_SIZE:
                raise HTTPException(status_code=400, detail=f"File size exceeds 50MB limit for {file.filename}")
            file.file.seek(0)

            existing_doc = await DocumentModel.find_one(
                DocumentModel.course_id == course_uuid,
                DocumentModel.filename == file.filename
            )

            if existing_doc:
                print(f"  Skipping {file.filename}: already exists in course {course_id}")
                continue

            doc_id = uuid.uuid4()
            s3 = get_s3_client()
            file_extension = ALLOWED_TYPES[file.content_type]
            s3_key = f"courses/{course_id}/documents/{doc_id}.{file_extension}"

            s3.upload_fileobj(
                file.file,
                S3_BUCKET,
                s3_key,
                ExtraArgs={"ContentType": file.content_type}
            )

            doc = DocumentModel(
                id=doc_id,
                filename=file.filename,
                course_id=course_uuid,
                s3_path=s3_key,
                status="pending",
                file_type=file_extension
            )
            await doc.insert()
            uploaded_docs.append(doc)

            safe_track_event(
                event_type="document_uploaded",
                event_category="document",
                user_id=user.id,
                user_role=user.role,
                course_id=course_uuid,
                document_id=doc_id,
                payload={"filename": file.filename, "file_type": file_extension, "size_bytes": size}
            )

            # Trigger async processing using celery
            from app.worker import process_document
            process_document.delay(str(doc_id))

        return {
            "message": f"Successfully uploaded {len(uploaded_docs)} documents",
            "uploaded": [d.filename for d in uploaded_docs],
            "skipped": len(files) - len(uploaded_docs)
        }

    @staticmethod
    async def process_document_sync(doc_id: str):
        """Process document synchronously (designed to run in celery/thread pool)"""
        import sys
        import os
        from app.services.pdf_extractor import extract_text
        from app.services.chunking import split_into_chunks, embed_and_store
        from motor.motor_asyncio import AsyncIOMotorClient
        from app.core.config import settings

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def process():
            client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
            db = client.get_default_database()
            
            try:
                doc_uuid = uuid.UUID(doc_id)
                doc = await db["documents"].find_one({"_id": doc_uuid})

                if not doc:
                    return

                await db["documents"].update_one(
                    {"_id": doc_uuid},
                    {"$set": {"status": "processing"}}
                )

                try:
                    proc_start = time.time()
                    s3 = get_s3_client()
                    s3_key = doc.get("s3_path") or doc.get("s3_key")
                    response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
                    file_bytes = response['Body'].read()

                    file_type = doc.get("file_type", "pdf")
                    raw_text = extract_text(file_type, file_bytes)
                    chunks = split_into_chunks(raw_text)

                    course_id_raw = doc.get("course_id", "")
                    course_id = str(uuid.UUID(bytes=course_id_raw)) if isinstance(course_id_raw, bytes) else str(course_id_raw)
                    doc_id_str = str(uuid.UUID(bytes=doc_id)) if isinstance(doc_id, bytes) else str(doc_id)
                    filename = doc.get("filename")

                    pushed_count = embed_and_store(chunks, course_id, doc_id_str, filename)
                    processing_time_ms = int((time.time() - proc_start) * 1000)

                    await db["documents"].update_one(
                        {"_id": doc_uuid},
                        {"$set": {
                            "status": "ready",
                            "chunk_count": pushed_count,
                            "processed_at": datetime.now(timezone.utc)
                        }}
                    )

                    safe_track_event(
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
                    )

                    pending_count = await db["documents"].count_documents({
                        "course_id": doc.get("course_id"),
                        "status": "pending"
                    })
                    
                    if pending_count == 0:
                        from app.services.graph_service import GraphService
                        asyncio.create_task(GraphService.generate_graph_for_course(course_id))

                except Exception as e:
                    processing_time_ms = int((time.time() - proc_start) * 1000)
                    await db["documents"].update_one(
                        {"_id": doc_uuid},
                        {"$set": {
                            "status": "failed",
                            "error_message": str(e),
                            "processed_at": datetime.now(timezone.utc)
                        }}
                    )

                    safe_track_event(
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
                    )
            finally:
                client.close()
        
        loop.run_until_complete(process())

    @staticmethod
    async def list_documents(course_id: str, user: User):
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course_id")
            
        from app.models.course import Course
        course = await Course.get(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")
            
        docs = await DocumentModel.find(DocumentModel.course_id == course_uuid).to_list()
        return docs

    @staticmethod
    async def delete_document(doc_id: str, user: User):
        try:
            doc_uuid = uuid.UUID(doc_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_id")
            
        doc = await DocumentModel.get(doc_uuid)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
            
        from app.models.course import Course
        course = await Course.get(doc.course_id)
        if not course or course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your document")
            
        s3 = get_s3_client()
        try:
            s3.delete_object(Bucket=S3_BUCKET, Key=doc.s3_path)
        except Exception as e:
            print(f"Error deleting from S3: {e}")
            
        try:
            from app.core.config import settings
            from qdrant_client import QdrantClient
            from qdrant_client.http import models as rest
            
            qdrant = QdrantClient(url=settings.QDRANT_URL)
            qdrant.delete(
                collection_name="cobble_chunks",
                points_selector=rest.Filter(
                    must=[
                        rest.FieldCondition(
                            key="document_id",
                            match=rest.MatchValue(value=doc_id)
                        )
                    ]
                )
            )
        except Exception as e:
            print(f"Error deleting from Qdrant: {e}")
            
        await doc.delete()
        
        safe_track_event(
            event_type="document_deleted",
            event_category="document",
            user_id=user.id,
            user_role=user.role,
            course_id=doc.course_id,
            document_id=doc_uuid,
            payload={"filename": doc.filename}
        )
        
        return {"message": "Document deleted successfully"}

    @staticmethod
    async def cleanup_duplicates(course_id: str, user: User):
        try:
            course_uuid = uuid.UUID(course_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid course ID")

        from app.models.course import Course
        course = await Course.get(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")

        all_docs = await DocumentModel.find(DocumentModel.course_id == course_uuid).to_list()
        seen_names = set()
        to_delete = []

        for doc in all_docs:
            if doc.filename in seen_names:
                to_delete.append(doc)
            else:
                seen_names.add(doc.filename)

        if not to_delete:
            return {"message": "No duplicate documents found", "deleted_count": 0}

        s3 = get_s3_client()
        for doc in to_delete:
            try:
                s3.delete_object(Bucket=S3_BUCKET, Key=doc.s3_path)
                await doc.delete()
            except Exception as e:
                print(f"Error deleting duplicate {doc.id}: {e}")

        safe_track_event(
            event_type="duplicates_cleaned",
            event_category="document",
            user_id=user.id,
            user_role=user.role,
            course_id=course_uuid,
            payload={"deleted_count": len(to_delete)}
        )

        return {
            "message": f"Successfully removed {len(to_delete)} duplicate documents",
            "deleted_count": len(to_delete)
        }
