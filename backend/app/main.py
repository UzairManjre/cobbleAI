from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from app.core.db import connect_to_mongo, close_mongo_connection
from app.core.storage import ensure_bucket_exists
from app.core.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.analytics import setup_analytics_middleware
from app.core.config import settings
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB, Redis, Qdrant here
    print("Starting up Cobble AI backend...")
    
    # Startup validation for default placeholder secrets
    if settings.AWS_SECRET_ACCESS_KEY == "minioadmin" or settings.SECRET_KEY == "temp_secret_key":
        raise RuntimeError("CRITICAL: AWS_SECRET_ACCESS_KEY or SECRET_KEY still hold their default placeholder values")

    await connect_to_mongo()
    
    # Ensure MinIO bucket exists
    try:
        ensure_bucket_exists()
        print("  MinIO bucket ready")
    except Exception as e:
        print(f"  MinIO bucket error: {e}")
    
    yield
    # Shutdown: Close connections here
    print("Shutting down Cobble AI backend...")
    await close_mongo_connection()

app = FastAPI(
    title="Cobble AI API",
    description="Education platform RAG architecture backend",
    version="2.0",
    lifespan=lifespan
)
app.state.limiter = limiter

# CORS middleware MUST be added before routers
if settings.ENVIRONMENT == "production":
    allowed_origins = [
        "https://cobbleai.com",
        "https://www.cobbleai.com",
    ]
else:
    allowed_origins = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Analytics middleware   auto-tracks all API requests
setup_analytics_middleware(app)

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Import and register all routers
from app.api import auth
from app.api.professor import courses as professor_courses, documents as professor_documents, graphs as professor_graphs, tests as professor_tests, grading as professor_grading
from app.api.student import courses as student_courses, sessions as student_sessions, study_plans as student_study_plans, tests as student_tests, grading as student_grading, documents as student_documents
from app.api.common import chat as common_chat, analytics as common_analytics

# Auth routes
app.include_router(auth.auth_router, prefix="/auth/jwt", tags=["auth"])
app.include_router(auth.register_router, prefix="/auth", tags=["auth"])
app.include_router(auth.users_router, prefix="/users", tags=["users"])

# Professor routes
app.include_router(professor_courses.router, prefix="/api/professor")
app.include_router(professor_documents.router, prefix="/api/professor")
app.include_router(professor_graphs.router, prefix="/api/professor")
app.include_router(professor_tests.router, prefix="/api/professor")
app.include_router(professor_grading.router, prefix="/api/professor")
app.include_router(student_sessions.router, prefix="/api/professor")

# Student routes
app.include_router(student_courses.router, prefix="/api/student")
app.include_router(student_sessions.router, prefix="/api/student")
app.include_router(student_study_plans.router, prefix="/api/student")
app.include_router(student_tests.router, prefix="/api/student")
app.include_router(student_grading.router, prefix="/api/student")
app.include_router(student_documents.router, prefix="/api/student")

# Common routes
app.include_router(common_chat.router, prefix="/api")
app.include_router(common_analytics.router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
