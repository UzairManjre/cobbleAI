import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock
from app.models.grading import Rubric, RubricCriterion, GradingDraft, CriterionDraft
from app.services.grading import grading_service

# Beanie is initialised against mongomock by tests/conftest.py

@pytest.fixture
def sample_rubric():
    return Rubric(
        assignment_id=uuid.uuid4(),
        criteria=[
            RubricCriterion(name="Clarity", description="Clear and concise.", max_points=5.0),
            RubricCriterion(name="Accuracy", description="Factually correct.", max_points=10.0)
        ]
    )

@pytest.mark.asyncio
@patch('app.services.llm.LLMAdapter.generate_full_response', new_callable=AsyncMock)
@patch('app.models.grading.GradingDraft.save', new_callable=AsyncMock)
async def test_grading_normal_scoring(mock_save, mock_generate, sample_rubric):
    # Setup LLM mocks
    # First call is for anomaly detection
    # Next two calls are for the two rubric criteria
    mock_generate.side_effect = [
        "ANOMALY: NO\nREASON: None",
        '{"suggested_score": 4.0, "suggested_feedback": "Good clarity.", "ai_reasoning": "Reason 1"}',
        '{"suggested_score": 8.0, "suggested_feedback": "Mostly accurate.", "ai_reasoning": "Reason 2"}'
    ]
    
    submission_id = uuid.uuid4()
    submission_text = "This is a normal submission that addresses the prompt."
    
    draft = await grading_service.generate_draft(submission_id, sample_rubric, submission_text)
    
    assert draft.status == 'needs_review'
    assert len(draft.criteria_evaluations) == 2
    assert draft.total_score == 12.0
    
    assert draft.criteria_evaluations[0].suggested_score == 4.0
    assert draft.criteria_evaluations[0].ai_reasoning == "Reason 1"
    
    assert draft.criteria_evaluations[1].suggested_score == 8.0
    
    mock_save.assert_called_once()


@pytest.mark.asyncio
@patch('app.services.llm.LLMAdapter.generate_full_response', new_callable=AsyncMock)
@patch('app.models.grading.GradingDraft.save', new_callable=AsyncMock)
async def test_grading_anomaly_off_topic(mock_save, mock_generate, sample_rubric):
    mock_generate.return_value = "ANOMALY: YES\nREASON: Off-topic essay about a completely different subject."
    
    submission_id = uuid.uuid4()
    submission_text = "Let me tell you about my dog. He is a golden retriever..."
    
    draft = await grading_service.generate_draft(submission_id, sample_rubric, submission_text)
    
    assert draft.status == 'anomaly_flagged'
    assert draft.anomaly_reason == "Off-topic essay about a completely different subject."
    assert len(draft.criteria_evaluations) == 0
    assert draft.total_score == 0.0
    
    # Should only call generate once (for anomaly detection)
    mock_generate.assert_called_once()
    mock_save.assert_called_once()


@pytest.mark.asyncio
@patch('app.models.grading.GradingDraft.save', new_callable=AsyncMock)
async def test_grading_anomaly_blank(mock_save, sample_rubric):
    submission_id = uuid.uuid4()
    
    # Empty strings and whitespace should trigger anomaly without calling LLM
    draft = await grading_service.generate_draft(submission_id, sample_rubric, "   \n  ")
    
    assert draft.status == 'anomaly_flagged'
    assert draft.anomaly_reason == "Submission is completely blank."
    assert len(draft.criteria_evaluations) == 0
    
    mock_save.assert_called_once()


@pytest.mark.asyncio
@patch('app.models.grading.GradingDraft.find')
async def test_calibration_override_rate(mock_find, sample_rubric):
    criterion_1_id = sample_rubric.criteria[0].id
    
    # Create 10 mock drafts, 3 of which override criterion 1
    mock_drafts = []
    for i in range(10):
        override_score = 4.0 if i < 3 else None
        mock_drafts.append(
            GradingDraft(
                submission_id=uuid.uuid4(),
                rubric_id=sample_rubric.id,
                status='approved',
                criteria_evaluations=[
                    CriterionDraft(
                        criterion_id=criterion_1_id,
                        suggested_score=5.0,
                        suggested_feedback="Perfect.",
                        ai_reasoning="Reason",
                        override_score=override_score
                    )
                ]
            )
        )
    
    # Setup the mock query chain
    mock_query = AsyncMock()
    mock_query.to_list.return_value = mock_drafts
    mock_find.return_value = mock_query
    
    rate = await grading_service.calculate_calibration_override_rate(sample_rubric.id, criterion_1_id)
    
    assert rate == 0.3 # 3 overrides / 10 total


@pytest.mark.asyncio
@patch('app.models.grading.GradingDraft.find')
async def test_calibration_override_rate_insufficient_sample(mock_find, sample_rubric):
    criterion_1_id = sample_rubric.criteria[0].id
    
    # Create 9 mock drafts (less than 10)
    mock_drafts = [GradingDraft(
        submission_id=uuid.uuid4(),
        rubric_id=sample_rubric.id,
        status='approved',
        criteria_evaluations=[]
    ) for _ in range(9)]
    
    mock_query = AsyncMock()
    mock_query.to_list.return_value = mock_drafts
    mock_find.return_value = mock_query
    
    rate = await grading_service.calculate_calibration_override_rate(sample_rubric.id, criterion_1_id)
    
    assert rate is None # Should return None due to sample size
