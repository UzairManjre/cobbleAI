from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from beanie import init_beanie
from app.models.user import User
from app.models.course import Course, Enrolment, CourseInvite
from app.models.document import DocumentModel
from app.models.graph import KnowledgeGraph, StudySession, ChatMessage
from app.models.study_plan import StudyPlan, StudyProgress, TopicStudyPlan
from app.models.test import Test, TestAttempt, MockTest, TestAnalytics
from app.models.analytics import (
    AnalyticsEvent,
    AnalyticsAggregate,
    AnalyticsUserProfile,
    AnalyticsNodeMetrics,
    AnalyticsLLMUsage,
    AnalyticsRAGPerformance,
)

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def connect_to_mongo():
    db.client = AsyncIOMotorClient(
        settings.MONGO_URI,
        uuidRepresentation="standard"  # Fix UUID encoding
    )
    database = db.client[settings.DATABASE_NAME]
    print(f"Connected to MongoDB ({settings.DATABASE_NAME}).")

    # Initialize Beanie for all models
    await init_beanie(
        database=database,
        document_models=[
            # Core business models
            User, Course, Enrolment, CourseInvite,
            DocumentModel,
            KnowledgeGraph, StudySession, ChatMessage,
            StudyPlan, StudyProgress, TopicStudyPlan,
            Test, TestAttempt, MockTest, TestAnalytics,
            # Analytics models
            AnalyticsEvent,
            AnalyticsAggregate,
            AnalyticsUserProfile,
            AnalyticsNodeMetrics,
            AnalyticsLLMUsage,
            AnalyticsRAGPerformance,
        ]
    )
    print("Initialized Beanie for all models with UUID support.")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        print("Closed MongoDB connection.")

def get_database():
    return db.client[settings.DATABASE_NAME]
