import os
import pytest
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException

# Set dummy but valid-looking JWT keys to pass validation
os.environ["JWT_PRIVATE_KEY"] = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQ..."
os.environ["JWT_PUBLIC_KEY"] = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."

# Mocking heavy services
with patch('app.core.storage.get_s3_client'), \
     patch('app.services.analytics.analytics_service.track_event', new_callable=AsyncMock):
    
    from app.models.course import CourseInvite, Enrolment
    from app.models.document import DocumentModel
    from app.models.test import TestAttempt, MockTest, Test
    
    # Pre-mock Beanie class properties to avoid Pydantic class attribute lookups failing
    CourseInvite.code = MagicMock()
    Enrolment.course_id = MagicMock()
    Enrolment.student_id = MagicMock()
    DocumentModel.course_id = MagicMock()
    DocumentModel.status = MagicMock()
    TestAttempt.test_id = MagicMock()
    TestAttempt.student_id = MagicMock()
    TestAttempt.status = MagicMock()
    Test.course_id = MagicMock()
    
    from app.api.tests import start_test, submit_mock_test
    from app.api.graphs import (
        generate_graph_from_docs, GenerateFromDocsRequest,
        generate_graph, GenerateGraphRequest,
        generate_graph_from_docs_stream
    )
    from app.api.courses import join_course, JoinCourseRequest

def create_mock_user(id=None, role="student", email="test@test.com"):
    user = MagicMock()
    user.id = id or uuid.uuid4()
    user.role = role
    user.email = email
    user.name = "Test User"
    return user

@pytest.mark.asyncio
async def test_student_cannot_generate_course_graph():
    """Verify that students receive a 403 when trying to generate a graph from docs."""
    mock_user = create_mock_user(role="student")
    mock_req = GenerateFromDocsRequest(course_id=uuid.uuid4())
    
    with pytest.raises(HTTPException) as exc:
        await generate_graph_from_docs(req=mock_req, user=mock_user)
    
    assert exc.value.status_code == 403
    assert "Only professors" in exc.value.detail

@pytest.mark.asyncio
async def test_student_cannot_generate_topic_graph():
    """Verify that students receive a 403 when trying to generate a graph from topic."""
    mock_user = create_mock_user(role="student")
    mock_req = GenerateGraphRequest(topic="Artificial Intelligence")
    
    with pytest.raises(HTTPException) as exc:
        await generate_graph(req=mock_req, user=mock_user)
    
    assert exc.value.status_code == 403
    assert "Only professors" in exc.value.detail

@pytest.mark.asyncio
async def test_student_cannot_stream_graph_generation():
    """Verify that students receive a 403 when trying to stream graph generation."""
    student_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")
    mock_req_obj = MagicMock()
    
    with patch('app.models.user.User.get', new_callable=AsyncMock) as mock_get_user:
        mock_get_user.return_value = mock_user
        
        with pytest.raises(HTTPException) as exc:
            await generate_graph_from_docs_stream(
                course_id=uuid.uuid4(),
                request=mock_req_obj,
                user_id=str(student_id)
            )
            
        assert exc.value.status_code == 403
        assert "Only professors" in exc.value.detail

@pytest.mark.asyncio
async def test_student_can_start_test():
    """Verify that students can start a test."""
    student_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")
    test_uuid = uuid.uuid4()
    test_id_str = str(test_uuid)
    
    with patch('app.models.test.Test.get', new_callable=AsyncMock) as mock_get, \
         patch('app.api.tests.TestAttempt') as mock_attempt_class:
        
        mock_test = MagicMock()
        mock_test.id = test_uuid
        mock_test.course_id = uuid.uuid4()
        mock_test.status = "published"
        mock_test.allow_retakes = True
        mock_get.return_value = mock_test
        
        mock_attempt_class.find_one = AsyncMock(return_value=None)
        
        mock_attempt_instance = MagicMock()
        mock_attempt_instance.insert = AsyncMock()
        mock_attempt_class.return_value = mock_attempt_instance
        
        response = await start_test(test_id=test_id_str, user=mock_user)
        
        assert response["test"].id == test_uuid
        assert mock_attempt_instance.insert.called

@pytest.mark.asyncio
async def test_student_cannot_submit_someone_elses_mock_test():
    """Verify that students cannot submit another student's mock test."""
    mock_user = create_mock_user(role="student")
    test_uuid = uuid.uuid4()
    test_id_str = str(test_uuid)
    
    from app.api.tests import SubmitTestRequest
    mock_req = SubmitTestRequest(attempt_id=test_id_str, answers=[])
    
    with patch('app.models.test.MockTest.get', new_callable=AsyncMock) as mock_get:
        mock_test = MagicMock()
        mock_test.id = test_uuid
        mock_test.student_id = uuid.uuid4() # Different student
        mock_get.return_value = mock_test
        
        with pytest.raises(HTTPException) as exc:
            await submit_mock_test(mock_test_id=test_id_str, req=mock_req, user=mock_user)
        
        assert exc.value.status_code == 403
        assert "not your mock test" in exc.value.detail.lower()

@pytest.mark.asyncio
async def test_student_can_join_course_with_valid_code():
    """Verify that students can join a course via code."""
    mock_user = create_mock_user(role="student")
    mock_req = JoinCourseRequest(code="VALID_CODE")
    
    with patch('app.models.course.CourseInvite.find_one', new_callable=AsyncMock) as mock_find_invite, \
         patch('app.api.courses.Enrolment') as mock_enrolment_class, \
         patch('app.api.courses._safe_track_event'):
        
        from datetime import datetime, timedelta, timezone
        
        mock_invite = MagicMock()
        mock_invite.course_id = uuid.uuid4()
        mock_invite.code = "VALID_CODE"
        mock_invite.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
        mock_find_invite.return_value = mock_invite
        
        mock_enrolment_class.find_one = AsyncMock(return_value=None)
        
        mock_enrolment_instance = MagicMock()
        mock_enrolment_instance.insert = AsyncMock()
        mock_enrolment_class.return_value = mock_enrolment_instance
        
        response = await join_course(req=mock_req, user=mock_user)
        
        assert mock_enrolment_instance.insert.called
