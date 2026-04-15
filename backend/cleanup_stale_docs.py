"""
Clean up database entries for documents whose files don't exist in MinIO storage.
Run this BEFORE re-uploading documents.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.storage import get_s3_client, S3_BUCKET
from botocore.exceptions import ClientError

async def cleanup_stale_documents():
    """Remove documents from DB that don't have files in MinIO"""
    client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    db = client.get_default_database()
    s3 = get_s3_client()
    
    # Get all documents
    documents = await db["documents"].find({}).to_list(None)
    print(f"Found {len(documents)} documents in database")
    
    removed = 0
    kept = 0
    
    for doc in documents:
        s3_key = doc.get("s3_path") or doc.get("s3_key")
        filename = doc.get("filename", "unknown")
        
        if not s3_key:
            print(f"  ❌ {filename}: No S3 key, removing")
            await db["documents"].delete_one({"_id": doc["_id"]})
            removed += 1
            continue
        
        # Check if file exists in S3
        try:
            s3.head_object(Bucket=S3_BUCKET, Key=s3_key)
            print(f"  ✅ {filename}: File exists in storage")
            kept += 1
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                print(f"  ❌ {filename}: File NOT in MinIO, removing")
                await db["documents"].delete_one({"_id": doc["_id"]})
                removed += 1
            else:
                print(f"  ⚠️  {filename}: Error checking: {e}")
    
    print(f"\n📊 Summary:")
    print(f"   Kept: {kept} documents")
    print(f"   Removed: {removed} stale entries")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(cleanup_stale_documents())
