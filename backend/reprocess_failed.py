import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
from datetime import datetime
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.storage import get_s3_client, S3_BUCKET
from app.services.pdf_extractor import extract_text
from app.services.chunking import split_into_chunks, embed_and_store

async def reprocess_failed():
    client = AsyncIOMotorClient('mongodb://localhost:27017/cobbleai')
    db = client.get_default_database()
    
    failed = await db['documents'].find({"status": "failed"}).to_list(None)
    
    print(f"Reprocessing {len(failed)} failed documents...\n")
    
    for doc in failed:
        doc_id = doc["_id"]
        doc_id_str = str(uuid.UUID(bytes=doc_id)) if isinstance(doc_id, bytes) else str(doc_id)
        
        print(f"📄 {doc['filename']}")
        
        try:
            await db["documents"].update_one({"_id": doc_id}, {"$set": {"status": "processing", "error_message": None}})
            
            s3 = get_s3_client()
            s3_key = doc.get("s3_path")
            file_bytes = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)['Body'].read()
            
            raw_text = extract_text(doc.get("file_type", "pdf"), file_bytes)
            chunks = split_into_chunks(raw_text)
            
            course_id_raw = doc.get("course_id", "")
            course_id = str(uuid.UUID(bytes=course_id_raw)) if isinstance(course_id_raw, bytes) else str(course_id_raw)
            
            pushed = embed_and_store(chunks, course_id, doc_id_str)
            
            await db["documents"].update_one(
                {"_id": doc_id},
                {"$set": {"status": "ready", "chunk_count": pushed, "processed_at": datetime.now()}}
            )
            print(f"   ✅ Ready ({pushed} chunks)\n")
        except Exception as e:
            print(f"   ❌ {e}\n")
            await db["documents"].update_one({"_id": doc_id}, {"$set": {"status": "failed", "error_message": str(e)}})
    
    client.close()

asyncio.run(reprocess_failed())
