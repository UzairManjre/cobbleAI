import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def reprocess():
    client = AsyncIOMotorClient('mongodb://localhost:27017/cobbleai')
    db = client.get_default_database()
    
    # Get all pending documents
    docs = await db['documents'].find({"status": "pending"}).to_list(None)
    
    if not docs:
        print("No pending documents found")
        client.close()
        return
    
    print(f"Found {len(docs)} pending documents. Re-triggering processing...\n")
    
    # Import and trigger Celery tasks
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    from app.worker import process_document
    
    for doc in docs:
        doc_id = str(doc["_id"])
        print(f"Triggering processing for: {doc['filename']}")
        print(f"  Document ID: {doc_id}")
        process_document.delay(doc_id)
        print("  ✅ Task queued\n")
    
    print(f"Queued {len(docs)} document processing tasks")
    client.close()

asyncio.run(reprocess())
