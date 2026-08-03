import pytest
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
from app.services.test_service import TestService

def create_mock_user(id=None, role="student"):
    user = MagicMock()
    user.id = id or uuid.uuid4()
    user.role = role
    return user

@pytest.mark.asyncio
async def test_student_get_course_tests_not_enrolled():
    """Verify that a student who is not enrolled gets a 403 when trying to list tests."""
    student_id = uuid.uuid4()
    course_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")

    mock_course = MagicMock()
    mock_course.id = course_id
    mock_course.professor_id = uuid.uuid4()

    with patch("app.models.course.Course.get", new_callable=AsyncMock) as mock_get_course, \
         patch("app.models.test.Test.find") as mock_find_test, \
         patch("app.repositories.course_repository.EnrolmentRepository.find_by_student_and_course", new_callable=AsyncMock) as mock_find_enrolment:
        
        mock_get_course.return_value = mock_course
        # Return None to simulate not being enrolled
        mock_find_enrolment.return_value = None

        with pytest.raises(HTTPException) as exc:
            await TestService.get_course_tests(mock_user, str(course_id))
        
        assert exc.value.status_code == 403
        assert exc.value.detail == "Not enrolled in this course"

@pytest.mark.asyncio
async def test_student_get_test_not_enrolled():
    """Verify that a student who is not enrolled gets a 403 when trying to get a specific test."""
    student_id = uuid.uuid4()
    course_id = uuid.uuid4()
    test_id = uuid.uuid4()
    mock_user = create_mock_user(id=student_id, role="student")

    mock_test = MagicMock()
    mock_test.id = test_id
    mock_test.course_id = course_id
    mock_test.professor_id = uuid.uuid4()
    mock_test.status = "published"

    with patch("app.models.test.Test.get", new_callable=AsyncMock) as mock_get_test, \
         patch("app.repositories.course_repository.EnrolmentRepository.find_by_student_and_course", new_callable=AsyncMock) as mock_find_enrolment:
        
        mock_get_test.return_value = mock_test
        # Return None to simulate not being enrolled
        mock_find_enrolment.return_value = None

        with pytest.raises(HTTPException) as exc:
            await TestService.get_test(mock_user, str(test_id))
        
        assert exc.value.status_code == 403
        assert exc.value.detail == "Not enrolled in this course"
