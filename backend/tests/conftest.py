"""Shared offline test fixtures.

Everything runs without live services:
- MongoDB  -> mongomock-motor, with Beanie initialised from the real model registry
- Qdrant   -> qdrant-client local in-memory mode (opt-in `qdrant_memory` fixture)
- Models   -> deterministic fake embedder / cross-encoder (no downloads)
- LLM      -> scripted `fake_llm` fixture
- Auth     -> `api_client(user)` overrides current_active_user for a given user
"""

import asyncio
import hashlib
import math
import re
import uuid
from typing import List

import httpx
import pytest
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from app.models.registry import ALL_DOCUMENT_MODELS

_mongo_client = AsyncMongoMockClient(tz_aware=True)
_TEST_DB = "cobble_test"


@pytest.fixture(scope="session", autouse=True)
def _beanie():
    asyncio.run(init_beanie(database=_mongo_client[_TEST_DB], document_models=ALL_DOCUMENT_MODELS))
    yield


@pytest.fixture(autouse=True)
def _clean_db():
    yield

    async def _drop():
        db = _mongo_client[_TEST_DB]
        for name in await db.list_collection_names():
            await db[name].delete_many({})

    asyncio.run(_drop())


#   Fake retrieval models

_WORD_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> List[str]:
    return _WORD_RE.findall((text or "").lower())


def fake_vector(text: str, dim: int = 384) -> List[float]:
    """Bag-of-words hashing vector: texts sharing words get high cosine similarity."""
    vec = [0.0] * dim
    for tok in _tokens(text):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class _FakeArray(list):
    def tolist(self):
        return [list(v) if isinstance(v, list) else v for v in self]


class FakeSentenceTransformer:
    def encode(self, texts, **kwargs):
        if isinstance(texts, str):
            return _FakeArray(fake_vector(texts))
        return _FakeArray(_FakeArray(fake_vector(t)) for t in texts)


class FakeCrossEncoder:
    def predict(self, pairs, **kwargs):
        # Logit-like score: word overlap between query and passage, centred around 0
        scores = []
        for query, doc in pairs:
            q, d = set(_tokens(query)), set(_tokens(doc))
            overlap = len(q & d) / max(len(q), 1)
            scores.append(overlap * 10 - 5)
        return _FakeArray(scores)


@pytest.fixture(autouse=True)
def _fake_models():
    from app.services import embeddings
    prev = (embeddings.embedder._model, embeddings.cross_encoder._model)
    embeddings.embedder._model = FakeSentenceTransformer()
    embeddings.cross_encoder._model = FakeCrossEncoder()
    yield
    embeddings.embedder._model, embeddings.cross_encoder._model = prev


#   Fake LLM

class FakeLLM:
    """Scripted stand-in for LLMAdapter. Queue responses with `.queue(...)`;
    when the queue is empty `default` is returned."""

    def __init__(self):
        self.responses: List[str] = []
        self.default = "This is a scripted tutor answer."
        self.calls: List[dict] = []

    def queue(self, *responses: str):
        self.responses.extend(responses)

    def _next(self) -> str:
        return self.responses.pop(0) if self.responses else self.default

    async def generate_response(self, adapter, system, messages, max_tokens=4096, stream=True, **kwargs):
        self.calls.append({"system": system, "messages": messages, **kwargs})
        text = self._next()
        # Stream in a few pieces, like Ollama does
        step = max(1, len(text) // 3)
        for i in range(0, len(text), step):
            yield text[i:i + step]

    async def generate_full_response(self, adapter, system, messages, max_tokens=8192, **kwargs):
        self.calls.append({"system": system, "messages": messages, **kwargs})
        return self._next()


@pytest.fixture
def fake_llm(monkeypatch):
    from app.services.llm import LLMAdapter
    llm = FakeLLM()

    def _gen(self, system, messages, max_tokens=4096, stream=True, **kwargs):
        return llm.generate_response(self, system, messages, max_tokens, stream, **kwargs)

    async def _full(self, system, messages, max_tokens=8192, **kwargs):
        return await llm.generate_full_response(self, system, messages, max_tokens, **kwargs)

    monkeypatch.setattr(LLMAdapter, "generate_response", _gen)
    monkeypatch.setattr(LLMAdapter, "generate_full_response", _full)
    return llm


#   In-memory Qdrant

class _AsyncFacade:
    """Async view over a sync in-memory client so sync (ingestion) and async
    (retrieval) code paths share one store in tests."""

    def __init__(self, sync_client):
        self._sync = sync_client

    def __getattr__(self, name):
        attr = getattr(self._sync, name)
        if not callable(attr):
            return attr

        async def _call(*args, **kwargs):
            return attr(*args, **kwargs)
        return _call


@pytest.fixture
def qdrant_memory(monkeypatch):
    from qdrant_client import QdrantClient
    import app.core.qdrant as core_qdrant
    client = QdrantClient(":memory:")
    facade = _AsyncFacade(client)
    monkeypatch.setattr(core_qdrant, "qdrant_sync", client)
    monkeypatch.setattr(core_qdrant, "qdrant_async", facade)
    for module_name, attr, value in [
        ("app.services.chunking", "qdrant_sync", client),
        ("app.services.rag", "qdrant_async", facade),
        ("app.services.analytics_service", "qdrant_async", facade),
    ]:
        import importlib
        module = importlib.import_module(module_name)
        if hasattr(module, attr):
            monkeypatch.setattr(module, attr, value)
    yield client
    client.close()


#   Users and API client

@pytest.fixture
def make_user():
    from app.models.user import User

    async def _make(role: str = "student", name: str = None) -> User:
        user = User(
            email=f"{role}-{uuid.uuid4().hex[:8]}@test.local",
            hashed_password="not-a-real-hash",
            role=role,
            name=name or f"Test {role}",
            has_onboarded=True,
        )
        await user.insert()
        return user
    return _make


@pytest.fixture
def api_client():
    """`async with api_client(user) as client:` — requests authenticated as `user`."""
    from app.main import app
    from app.api.auth import current_active_user

    def _client(user):
        app.dependency_overrides[current_active_user] = lambda: user
        transport = httpx.ASGITransport(app=app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")

    yield _client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _no_live_broker(monkeypatch):
    """Tests never publish Celery tasks: a developer's Redis may be running, and a real worker
    would pick the task up. Tests that care patch the task's .delay themselves."""
    from celery.app.task import Task
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, args=None, kwargs=None, **options: sent.append((self.name, args)))
    return sent


@pytest.fixture
def no_celery(monkeypatch):
    """Capture Celery .delay() calls instead of needing a broker."""
    calls = []
    from app import worker
    monkeypatch.setattr(worker.process_document, "delay", lambda *a, **k: calls.append(("process_document", a)))
    return calls


async def drain_tasks():
    """Let fire-and-forget analytics tasks finish."""
    for _ in range(5):
        await asyncio.sleep(0)


#   Live-service scripts are opt-in: COBBLE_LIVE_TESTS=1 python -m pytest

import os

collect_ignore = [] if os.environ.get("COBBLE_LIVE_TESTS") == "1" else ["test_pipeline.py", "test_system.py"]


#   Fixtures expected by older API tests

@pytest.fixture
async def professor_user(make_user):
    return await make_user("professor")


@pytest.fixture
async def student_user(make_user):
    return await make_user("student")


@pytest.fixture
def student_token():
    # Auth is overridden at the dependency level, so the header value is not checked
    return "test-token"


@pytest.fixture
async def async_client(api_client, student_user):
    async with api_client(student_user) as client:
        yield client
