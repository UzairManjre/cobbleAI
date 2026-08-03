"""
Test the document processing pipeline with an existing document from the database.
This bypasses the need for login tokens and directly tests the pipeline.
"""
import asyncio
import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.storage import get_s3_client, S3_BUCKET
from app.services.pdf_extractor import extract_text
from app.services.chunking import split_into_chunks, embed_and_store
from datetime import datetime

async def test_pipeline():
    print("=" * 60)
    print("🧪 Testing Document Processing Pipeline")
    print("=" * 60)
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client.get_default_database()
    
    # Get first pending document
    doc = await db["documents"].find_one({"status": "pending"})
    
    if not doc:
        # Try to get any document
        doc = await db["documents"].find_one()
        if not doc:
            print("❌ No documents found in database")
            client.close()
            return
    
    doc_id = doc["_id"]
    doc_id_str = str(doc_id)
    
    print(f"\n📄 Testing with document:")
    print(f"   ID: {doc_id_str}")
    print(f"   Filename: {doc['filename']}")
    print(f"   Current Status: {doc['status']}")
    print(f"   S3 Path: {doc.get('s3_path', 'N/A')}")
    print()
    
    # Step 1: Update status to processing
    print("⏳ Step 1: Setting status to 'processing'...")
    await db["documents"].update_one(
        {"_id": doc_id},
        {"$set": {"status": "processing"}}
    )
    print("   ✅ Status updated\n")
    
    try:
        # Step 2: Download from S3/MinIO
        print("⏳ Step 2: Downloading from MinIO...")
        s3 = get_s3_client()
        s3_key = doc.get("s3_path") or doc.get("s3_key")
        
        if not s3_key:
            raise ValueError("No S3 path found in document")
        
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        file_bytes = response['Body'].read()
        print(f"   ✅ Downloaded {len(file_bytes):,} bytes\n")
        
        # Step 3: Extract text
        print("⏳ Step 3: Extracting text from PDF...")
        file_type = doc.get("file_type", "pdf")
        raw_text = extract_text(file_type, file_bytes)
        print(f"   ✅ Extracted {len(raw_text):,} characters")
        print(f"   Preview: {raw_text[:200]}...\n")
        
        # Step 4: Chunk the text
        print("⏳ Step 4: Chunking text...")
        chunks = split_into_chunks(raw_text)
        print(f"   ✅ Created {len(chunks)} chunks")
        print(f"   Sample chunk 1: {chunks[0][:150]}...\n")
        
        # Step 5: Embed and store in Qdrant
        print("⏳ Step 5: Embedding chunks and storing in Qdrant...")
        course_id_raw = doc.get("course_id", "")
        # Convert UUID bytes to string
        if isinstance(course_id_raw, bytes):
            course_id = str(uuid.UUID(bytes=course_id_raw))
        else:
            course_id = str(course_id_raw)
        
        doc_id_uuid_str = str(uuid.UUID(bytes=doc_id)) if isinstance(doc_id, bytes) else str(doc_id)
        
        print(f"   Course ID (converted): {course_id}")
        print(f"   Doc ID (converted): {doc_id_uuid_str}")
        
        pushed_count = embed_and_store(chunks, course_id, doc_id_uuid_str)
        print(f"   ✅ Pushed {pushed_count} chunks to Qdrant\n")
        
        # Step 6: Mark as ready
        print("⏳ Step 6: Updating document status to 'ready'...")
        await db["documents"].update_one(
            {"_id": doc_id},
            {"$set": {
                "status": "ready",
                "chunk_count": pushed_count,
                "processed_at": datetime.utcnow()
            }}
        )
        print(f"   ✅ Document marked as 'ready'\n")
        
        print("=" * 60)
        print("🎉 SUCCESS! Pipeline test completed!")
        print("=" * 60)
        print(f"\n📊 Summary:")
        print(f"   Document: {doc['filename']}")
        print(f"   File Size: {len(file_bytes):,} bytes")
        print(f"   Extracted Text: {len(raw_text):,} characters")
        print(f"   Chunks Created: {len(chunks)}")
        print(f"   Vectors Stored: {pushed_count}")
        print(f"   Final Status: ready")
        print()
        
    except Exception as e:
        import traceback
        print(f"\n❌ Pipeline failed!")
        print(f"   Error: {e}")
        print(f"\n📋 Full traceback:")
        print(traceback.format_exc())
        
        # Mark as failed
        await db["documents"].update_one(
            {"_id": doc_id},
            {"$set": {
                "status": "failed",
                "error_message": str(e),
                "processed_at": datetime.utcnow()
            }}
        )
        print(f"\n   ❌ Document marked as 'failed'")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(test_pipeline())
