from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from contextlib import asynccontextmanager
from app.core.db import connect_to_mongo, close_mongo_connection
from app.core.storage import ensure_bucket_exists
from app.core.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.analytics import setup_analytics_middleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB, Redis, Qdrant here
    print("Starting up Cobble AI backend...")
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Analytics middleware   auto-tracks all API requests
setup_analytics_middleware(app)

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Import and register all routers
from app.api import auth, courses, documents, chat, graphs, sessions, analytics, study_plans, tests

# Auth routes
app.include_router(auth.auth_router, prefix="/auth/jwt", tags=["auth"])
app.include_router(auth.register_router, prefix="/auth", tags=["auth"])
app.include_router(auth.users_router, prefix="/users", tags=["users"])

app.include_router(courses.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(graphs.router)
app.include_router(sessions.router)
app.include_router(analytics.router)
app.include_router(study_plans.router)
app.include_router(tests.router)


#   Backwards-compat redirect for old double-prefix URLs  
# Any client hitting /api/api/study-plans/... gets a 307 redirect to /api/study-plans/...
@app.middleware("http")
async def redirect_legacy_api_prefix(request: Request, call_next):
    if request.url.path.startswith("/api/api/"):
        new_path = request.url.path.replace("/api/api/", "/api/", 1)
        if request.url.query:
            new_path = f"{new_path}?{request.url.query}"
        return RedirectResponse(url=new_path, status_code=307)
    return await call_next(request)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
