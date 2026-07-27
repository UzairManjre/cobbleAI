import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from qdrant_client import AsyncQdrantClient

async def check():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.cobbleai

    # Check documents
    docs = await db.documents.find().to_list(length=5)
    print("=== DOCUMENTS ===")
    for d in docs:
        print(f"  course_id={d.get('course_id')} type={type(d.get('course_id')).__name__}")
        print(f"  filename={d.get('filename')} chunks={d.get('chunk_count')} size={d.get('file_size_bytes')}")

    # Check courses
    courses = await db.Course.find().to_list(length=5)
    print("\n=== COURSES ===")
    for c in courses:
        print(f"  _id={c['_id']} type={type(c['_id']).__name__} title={c.get('title')}")

    # Check Qdrant
    qc = AsyncQdrantClient(url="http://localhost:6333")
    colls = await qc.get_collections()
    print("\n=== QDRANT COLLECTIONS ===")
    for coll in colls.collections:
        print(f"  {coll.name}")

    # Scroll test
    print("\n=== SCROLL TEST ===")
    for coll in colls.collections:
        try:
            pts, _ = await qc.scroll(coll.name, limit=2, with_vectors=True, with_payload=True)
            if pts:
                vec = pts[0].vector
                vec_type = type(vec).__name__
                vec_info = ""
                if isinstance(vec, dict):
                    vec_info = f" keys={list(vec.keys())}"
                    first_key = list(vec.keys())[0]
                    vec_info += f" len({first_key})={len(vec[first_key])}"
                elif isinstance(vec, list):
                    vec_info = f" len={len(vec)}"
                print(f"  {coll.name}: {len(pts)} pts, vec_type={vec_type}{vec_info}")
                if pts[0].payload:
                    print(f"    payload_keys={list(pts[0].payload.keys())}")
            else:
                print(f"  {coll.name}: 0 points")
        except Exception as e:
            print(f"  {coll.name}: ERROR {e}")

asyncio.run(check())
