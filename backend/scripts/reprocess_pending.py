import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
from app.models.document import DocumentModel
from app.worker import process_document

async def main():
    client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    database = client[settings.DATABASE_NAME]
    await init_beanie(database=database, document_models=[DocumentModel])
    from beanie.operators import In
    pending_docs = await DocumentModel.find(In(DocumentModel.status, ["pending", "failed", "processing"])).to_list()
    print(f"Found {len(pending_docs)} pending documents.")
    
    for doc in pending_docs:
        print(f"Re-triggering processing for document: {doc.filename}")
        process_document.delay(str(doc.id))
        
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
