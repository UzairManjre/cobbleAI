import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["cobble"]
    test = await db.tests.find_one({"_id": uuid.UUID("2f119e0d-d2fc-48a0-a794-62308231a036")})
    print("Test found:", test is not None)
    if test:
        print(test.keys())

asyncio.run(run())
