"""
Process all pending documents in the database using the fixed pipeline.
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.storage import get_s3_client, S3_BUCKET
from app.services.pdf_extractor import extract_text
from app.services.chunking import split_into_chunks, embed_and_store

async def process_all_pending():
    print("=" * 60)
    print("🔄 Processing All Pending Documents")
    print("=" * 60)
    
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client.get_default_database()
    
    # Get all pending documents
    pending_docs = await db["documents"].find({"status": "pending"}).to_list(None)
    
    if not pending_docs:
        print("\n✅ No pending documents found")
        client.close()
        return
    
    print(f"\n📦 Found {len(pending_docs)} pending documents\n")
    
    success_count = 0
    failed_count = 0
    
    for i, doc in enumerate(pending_docs, 1):
        doc_id = doc["_id"]
        doc_id_str = str(uuid.UUID(bytes=doc_id)) if isinstance(doc_id, bytes) else str(doc_id)
        
        print(f"\n{'=' * 60}")
        print(f"📄 [{i}/{len(pending_docs)}] {doc['filename']}")
        print(f"   ID: {doc_id_str}")
        print(f"{'=' * 60}")
        
        try:
            # Update status to processing
            await db["documents"].update_one(
                {"_id": doc_id},
                {"$set": {"status": "processing"}}
            )
            
            # Download from S3
            s3 = get_s3_client()
            s3_key = doc.get("s3_path") or doc.get("s3_key")
            response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            file_bytes = response['Body'].read()
            
            # Extract text
            file_type = doc.get("file_type", "pdf")
            raw_text = extract_text(file_type, file_bytes)
            
            # Chunk
            chunks = split_into_chunks(raw_text)
            
            # Embed & store
            course_id_raw = doc.get("course_id", "")
            course_id = str(uuid.UUID(bytes=course_id_raw)) if isinstance(course_id_raw, bytes) else str(course_id_raw)
            pushed_count = embed_and_store(chunks, course_id, doc_id_str)
            
            # Mark as ready
            await db["documents"].update_one(
                {"_id": doc_id},
                {"$set": {
                    "status": "ready",
                    "chunk_count": pushed_count,
                    "processed_at": datetime.now()
                }}
            )
            
            print(f"\n✅ SUCCESS: {pushed_count} chunks stored")
            success_count += 1
            
        except Exception as e:
            import traceback
            print(f"\n❌ FAILED: {e}")
            print(traceback.format_exc()[:500])
            
            await db["documents"].update_one(
                {"_id": doc_id},
                {"$set": {
                    "status": "failed",
                    "error_message": str(e),
                    "processed_at": datetime.now()
                }}
            )
            failed_count += 1
    
    print(f"\n{'=' * 60}")
    print("📊 Processing Complete!")
    print(f"{'=' * 60}")
    print(f"✅ Success: {success_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"📦 Total: {len(pending_docs)}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(process_all_pending())
