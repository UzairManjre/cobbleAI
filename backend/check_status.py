import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def check():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client.get_default_database()
    doc = await db['documents'].find_one({'filename': 'MLA vs APA STYLE REFERENCING.pptx'})
    if doc:
        print(f"Status: {doc.get('status')}")
        print(f"Error: {doc.get('error_message')}")
    else:
        print("Document not found")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
