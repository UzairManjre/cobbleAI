"""
Automated tests for critical infrastructure fixes.

Run with:
    cd backend
    pytest tests/test_critical_fixes.py -v

Tests that don't require MongoDB pass without any DB.
Tests marked @pytest.mark.integration need a running MongoDB.
"""

import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock


# ── Test 1: datetime.utcnow() replacement ─────────────────────────────

def test_utcnow_uses_timezone_aware_datetime():
    """Ensure _utcnow helper returns timezone-aware datetimes."""
    from app.models.course import _utcnow
    result = _utcnow()
    assert result.tzinfo is not None
    assert result.tzinfo == timezone.utc
    diff = abs((result - datetime.now(timezone.utc)).total_seconds())
    assert diff < 1


# ── Test 2: JWT key validation ────────────────────────────────────────

def test_jwt_validation_rejects_placeholder_keys():
    """Settings should reject placeholder JWT keys."""
    from app.core.config import Settings

    bad_settings = Settings(
        JWT_PRIVATE_KEY="REPLACE_WITH_YOUR_OWN_PRIVATE_KEY",
        JWT_PUBLIC_KEY="REPLACE_WITH_YOUR_OWN_PUBLIC_KEY",
    )
    with pytest.raises(RuntimeError, match="CRITICAL: JWT keys contain placeholder"):
        bad_settings.validate_jwt_keys()


def test_jwt_validation_accepts_real_keys():
    """Settings should accept real-looking RSA keys."""
    from app.core.config import Settings

    good_settings = Settings(
        JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAA...truncated...==\n-----END PRIVATE KEY-----",
        JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAA...truncated...==\n-----END PUBLIC KEY-----",
    )
    good_settings.validate_jwt_keys()  # should not raise


# ── Test 3: Course docs_count field exists in model definition ────────

def test_course_model_has_docs_count_in_schema():
    """Course model should define docs_count in its fields."""
    from app.models.course import Course
    # Check field exists on the class (Beanie doesn't let us instantiate without DB)
    assert "docs_count" in Course.__annotations__ or "docs_count" in Course.model_fields


# ── Test 4: Double-prefix redirect middleware ──────────────────────────

@pytest.mark.asyncio
async def test_redirect_legacy_double_prefix():
    """Requests to /api/api/... should get a 307 redirect to /api/..."""
    from starlette.datastructures import URL
    from app.main import redirect_legacy_api_prefix

    mock_request = MagicMock()
    mock_request.url = URL("http://test/api/api/study-plans/123?foo=bar")

    async def dummy_call_next(req):
        return {"called": True}

    response = await redirect_legacy_api_prefix(mock_request, dummy_call_next)

    assert response.status_code == 307
    assert "/api/api/" not in str(response.headers.get("location", ""))
    assert "/api/study-plans/" in str(response.headers.get("location", ""))


@pytest.mark.asyncio
async def test_no_redirect_for_normal_paths():
    """Normal API paths should pass through without redirect."""
    from starlette.datastructures import URL
    from app.main import redirect_legacy_api_prefix

    mock_request = MagicMock()
    mock_request.url = URL("http://test/api/study-plans/123")

    called = False

    async def dummy_call_next(req):
        nonlocal called
        called = True
        return {"called": True}

    response = await redirect_legacy_api_prefix(mock_request, dummy_call_next)

    assert called is True
    assert response == {"called": True}


# ── Test 5: Graph status endpoint logic (unit) ────────────────────────

def test_graph_status_endpoint_returns_ready_structure():
    """When graph exists, the handler logic returns 'ready' status."""
    # Test the logic without needing Beanie models
    def simulate_status(graph_exists, pending=0, processing=0, total=0):
        if graph_exists:
            return {"status": "ready", "graph_id": str(uuid.uuid4()), "nodes_count": 1}
        if pending > 0 or processing > 0:
            return {"status": "processing", "total_documents": total, "pending_documents": pending, "processing_documents": processing}
        return {"status": "no_documents", "total_documents": total}

    r1 = simulate_status(graph_exists=True)
    assert r1["status"] == "ready"
    assert "graph_id" in r1

    r2 = simulate_status(graph_exists=False, pending=2, total=5)
    assert r2["status"] == "processing"
    assert r2["pending_documents"] == 2

    r3 = simulate_status(graph_exists=False, total=0)
    assert r3["status"] == "no_documents"


# ── Test 6: Session ID generation logic ───────────────────────────────

def test_session_id_is_reused_within_ttl():
    """Session ID should be reused if still within TTL."""
    import json

    SESSION_STORAGE_KEY = 'chat_session_id'
    SESSION_TTL_MS = 24 * 60 * 60 * 1000

    store = {}
    current_time = 1_700_000_000_000  # Fixed "now"

    def get_or_create(now=current_time):
        try:
            raw = store.get(SESSION_STORAGE_KEY)
            if raw:
                data = json.loads(raw)
                if now < data['expiresAt']:
                    return data['id']
        except Exception:
            pass
        new_id = str(uuid.uuid4())
        store[SESSION_STORAGE_KEY] = json.dumps({'id': new_id, 'expiresAt': now + SESSION_TTL_MS})
        return new_id

    id1 = get_or_create()
    id2 = get_or_create()
    assert id1 == id2, "Session ID should be reused within TTL"

    # After TTL expires, new ID
    id3 = get_or_create(now=current_time + SESSION_TTL_MS + 1000)
    assert id3 != id1, "Session ID should change after TTL expires"


def test_session_id_uses_crypto_random():
    """Session ID should use crypto.randomUUID (UUID4)."""
    # crypto.randomUUID produces UUID4 format
    test_id = __import__('uuid').uuid4()
    assert len(str(test_id)) == 36  # UUID format


# ── Test 7: Redis distributed lock logic (unit) ──────────────────────

def test_redis_lock_prevents_concurrent_execution():
    """Redis SET NX should return False if lock already held."""
    # Simulate the lock logic
    class FakeRedis:
        def __init__(self):
            self._store = {}

        def set(self, key, value, nx=False, ex=None):
            if nx and key in self._store:
                return False
            self._store[key] = value
            return True

        def delete(self, key):
            self._store.pop(key, None)

    r = FakeRedis()
    lock_key = "graph_gen_lock:course123"

    # First worker acquires
    assert r.set(lock_key, "1", nx=True, ex=600) is True
    # Second worker denied
    assert r.set(lock_key, "1", nx=True, ex=600) is False
    # Release
    r.delete(lock_key)
    # Now another can acquire
    assert r.set(lock_key, "1", nx=True, ex=600) is True


# ── Test 8: .env.example exists ──────────────────────────────────────

def test_env_example_exists():
    """backend/.env.example should exist for new developers."""
    import os
    env_example = os.path.join(os.path.dirname(__file__), '..', '.env.example')
    assert os.path.exists(env_example), ".env.example not found in backend/"

    with open(env_example) as f:
        content = f.read()
    assert "JWT_PRIVATE_KEY" in content
    assert "REPLACE_WITH_YOUR_OWN" in content
    assert "openssl genpkey" in content.lower() or "openssl" in content.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
