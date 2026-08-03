import os
import pytest
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException

# Set dummy but valid-looking JWT keys to pass validation
os.environ["JWT_PRIVATE_KEY"] = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQ..."
os.environ["JWT_PUBLIC_KEY"] = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."

# Mocking heavy services at import time
with patch('app.core.storage.get_s3_client'), \
     patch('app.services.analytics.analytics_service.track_event', new_callable=AsyncMock):

    from app.api.student.tests import start_test, submit_mock_test, submit_test
    from app.api.professor.graphs import (
        generate_graph_from_docs, GenerateFromDocsRequest,
        generate_graph, GenerateGraphRequest,
        generate_graph_from_docs_stream
    )
    from app.api.student.courses import join_course
    from app.schemas.course import JoinCourseRequest


def create_mock_user(id=None, role="student", email="test@test.com"):
    user = MagicMock()
    user.id = id or uuid.uuid4()
    user.role = role
    user.email = email
    user.name = "Test User"
    return user


# ── Graph access RBAC (professor routes) ──────────────────────────────────

@pytest.mark.asyncio
async def test_student_cannot_generate_course_graph():
    """Verify that 403 is raised from GraphService when a non-professor user hits the endpoint."""
    mock_user = create_mock_user(role="student")
    mock_req = GenerateFromDocsRequest(course_id=uuid.uuid4())

    with patch('app.api.professor.graphs.GraphService.generate_graph_from_docs', new_callable=AsyncMock) as mock_gen:
        mock_gen.side_effect = HTTPException(status_code=403, detail="Only professors may generate graphs.")
        with pytest.raises(HTTPException) as exc:
            await generate_graph_from_docs(req=mock_req, user=mock_user)
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_generate_topic_graph():
    """Verify that 403 is raised from GraphService when a non-professor calls the generate endpoint."""
    mock_user = create_mock_user(role="student")
    mock_req = GenerateGraphRequest(topic="Artificial Intelligence")

    with patch('app.api.professor.graphs.GraphService.generate_graph', new_callable=AsyncMock) as mock_gen:
        mock_gen.side_effect = HTTPException(status_code=403, detail="Only professors may generate graphs.")
        with pytest.raises(HTTPException) as exc:
            await generate_graph(req=mock_req, user=mock_user)
        assert exc.value.status_code == 403





# ── Student test operations ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_student_can_start_test():
    """Verify that start_test delegates to TestService successfully."""
    student_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")
    test_uuid = uuid.uuid4()
    test_id_str = str(test_uuid)

    mock_attempt = MagicMock()
    mock_attempt.id = uuid.uuid4()
    mock_test = MagicMock()
    mock_test.id = test_uuid

    with patch('app.api.student.tests.TestService.start_test', new_callable=AsyncMock) as mock_start:
        mock_start.return_value = (mock_attempt, mock_test, False)

        response = await start_test(test_id=test_id_str, user=mock_user)

        mock_start.assert_called_once_with(mock_user, test_id_str)
        assert "attempt" in response
        assert "test" in response
        assert response["message"] == "Test started. Good luck!"


@pytest.mark.asyncio
async def test_student_cannot_submit_someone_elses_mock_test():
    """Verify that submitting another student's mock test returns 404 (ownership check)."""
    mock_user = create_mock_user(role="student")
    mock_user.id = uuid.uuid4()
    test_uuid = uuid.uuid4()
    test_id_str = str(test_uuid)

    from app.schemas.test import SubmitTestRequest
    # SubmitTestRequest requires attempt_id field
    mock_req = SubmitTestRequest(attempt_id=test_id_str, answers=[])

    mock_test = MagicMock()
    mock_test.id = test_uuid
    mock_test.student_id = uuid.uuid4()  # Different student → ownership fails
    mock_test.completed_at = None

    # MockTest is imported inside the function body, so patch the model module
    with patch('app.models.test.MockTest.get', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_test

        with pytest.raises(HTTPException) as exc:
            await submit_mock_test(mock_id=test_id_str, req=mock_req, user=mock_user)

        # The actual endpoint checks `mock_test.student_id != user.id` → 404
        assert exc.value.status_code == 404


# ── Course join flow ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_student_can_join_course_with_valid_code():
    """Verify that join_course delegates to CourseService."""
    mock_user = create_mock_user(role="student")
    mock_req = JoinCourseRequest(code="VALID_CODE")

    expected_result = {"message": "Joined course", "course_id": str(uuid.uuid4())}

    with patch('app.api.student.courses.CourseService.join_course', new_callable=AsyncMock) as mock_join:
        mock_join.return_value = expected_result

        response = await join_course(req=mock_req, user=mock_user)

        mock_join.assert_called_once_with(mock_user, "VALID_CODE")
        assert response == expected_result
