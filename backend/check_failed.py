import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_failed():
    client = AsyncIOMotorClient('mongodb://localhost:27017/cobbleai')
    db = client.get_default_database()
    failed = await db['documents'].find({"status": "failed"}).to_list(None)
    
    print(f"Failed documents: {len(failed)}\n")
    for doc in failed:
        print(f"Filename: {doc['filename']}")
        print(f"Error: {doc.get('error_message', 'N/A')}")
        print()
    
    client.close()

asyncio.run(check_failed())
