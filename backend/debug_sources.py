"""
Debug script to check document IDs and Qdrant payloads
"""
import asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from app.models.user import User
from app.models.document import DocumentModel
from app.models.course import Course
from app.models.graph import KnowledgeGraph
from app.core.qdrant import qdrant_sync
import uuid

async def main():
    # Connect to MongoDB
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client.cobbleai, document_models=[User, DocumentModel, Course, KnowledgeGraph])
    
    print("=" * 80)
    print("DOCUMENTS IN MONGODB")
    print("=" * 80)
    
    docs = await DocumentModel.find_all().to_list()
    print(f"\nTotal documents: {len(docs)}\n")
    
    for doc in docs:
        print(f"ID: {doc.id}")
        print(f"  Filename: {doc.filename}")
        print(f"  Course ID: {doc.course_id}")
        print(f"  Status: {doc.status}")
        print(f"  Chunk Count: {doc.chunk_count}")
        print()
    
    print("=" * 80)
    print("COURSES")
    print("=" * 80)
    
    courses = await Course.find_all().to_list()
    print(f"\nTotal courses: {len(courses)}\n")
    
    for course in courses:
        print(f"ID: {course.id}")
        print(f"  Title: {course.title}")
        print(f"  Documents: {len(course.documents) if hasattr(course, 'documents') and course.documents else 0}")
        print()
    
    print("=" * 80)
    print("QDRANT COLLECTIONS")
    print("=" * 80)
    
    try:
        collections = qdrant_sync.get_collections()
        print(f"\nTotal collections: {len(collections.collections)}\n")
        
        for collection in collections.collections:
            collection_name = collection.name
            print(f"Collection: {collection_name}")
            
            try:
                # Get a sample point to see payload structure
                points = qdrant_sync.query_points(
                    collection_name=collection_name,
                    query=[0.0] * 384,  # Dummy query
                    limit=1
                ).points
                
                if points:
                    sample = points[0]
                    print(f"  Sample payload keys: {list(sample.payload.keys())}")
                    print(f"  Has 'filename'? {'filename' in sample.payload}")
                    print(f"  Has 'doc_id'? {'doc_id' in sample.payload}")
                    if 'doc_id' in sample.payload:
                        print(f"  Sample doc_id: {sample.payload['doc_id']}")
                    if 'filename' in sample.payload:
                        print(f"  Sample filename: {sample.payload['filename']}")
                else:
                    print("  No points in collection")
            except Exception as e:
                print(f"  Error querying collection: {e}")
            print()
    except Exception as e:
        print(f"Error listing collections: {e}")

if __name__ == "__main__":
    asyncio.run(main())
