import os
import pytest
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException

# Set dummy but valid-looking JWT keys to pass validation
os.environ["JWT_PRIVATE_KEY"] = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQ..."
os.environ["JWT_PUBLIC_KEY"] = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."

with patch('app.core.storage.get_s3_client'), \
     patch('app.services.analytics.analytics_service.track_event', new_callable=AsyncMock):
    
    from app.api.professor.grading import trigger_grading_draft, DraftCreateRequest
    from app.models.test import Test, TestAttempt
    from app.models.grading import Rubric, GradingDraft
    from app.services.grading import grading_service
    from app.models.user import User

def create_mock_user(id=None, role="professor", email="prof@test.com"):
    user = MagicMock(spec=User)
    user.id = id or uuid.uuid4()
    user.role = role
    user.email = email
    return user

@pytest.mark.asyncio
async def test_trigger_draft_unauthorized_course_access():
    prof1_id = uuid.uuid4()
    prof2_id = uuid.uuid4()
    prof2 = create_mock_user(id=prof2_id, role="professor")

    test_id = uuid.uuid4()
    submission_id = uuid.uuid4()

    mock_attempt = MagicMock(spec=TestAttempt)
    mock_attempt.test_id = test_id

    mock_test = MagicMock(spec=Test)
    mock_test.professor_id = prof1_id # Owned by prof 1
    mock_test.test_type = "assignment"

    # Mock the static methods .get() on the models
    with patch.object(TestAttempt, 'get', new_callable=AsyncMock) as mock_attempt_get, \
         patch.object(Test, 'get', new_callable=AsyncMock) as mock_test_get:
        
        mock_attempt_get.return_value = mock_attempt
        mock_test_get.return_value = mock_test

        req = DraftCreateRequest(submission_text="My answer is gravity.")
        
        # prof2 tries to grade prof1's submission
        with pytest.raises(HTTPException) as exc:
            await trigger_grading_draft(submission_id, req, prof2)
        
        assert exc.value.status_code == 403
        assert "Not your assignment" in str(exc.value.detail)

@pytest.mark.asyncio
async def test_trigger_draft_idempotent_creates_only_one():
    prof1_id = uuid.uuid4()
    prof1 = create_mock_user(id=prof1_id, role="professor")

    test_id = uuid.uuid4()
    submission_id = uuid.uuid4()
    rubric_id = uuid.uuid4()

    mock_attempt = MagicMock(spec=TestAttempt)
    mock_attempt.test_id = test_id

    mock_test = MagicMock(spec=Test)
    mock_test.professor_id = prof1_id
    mock_test.test_type = "assignment"

    mock_rubric = MagicMock(spec=Rubric)
    mock_rubric.id = rubric_id

    # The returned draft
    mock_draft = MagicMock(spec=GradingDraft)
    mock_draft.submission_id = submission_id
    mock_draft.rubric_id = rubric_id
    mock_draft.criteria_evaluations = []
    mock_draft.total_score = 0.0
    mock_draft.status = "needs_review"

    with patch.object(TestAttempt, 'get', new_callable=AsyncMock) as mock_attempt_get, \
         patch.object(Test, 'get', new_callable=AsyncMock) as mock_test_get, \
         patch.object(Rubric, 'find_one', new_callable=AsyncMock) as mock_rubric_find, \
         patch.object(grading_service, 'generate_draft', new_callable=AsyncMock) as mock_gen_draft:
        
        mock_attempt_get.return_value = mock_attempt
        mock_test_get.return_value = mock_test
        mock_rubric_find.return_value = mock_rubric
        mock_gen_draft.return_value = mock_draft

        req = DraftCreateRequest(submission_text="My answer is gravity.")
        
        res1 = await trigger_grading_draft(submission_id, req, prof1)
        assert res1 == mock_draft
        mock_gen_draft.assert_called_once()
        
        # Test idempotency using GradingDraft.find_one inside grading_service.generate_draft
        # But we mocked grading_service.generate_draft above. So let's test grading_service directly.

@pytest.mark.asyncio
async def test_grading_service_idempotency():
    # Test that grading_service.generate_draft checks DB before calling LLM
    submission_id = uuid.uuid4()
    rubric_id = uuid.uuid4()
    
    mock_rubric = MagicMock(spec=Rubric)
    mock_rubric.id = rubric_id

    mock_existing_draft = MagicMock(spec=GradingDraft)
    mock_existing_draft.submission_id = submission_id
    mock_existing_draft.rubric_id = rubric_id
    mock_existing_draft.criteria_evaluations = []
    mock_existing_draft.total_score = 10.0
    mock_existing_draft.status = "needs_review"
    
    
    with patch.object(GradingDraft, 'find_one', new_callable=AsyncMock) as mock_find_draft:
        # DB already has a draft
        mock_find_draft.return_value = mock_existing_draft
        
        # Run service
        result = await grading_service.generate_draft(submission_id, mock_rubric, "text")
        
        # Should return existing and NOT process LLM
        assert result == mock_existing_draft
        # Ensure we called find_one with correct query
        mock_find_draft.assert_called_once_with({"submission_id": submission_id})


