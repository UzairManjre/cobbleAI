import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

async def go():
    c = AsyncIOMotorClient("mongodb://localhost:27017").cobbleai
    cs = await c.Course.find().to_list(5)
    for x in cs:
        raw = x["_id"]
        print(f"raw={raw!r}  type={type(raw).__name__}")
        # Try UUID(bytes=raw)
        try:
            u = uuid.UUID(bytes=bytes(raw))
            print(f"  UUID(bytes)  => {u}")
        except Exception as e:
            print(f"  UUID(bytes) failed: {e}")
        # Try str()
        print(f"  str(raw)     => {str(raw)}")

asyncio.run(go())
