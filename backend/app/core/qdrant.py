from qdrant_client import QdrantClient, AsyncQdrantClient
from app.core.config import settings

# Async client for FastAPI routes (retrieval)
qdrant_async = AsyncQdrantClient(url=settings.QDRANT_URL)

# Sync client for Celery workers (ingestion path)
qdrant_sync = QdrantClient(url=settings.QDRANT_URL)