@pytest.mark.asyncio
async def test_student_regrade_request_authorization():
    from app.api.student.grading import create_regrade_request, RegradeRequestInput
    from app.models.grading import RegradeRequest
    
    student1_id = uuid.uuid4()
    student2_id = uuid.uuid4()
    student2 = create_mock_user(id=student2_id, role="student")
    
    draft_id = uuid.uuid4()
    submission_id = uuid.uuid4()
    criterion_id = uuid.uuid4()
    
    mock_draft = MagicMock(spec=GradingDraft)
    mock_draft.id = draft_id
    mock_draft.submission_id = submission_id
    
    mock_attempt = MagicMock(spec=TestAttempt)
    mock_attempt.student_id = student1_id  # owned by student 1
    
    with patch.object(GradingDraft, 'get', new_callable=AsyncMock) as mock_draft_get, \
         patch.object(TestAttempt, 'get', new_callable=AsyncMock) as mock_attempt_get, \
         patch.object(RegradeRequest, 'find_one', new_callable=AsyncMock) as mock_rr_find:
         
        mock_draft_get.return_value = mock_draft
        mock_attempt_get.return_value = mock_attempt
        mock_rr_find.return_value = None
        
        req = RegradeRequestInput(criterion_id=criterion_id, student_comment="Please re-check this.")
        
        # student 2 tries to request regrade for student 1's submission
        with pytest.raises(HTTPException) as exc:
            await create_regrade_request(draft_id, req, student2)
            
        assert exc.value.status_code == 403
        assert "Not your submission" in str(exc.value.detail)

        # student 1 tries to request regrade for their own submission
        student1 = create_mock_user(id=student1_id, role="student")
        
        with patch('app.api.student.grading.RegradeRequest') as mock_rr_class:
            mock_rr_instance = MagicMock()
            mock_rr_instance.criterion_id = criterion_id
            mock_rr_instance.student_comment = "Please re-check this."
            mock_rr_instance.save = AsyncMock()
            mock_rr_class.return_value = mock_rr_instance
            mock_rr_class.find_one = AsyncMock(return_value=None)
            
            res = await create_regrade_request(draft_id, req, student1)
            assert res.criterion_id == criterion_id
            assert res.student_comment == "Please re-check this."
            mock_rr_instance.save.assert_called_once()

@pytest.mark.asyncio
async def test_approve_draft_anomaly_validation():
    from app.api.professor.grading import approve_draft
    from app.models.grading import CriterionDraft
    
    prof_id = uuid.uuid4()
    prof = create_mock_user(id=prof_id, role="professor")
    
    draft_id = uuid.uuid4()
    
    mock_attempt = MagicMock(spec=TestAttempt)
    mock_attempt.test_id = uuid.uuid4()
    
    mock_test = MagicMock(spec=Test)
    mock_test.professor_id = prof_id
    mock_test.test_type = "assignment"
    
    # Draft is anomaly_flagged but has a missing override
    mock_draft = MagicMock(spec=GradingDraft)
    mock_draft.id = draft_id
    mock_draft.status = "anomaly_flagged"
    mock_draft.submission_id = uuid.uuid4()
    
    c1 = MagicMock(spec=CriterionDraft)
    c1.override_score = 10.0
    c2 = MagicMock(spec=CriterionDraft)
    c2.override_score = None  # Missing override!
    
    mock_draft.criteria_evaluations = [c1, c2]
    
    with patch.object(GradingDraft, 'get', new_callable=AsyncMock) as mock_draft_get, \
         patch.object(TestAttempt, 'get', new_callable=AsyncMock) as mock_attempt_get, \
         patch.object(Test, 'get', new_callable=AsyncMock) as mock_test_get:
         
        mock_draft_get.return_value = mock_draft
        mock_attempt_get.return_value = mock_attempt
        mock_test_get.return_value = mock_test
        
        with pytest.raises(HTTPException) as exc:
            await approve_draft(draft_id, prof)
            
        assert exc.value.status_code == 400
        assert "Cannot approve an anomaly_flagged draft without providing override scores" in str(exc.value.detail)

        # Now fix the missing override
        c2.override_score = 5.0
        mock_draft.save = AsyncMock()
        
        res = await approve_draft(draft_id, prof)
        assert res.status == "approved"
        assert res.approved_by_professor_id == prof_id
        mock_draft.save.assert_called_once()


@pytest.mark.asyncio
async def test_publish_assignment_authorization():
    from app.api.professor.grading import publish_assignment_drafts
    
    prof1_id = uuid.uuid4()
    prof2_id = uuid.uuid4()
    prof2 = create_mock_user(id=prof2_id, role="professor")
    
    test_id = uuid.uuid4()
    
    mock_test = MagicMock(spec=Test)
    mock_test.professor_id = prof1_id # owned by prof1
    mock_test.test_type = "assignment"
    
    with patch.object(Test, 'get', new_callable=AsyncMock) as mock_test_get:
        mock_test_get.return_value = mock_test
        
        # prof2 tries to publish prof1's assignment
        with pytest.raises(HTTPException) as exc:
            await publish_assignment_drafts(test_id, prof2)
            
        assert exc.value.status_code == 403
        assert "Not your assignment" in str(exc.value.detail)

