import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    db = client.get_default_database()
    graphs = await db.knowledge_graphs.find().to_list(100)
    print(f"Found {len(graphs)} graphs")
    for g in graphs:
        print(f"Graph ID: {g['_id']}, Course ID: {g.get('course_id')}, Nodes: {len(g.get('nodes', []))}")

asyncio.run(main())
