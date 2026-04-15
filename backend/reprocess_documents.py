"""
Reprocess all documents for a course to fix Qdrant/MongoDB ID mismatch
"""
import asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from app.models.user import User
from app.models.document import DocumentModel
from app.models.course import Course
from app.core.qdrant import qdrant_sync
from app.services.pdf_extractor import extract_text
from app.services.chunking import split_into_chunks, embed_and_store
from app.core.storage import get_s3_client, S3_BUCKET
import uuid

async def main():
    # Connect to MongoDB
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client.cobbleai, document_models=[User, DocumentModel, Course])
    
    # Course ID from debug output - the one with documents
    course_id_str = "81004487-94b2-4f3f-9de8-5a79a42365ef"
    
    try:
        course_uuid = uuid.UUID(course_id_str)
        course = await Course.get(course_uuid)
        courses = [course] if course else []
    except ValueError:
        print("Invalid UUID")
        return
    
    if not courses:
        print("No courses found!")
        return
    
    for course in courses:
        print(f"\n{'='*80}")
        print(f"Processing course: {course.title} ({course.id})")
        print(f"{'='*80}\n")
        
        collection_name = f"course_{course.id}"
        
        # Delete old Qdrant collection
        try:
            print(f"🗑️  Deleting old Qdrant collection: {collection_name}")
            qdrant_sync.delete_collection(collection_name)
            print("✅ Old collection deleted")
        except Exception as e:
            print(f"⚠️  Could not delete collection (might not exist): {e}")
        
        # Get all documents for this course
        docs = await DocumentModel.find(DocumentModel.course_id == course.id).to_list()
        print(f"\n📄 Found {len(docs)} documents to reprocess\n")
        
        for doc in docs:
            print(f"\n{'─'*80}")
            print(f"Processing: {doc.filename}")
            print(f"Document ID: {doc.id}")
            print(f"{'─'*80}")
            
            try:
                # Download from S3
                s3 = get_s3_client()
                print(f"  ⬇️  Downloading from S3: {doc.s3_path}")
                response = s3.get_object(Bucket=S3_BUCKET, Key=doc.s3_path)
                file_bytes = response['Body'].read()
                print(f"  ✅ Downloaded {len(file_bytes)} bytes")
                
                # Extract text
                print(f"  📝 Extracting text from {doc.file_type}...")
                raw_text = extract_text(doc.file_type, file_bytes)
                print(f"  ✅ Extracted {len(raw_text)} characters")
                
                # Chunk
                print(f"  ✂️  Chunking text...")
                chunks = split_into_chunks(raw_text)
                print(f"  ✅ Created {len(chunks)} chunks")
                
                # Embed and store with filename
                print(f"  💾 Embedding and storing in Qdrant...")
                pushed_count = embed_and_store(chunks, str(course.id), str(doc.id), doc.filename)
                print(f"  ✅ Stored {pushed_count} chunks with filename: {doc.filename}")
                
                # Update document status
                doc.status = "ready"
                doc.chunk_count = pushed_count
                await doc.save()
                print(f"  ✅ Updated document status to 'ready'")
                
            except Exception as e:
                import traceback
                print(f"  ❌ Failed to process document: {e}")
                print(traceback.format_exc())
                doc.status = "failed"
                doc.error_message = str(e)
                await doc.save()
        
        print(f"\n{'='*80}")
        print(f"✅ Course {course.title} reprocessing complete!")
        print(f"{'='*80}\n")

if __name__ == "__main__":
    asyncio.run(main())
