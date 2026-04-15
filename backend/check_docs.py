import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017/cobbleai')
    db = client.get_default_database()
    docs = await db['documents'].find().to_list(None)
    print('Documents in DB:')
    for d in docs:
        print(f'  ID: {d["_id"]}')
        print(f'  Filename: {d["filename"]}')
        print(f'  Status: {d["status"]}')
        print(f'  S3 Path: {d.get("s3_path", "N/A")}')
        print(f'  Course ID: {d["course_id"]}')
        print()
    client.close()

asyncio.run(check())
