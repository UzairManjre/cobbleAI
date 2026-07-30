import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    db = client.get_default_database()
    sessions = await db.study_sessions.find().to_list(10)
    print(f"Found {len(sessions)} sessions")
    for s in sessions:
        print(f"Session ID: {s['_id']}, current_node_id: {s.get('current_node_id')}")

asyncio.run(main())
