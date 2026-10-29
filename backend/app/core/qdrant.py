from qdrant_client import QdrantClient, AsyncQdrantClient
from app.core.config import settings

# Async client for FastAPI routes (retrieval)
qdrant_async = AsyncQdrantClient(url=settings.QDRANT_URL)

# Sync client for Celery workers (ingestion path)
qdrant_sync = QdrantClient(url=settings.QDRANT_URL)

DENSE_VECTOR = "dense"
SPARSE_VECTOR = "bm25"
DENSE_SIZE = 384  # all-MiniLM-L6-v2

# Payload fields filtered on at query/delete time
_PAYLOAD_INDEXES = ("doc_id", "source_type", "media_type", "chapter_id")


def legacy_collection_name(course_id: str) -> str:
    """v1 collection: one unnamed dense vector per point, no location metadata."""
    return f"course_{course_id}"


def collection_name(course_id: str) -> str:
    """v2 collection: named `dense` + sparse `bm25` vectors and located payloads."""
    return f"course_{course_id}_v2"


def _client(client=None):
    # Resolve at call time so tests can swap the module-level client
    return client if client is not None else qdrant_sync


def ensure_collection_v2(course_id: str, client=None) -> str:
    from qdrant_client import models

    c = _client(client)
    name = collection_name(course_id)
    if c.collection_exists(name):
        return name
    try:
        c.create_collection(
            collection_name=name,
            vectors_config={DENSE_VECTOR: models.VectorParams(size=DENSE_SIZE, distance=models.Distance.COSINE)},
            sparse_vectors_config={SPARSE_VECTOR: models.SparseVectorParams(modifier=models.Modifier.IDF)},
        )
    except Exception as e:
        # Another worker may have created it between the check and the create
        if "already exists" not in str(e).lower() and "409" not in str(e):
            raise
    for field in _PAYLOAD_INDEXES:
        try:
            c.create_payload_index(name, field, models.PayloadSchemaType.KEYWORD)
        except Exception:
            pass  # local mode ignores payload indexes; an existing index is fine
    return name


def delete_document_vectors(course_id: str, doc_id: str, client=None) -> None:
    """Remove every chunk of a document from the course's vector collections."""
    from qdrant_client.http import models as rest

    c = _client(client)
    selector = rest.FilterSelector(filter=rest.Filter(must=[
        rest.FieldCondition(key="doc_id", match=rest.MatchValue(value=doc_id))
    ]))
    for name in (collection_name(course_id), legacy_collection_name(course_id)):
        if c.collection_exists(name):
            c.delete(collection_name=name, points_selector=selector)


def check_server_version(min_version=(1, 10)) -> None:
    """Warn if the Qdrant server is too old for sparse vectors with the IDF modifier."""
    try:
        version = qdrant_sync.info().version
        parts = tuple(int(p) for p in version.split(".")[:2])
        if parts < min_version:
            print(f"  WARNING: Qdrant {version} is older than {'.'.join(map(str, min_version))}; "
                  "BM25 hybrid retrieval needs >= 1.10. Upgrade the qdrant image.")
        else:
            print(f"  Qdrant server {version}")
    except Exception as e:
        print(f"  Could not read Qdrant version: {e}")
