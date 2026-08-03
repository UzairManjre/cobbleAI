import pytest
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
from app.services.document_service import DocumentService
from app.models.document import DocumentModel

def create_mock_user(id=None, role="student"):
    user = MagicMock()
    user.id = id or uuid.uuid4()
    user.role = role
    return user

@pytest.mark.asyncio
async def test_student_list_documents_not_enrolled():
    """Verify that a student who is not enrolled gets a 403 when trying to list documents."""
    student_id = uuid.uuid4()
    course_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")

    mock_course = MagicMock()
    mock_course.id = course_id

    with patch("app.repositories.course_repository.CourseRepository.get_by_id", new_callable=AsyncMock) as mock_get_course, \
         patch("app.repositories.course_repository.EnrolmentRepository.find_by_student_and_course", new_callable=AsyncMock) as mock_find_enrolment:
        
        mock_get_course.return_value = mock_course
        # Return None to simulate not being enrolled
        mock_find_enrolment.return_value = None

        with pytest.raises(HTTPException) as exc:
            await DocumentService.list_student_documents(str(course_id), mock_user)
        
        assert exc.value.status_code == 403
        assert exc.value.detail == "Not enrolled"

@pytest.mark.asyncio
async def test_student_list_documents_only_ready():
    """Verify that a student who is enrolled can see the ready documents of that course."""
    student_id = uuid.uuid4()
    course_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")

    mock_course = MagicMock()
    mock_course.id = course_id

    mock_enrolment = MagicMock()

    mock_docs = [MagicMock(), MagicMock()]

    with patch("app.repositories.course_repository.CourseRepository.get_by_id", new_callable=AsyncMock) as mock_get_course, \
         patch("app.repositories.course_repository.EnrolmentRepository.find_by_student_and_course", new_callable=AsyncMock) as mock_find_enrolment, \
         patch("app.repositories.document_repository.DocumentRepository.find_ready_by_course", new_callable=AsyncMock) as mock_find_docs:
        
        mock_get_course.return_value = mock_course
        mock_find_enrolment.return_value = mock_enrolment
        mock_find_docs.return_value = mock_docs

        docs = await DocumentService.list_student_documents(str(course_id), mock_user)
        
        assert len(docs) == 2
        mock_find_docs.assert_called_once_with(course_id)
