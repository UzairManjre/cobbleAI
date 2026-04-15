from celery import Celery
from celery.signals import worker_process_init
from app.core.config import settings

celery_app = Celery(
    "cobble_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL.replace("0", "1") # Uses DB 1 for results
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_soft_time_limit=300,
    task_time_limit=360,
    task_max_retries=3,
    # Auto-discover tasks from the worker and tasks modules
    imports=['app.worker', 'app.tasks.analytics_aggregation'],
    # ── Celery Beat schedule for analytics aggregation ────────
    beat_schedule={
        "compute-daily-aggregates": {
            "task": "analytics.compute_daily_aggregates",
            "schedule": 60.0 * 60.0 * 24.0,  # Every 24 hours
            "options": {"expires": 60 * 60 * 2},
        },
        "update-user-profiles": {
            "task": "analytics.update_user_profiles",
            "schedule": 60.0 * 60.0 * 25.0,  # Every 25 hours (after daily aggregates)
            "options": {"expires": 60 * 60 * 2},
        },
        "update-node-metrics": {
            "task": "analytics.update_node_metrics",
            "schedule": 60.0 * 60.0 * 6.0,  # Every 6 hours
            "options": {"expires": 60 * 60},
        },
        "detect-dropout-risk": {
            "task": "analytics.detect_dropout_risk",
            "schedule": 60.0 * 60.0 * 24.0 * 7.0,  # Every 7 days (weekly)
            "options": {"expires": 60 * 60 * 4},
        },
    },
)


@worker_process_init.connect
def init_worker_process(**kwargs):
    """Initialize Beanie ODM once when each Celery worker process starts.

    This prevents connection pool exhaustion and race conditions that would
    occur if we called init_beanie inside every task body.
    """
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
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

    print("🔧 Initializing Beanie for Celery worker process...")
    client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    database = client[settings.DATABASE_NAME]

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    loop.run_until_complete(init_beanie(
        database=database,
        document_models=[
            User, Course, Enrolment, CourseInvite,
            DocumentModel,
            KnowledgeGraph, StudySession, ChatMessage,
            StudyPlan, StudyProgress, TopicStudyPlan,
            Test, TestAttempt, MockTest, TestAnalytics,
            AnalyticsEvent,
            AnalyticsAggregate,
            AnalyticsUserProfile,
            AnalyticsNodeMetrics,
            AnalyticsLLMUsage,
            AnalyticsRAGPerformance,
        ],
    ))

    print("✅ Beanie initialized for Celery worker process.")
