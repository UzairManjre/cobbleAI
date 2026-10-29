from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from beanie import init_beanie
from app.models.registry import ALL_DOCUMENT_MODELS

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def connect_to_mongo():
    db.client = AsyncIOMotorClient(
        settings.MONGO_URI,
        uuidRepresentation="standard",  # Fix UUID encoding
        tz_aware=True,  # Return aware UTC datetimes so arithmetic with now(timezone.utc) works
    )
    database = db.client[settings.DATABASE_NAME]
    print(f"Connected to MongoDB ({settings.DATABASE_NAME}).")

    # Initialize Beanie for all models
    await init_beanie(database=database, document_models=ALL_DOCUMENT_MODELS)
    print("Initialized Beanie for all models with UUID support.")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        print("Closed MongoDB connection.")

def get_database():
    return db.client[settings.DATABASE_NAME]
