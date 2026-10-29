"""Single source of truth for every Beanie document model.

Both the FastAPI app (core/db.py) and the Celery worker (core/celery_app.py)
initialise Beanie from this list, so a new model only has to be added here.
"""

from app.models.user import User
from app.models.course import Course, Enrolment, CourseInvite
from app.models.document import DocumentModel
from app.models.graph import KnowledgeGraph, StudySession, ChatMessage
from app.models.study_plan import StudyPlan, StudyProgress, TopicStudyPlan
from app.models.test import Test, TestAttempt, MockTest, TestAnalytics
from app.models.grading import Rubric, GradingDraft, RegradeRequest
from app.models.tutor import TutorRun, TutorPolicy, AnswerFeedback
from app.models.lecture import LectureTranscript, LectureChapter, LectureFrame
from app.models.learner import ConceptMastery, ConceptDifficultyLabel, LearnerModelVersion
from app.models.insights import QuestionInsight, FAQEntry
from app.models.analytics import (
    AnalyticsEvent,
    AnalyticsAggregate,
    AnalyticsUserProfile,
    AnalyticsNodeMetrics,
    AnalyticsLLMUsage,
    AnalyticsRAGPerformance,
)

ALL_DOCUMENT_MODELS = [
    # Core business models
    User, Course, Enrolment, CourseInvite,
    DocumentModel,
    KnowledgeGraph, StudySession, ChatMessage,
    StudyPlan, StudyProgress, TopicStudyPlan,
    Test, TestAttempt, MockTest, TestAnalytics,
    Rubric, GradingDraft, RegradeRequest,
    TutorRun, TutorPolicy, AnswerFeedback,
    LectureTranscript, LectureChapter, LectureFrame,
    ConceptMastery, ConceptDifficultyLabel, LearnerModelVersion,
    QuestionInsight, FAQEntry,
    # Analytics models
    AnalyticsEvent,
    AnalyticsAggregate,
    AnalyticsUserProfile,
    AnalyticsNodeMetrics,
    AnalyticsLLMUsage,
    AnalyticsRAGPerformance,
]
