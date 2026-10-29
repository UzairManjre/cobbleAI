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
# Lecture recordings, identified by extension and checked against the browser's MIME type
MEDIA_EXTENSIONS = {"mp4", "webm", "mov", "mp3", "m4a", "wav"}
MEDIA_CONTENT_TYPES = {
    "mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime",
    "mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav",
}


def _classify_upload(filename: str, content_type: str | None):
    """(file_type, media_type, stored content type) or None when the file is not accepted."""
    if content_type in ALLOWED_TYPES:
        return ALLOWED_TYPES[content_type], "document", content_type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in MEDIA_EXTENSIONS and (content_type or "").split("/")[0] in ("video", "audio", "application"):
        return ext, "lecture", MEDIA_CONTENT_TYPES[ext]
    return None

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

        import os
        from werkzeug.utils import secure_filename
        
        for file in files:
            # Prevent path traversal by getting just the base filename
            file.filename = secure_filename(file.filename or "unnamed")
            kind = _classify_upload(file.filename, file.content_type)
            if kind is None:
                raise HTTPException(status_code=400, detail=f"Invalid file type for {file.filename}. Allowed: PDF, DOCX, PPTX, or lecture recordings (MP4, WEBM, MOV, MP3, M4A, WAV)")
            file_extension, media_type, stored_content_type = kind
            if media_type == "lecture" and not settings.LECTURE_PIPELINE:
                raise HTTPException(status_code=400, detail="Lecture recording processing is disabled on this server")

            file.file.seek(0, 2)
            size = file.file.tell()
            limit = settings.MAX_MEDIA_SIZE_MB * 1024 * 1024 if media_type == "lecture" else MAX_SIZE
            if size > limit:
                raise HTTPException(status_code=400, detail=f"File size exceeds {limit // (1024 * 1024)}MB limit for {file.filename}")
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
            folder = "lectures" if media_type == "lecture" else "documents"
            s3_key = f"courses/{course_id}/{folder}/{doc_id}.{file_extension}"

            # Streams from the spooled upload file, so large recordings are never held in memory
            await asyncio.to_thread(
                s3.upload_fileobj,
                file.file,
                S3_BUCKET,
                s3_key,
                ExtraArgs={"ContentType": stored_content_type},
            )

            doc = DocumentModel(
                id=doc_id,
                filename=file.filename,
                course_id=course_uuid,
                s3_path=s3_key,
                status="pending",
                file_type=file_extension,
                file_size_bytes=size,
                media_type=media_type,
                content_type=stored_content_type,
            )
            await doc.insert()
            uploaded_docs.append(doc)

            course.docs_count += 1
            await course.save()
            safe_track_event(
                event_type="document_uploaded",
                event_category="document",
                user_id=user.id,
                user_role=user.role,
                course_id=course_uuid,
                document_id=doc_id,
                payload={"filename": file.filename, "file_type": file_extension, "size_bytes": size, "media_type": media_type}
            )

            # Trigger async processing using celery (recordings go to the long-running media queue)
            if media_type == "lecture":
                from app.tasks.media import process_lecture
                process_lecture.delay(str(doc_id))
            else:
                from app.worker import process_document
                process_document.delay(str(doc_id))

        return {
            "message": f"Successfully uploaded {len(uploaded_docs)} documents",
            "uploaded": [d.filename for d in uploaded_docs],
            "skipped": len(files) - len(uploaded_docs)
        }

    @staticmethod
    async def list_documents(course_id: str, user: User):
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course_id")
            
        from app.repositories.course_repository import CourseRepository
        from app.repositories.document_repository import DocumentRepository
        
        course_repo = CourseRepository()
        course = await course_repo.get_by_id(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")
            
        doc_repo = DocumentRepository()
        docs = await doc_repo.find_by_course(course_uuid)
        return docs

    @staticmethod
    async def list_student_documents(course_id: str, user: User):
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course_id")
            
        from app.repositories.course_repository import CourseRepository, EnrolmentRepository
        from app.repositories.document_repository import DocumentRepository
        
        course_repo = CourseRepository()
        course = await course_repo.get_by_id(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
            
        if user.role == "student":
            enrolment_repo = EnrolmentRepository()
            enrolment = await enrolment_repo.find_by_student_and_course(user.id, course_uuid)
            if not enrolment:
                raise HTTPException(status_code=403, detail="Not enrolled")
                
        # Only return processed/ready documents to students
        doc_repo = DocumentRepository()
        docs = await doc_repo.find_ready_by_course(course_uuid)
        
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
            from app.core.qdrant import delete_document_vectors
            delete_document_vectors(str(doc.course_id), str(doc.id))
        except Exception as e:
            print(f"Error deleting from Qdrant: {e}")

        if doc.media_type == "lecture":
            from app.models.lecture import LectureChapter, LectureFrame, LectureTranscript
            for frame in await LectureFrame.find(LectureFrame.doc_id == doc.id).to_list():
                try:
                    s3.delete_object(Bucket=S3_BUCKET, Key=frame.s3_key)
                except Exception as e:
                    print(f"Error deleting frame from S3: {e}")
            await LectureFrame.find(LectureFrame.doc_id == doc.id).delete()
            await LectureChapter.find(LectureChapter.doc_id == doc.id).delete()
            await LectureTranscript.find(LectureTranscript.doc_id == doc.id).delete()

        await doc.delete()
        course.docs_count = max(0, course.docs_count - 1)
        await course.save()        
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
        from app.core.qdrant import delete_document_vectors
        for doc in to_delete:
            try:
                s3.delete_object(Bucket=S3_BUCKET, Key=doc.s3_path)
                delete_document_vectors(str(doc.course_id), str(doc.id))
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
