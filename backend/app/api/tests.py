from fastapi import APIRouter, HTTPException, Depends
from app.api.auth import current_active_user
from app.models.user import User
from app.models.test import Test, TestAttempt, MockTest, TestAnalytics, Question, Answer, MCQOption
from app.models.course import Course
from app.models.graph import KnowledgeGraph
from app.services.test_generator import TestGenerator, TestEvaluator
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api/tests", tags=["tests"])

#   Schemas  

class CreateTestRequest(BaseModel):
    course_id: str
    title: str
    description: str
    instructions: Optional[str] = None
    duration_minutes: int = 60
    passing_percentage: float = 40.0
    test_type: str = "assignment"
    available_from: Optional[str] = None
    available_until: Optional[str] = None
    shuffle_questions: bool = False
    show_results_immediately: bool = False

class GenerateTestRequest(BaseModel):
    course_id: str
    question_count: int = 10
    question_types: List[str] = ["mcq", "short_answer", "true_false"]
    difficulty_distribution: dict = {"easy": 0.3, "medium": 0.5, "hard": 0.2}
    document_context: Optional[str] = None
    topics_filter: List[str] = []

class SubmitAnswerRequest(BaseModel):
    question_id: str
    answer_type: str
    answer_text: Optional[str] = None
    selected_option_id: Optional[str] = None
    selected_options: List[str] = []
    time_spent_seconds: int = 0

class SubmitTestRequest(BaseModel):
    attempt_id: str
    answers: List[SubmitAnswerRequest]

class GenerateMockTestRequest(BaseModel):
    course_id: str
    question_count: int = 10
    focus_topics: List[str] = []

#   Professor Test Management  

@router.post("/create")
async def create_test(
    req: CreateTestRequest,
    user: User = Depends(current_active_user)
):
    """Professor creates a new test."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only professors can create tests")
    
    try:
        course_uuid = uuid.UUID(req.course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # Verify course ownership
    course = await Course.get(course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if str(course.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your course")
    
    # Create test
    test = Test(
        course_id=course_uuid,
        professor_id=user.id,
        title=req.title,
        description=req.description,
        instructions=req.instructions,
        duration_minutes=req.duration_minutes,
        passing_percentage=req.passing_percentage,
        test_type=req.test_type,
        shuffle_questions=req.shuffle_questions,
        show_results_immediately=req.show_results_immediately,
        status="draft"
    )
    
    # Parse dates if provided
    if req.available_from:
        test.available_from = datetime.fromisoformat(req.available_from)
    if req.available_until:
        test.available_until = datetime.fromisoformat(req.available_until)
    
    await test.insert()

    return {
        "test": {
            "id": str(test.id),
            "title": test.title,
            "description": test.description,
            "duration_minutes": test.duration_minutes,
            "passing_percentage": test.passing_percentage,
            "test_type": test.test_type,
            "status": test.status,
            "questions": [],
            "total_marks": test.total_marks,
            "created_at": test.created_at.isoformat() if test.created_at else None
        },
        "test_id": str(test.id),
        "message": "Test created successfully"
    }

@router.post("/{test_id}/generate-questions")
async def generate_test_questions(
    test_id: str,
    req: GenerateTestRequest,
    user: User = Depends(current_active_user)
):
    """Generate questions using LLM for an existing test."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only professors can generate questions")
    
    try:
        test_uuid = uuid.UUID(test_id)
        course_uuid = uuid.UUID(req.course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    test = await Test.get(test_uuid)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if str(test.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your test")
    
    # Get course topics from graph
    graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
    topics = [node.get("label") for node in graph.nodes] if graph and graph.nodes else []
    
    # Generate questions
    generator = TestGenerator()
    questions = await generator.generate_test_questions(
        course_title=test.title,
        topics=req.topics_filter if req.topics_filter else topics,
        document_context=req.document_context,
        question_count=req.question_count
    )
    
    # Update test with questions
    test.questions = questions
    test.total_marks = sum(q.marks for q in questions)
    test.updated_at = datetime.now(timezone.utc)
    await test.save()

    print(f"  Saved {len(questions)} questions to test {test.id} ({test.title})")

    return {
        "test_id": str(test.id),
        "questions_generated": len(questions),
        "total_marks": test.total_marks,
        "message": "Questions generated successfully"
    }

@router.post("/{test_id}/publish")
async def publish_test(test_id: str, user: User = Depends(current_active_user)):
    """Publish a test for students."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only professors can publish tests")
    
    try:
        test_uuid = uuid.UUID(test_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    test = await Test.get(test_uuid)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if str(test.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your test")
    
    if not test.questions:
        raise HTTPException(status_code=400, detail="Test has no questions")
    
    test.status = "published"
    test.published_at = datetime.now(timezone.utc)
    test.updated_at = datetime.now(timezone.utc)
    await test.save()
    
    return {"test": test, "message": "Test published successfully"}

@router.get("/course/{course_id}")
async def get_course_tests(course_id: str, user: User = Depends(current_active_user)):
    """Get all tests for a course (professor sees all, student sees published)."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    query = Test.find(Test.course_id == course_uuid)
    
    # Students only see published tests
    if user.role == "student":
        query = query.find(Test.status == "published")
    
    tests = await query.to_list()

    # Serialize tests with proper ID handling
    serialized_tests = []
    for test in tests:
        serialized_tests.append({
            "id": str(test.id),
            "title": test.title,
            "description": test.description,
            "duration_minutes": test.duration_minutes,
            "passing_percentage": test.passing_percentage,
            "test_type": test.test_type,
            "status": test.status,
            "questions": [],  # Don't return questions in list view
            "question_count": len(test.questions) if test.questions else 0,
            "total_marks": test.total_marks,
            "created_at": test.created_at.isoformat() if test.created_at else None
        })

    return {"tests": serialized_tests}

@router.get("/{test_id}")
async def get_test(test_id: str, user: User = Depends(current_active_user)):
    """Get a specific test with full details (for professors)."""
    try:
        test_uuid = uuid.UUID(test_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

    test = await Test.get(test_uuid)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Professors can only view their own tests
    if user.role == "professor" and str(test.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your test")

    # Check availability for students
    if user.role == "student" and test.status != "published":
        raise HTTPException(status_code=403, detail="Test not available")

    now = datetime.now(timezone.utc)
    if test.available_from and now < test.available_from:
        raise HTTPException(status_code=403, detail="Test not yet available")

    if test.available_until and now > test.available_until:
        raise HTTPException(status_code=403, detail="Test has ended")

    # Return full test with questions for professors
    print(f"  Returning test {test.id} with {len(test.questions) if test.questions else 0} questions")
    
    return {
        "test": {
            "id": str(test.id),
            "title": test.title,
            "description": test.description,
            "instructions": test.instructions,
            "duration_minutes": test.duration_minutes,
            "passing_percentage": test.passing_percentage,
            "test_type": test.test_type,
            "status": test.status,
            "questions": test.questions,
            "total_marks": test.total_marks,
            "shuffle_questions": test.shuffle_questions,
            "shuffle_options": test.shuffle_options,
            "show_results_immediately": test.show_results_immediately,
            "allow_retakes": test.allow_retakes,
            "max_attempts": test.max_attempts,
            "available_from": test.available_from.isoformat() if test.available_from else None,
            "available_until": test.available_until.isoformat() if test.available_until else None,
            "created_at": test.created_at.isoformat() if test.created_at else None,
            "published_at": test.published_at.isoformat() if test.published_at else None
        }
    }

#   Student Test Taking  

@router.post("/{test_id}/start")
async def start_test(test_id: str, user: User = Depends(current_active_user)):
    """Student starts a test."""
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can take tests")
    
    try:
        test_uuid = uuid.UUID(test_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    test = await Test.get(test_uuid)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.status != "published":
        raise HTTPException(status_code=403, detail="Test not available")
    
    # Check if already has attempt
    existing = await TestAttempt.find_one(
        TestAttempt.test_id == test_uuid,
        TestAttempt.student_id == user.id,
        TestAttempt.status == "in_progress"
    )
    
    if existing:
        return {"attempt": existing, "message": "Resuming existing attempt"}
    
    # Check max attempts
    if not test.allow_retakes:
        completed = await TestAttempt.find(
            TestAttempt.test_id == test_uuid,
            TestAttempt.student_id == user.id,
            TestAttempt.status == "graded"
        ).count()
        
        if completed >= test.max_attempts:
            raise HTTPException(status_code=403, detail="Max attempts reached")
    
    # Create new attempt
    attempt = TestAttempt(
        test_id=test_uuid,
        student_id=user.id,
        course_id=test.course_id,
        answers=[],
        status="in_progress"
    )
    
    await attempt.insert()
    
    return {
        "attempt": attempt,
        "test": test,
        "message": "Test started. Good luck!"
    }

@router.post("/attempt/{attempt_id}/submit")
async def submit_test(
    attempt_id: str,
    req: SubmitTestRequest,
    user: User = Depends(current_active_user)
):
    """Submit test answers for grading."""
    try:
        attempt_uuid = uuid.UUID(attempt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    attempt = await TestAttempt.get(attempt_uuid)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    
    if attempt.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    
    if attempt.status == "submitted":
        return {"attempt": attempt, "message": "Already submitted"}
    
    # Get test
    test = await Test.get(attempt.test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Process answers
    evaluator = TestEvaluator()
    total_marks = 0.0
    answers = []
    
    for ans_req in req.answers:
        # Find corresponding question
        question = next((q for q in test.questions if str(q.id) == ans_req.question_id), None)
        if not question:
            continue
        
        answer = Answer(
            question_id=uuid.UUID(ans_req.question_id),
            question_type=question.type,
            answer_text=ans_req.answer_text,
            selected_option_id=ans_req.selected_option_id,
            selected_options=ans_req.selected_options,
            time_spent_seconds=ans_req.time_spent_seconds
        )
        
        # Auto-grade MCQ and True/False
        if question.type == "mcq" and ans_req.selected_option_id:
            is_correct, marks = evaluator.evaluate_mcq(question, ans_req.selected_option_id)
            answer.is_correct = is_correct
            answer.marks_awarded = marks
            answer.graded_by = "auto"
        
        elif question.type == "true_false" and ans_req.answer_text:
            try:
                student_answer = ans_req.answer_text.lower() in ["true", "yes", "1"]
                is_correct, marks = evaluator.evaluate_true_false(question, student_answer)
                answer.is_correct = is_correct
                answer.marks_awarded = marks
                answer.graded_by = "auto"
            except:
                pass
        
        # Short answer and code need manual/LLM grading
        elif question.type in ["short_answer", "code", "essay"] and ans_req.answer_text:
            is_correct, marks, feedback = await evaluator.evaluate_short_answer(
                question, ans_req.answer_text
            )
            answer.is_correct = is_correct
            answer.marks_awarded = marks
            answer.feedback = feedback
            answer.graded_by = "auto"
        
        total_marks += answer.marks_awarded or 0.0
        answers.append(answer)
    
    # Update attempt
    attempt.answers = answers
    attempt.total_marks_awarded = total_marks
    attempt.percentage = (total_marks / test.total_marks * 100) if test.total_marks > 0 else 0
    attempt.submitted_at = datetime.now(timezone.utc)
    attempt.time_taken_seconds = int((attempt.submitted_at - attempt.started_at).total_seconds())
    attempt.status = "graded" if test.show_results_immediately else "submitted"
    attempt.last_saved_at = datetime.now(timezone.utc)
    
    await attempt.save()
    
    # Update test analytics
    await update_test_analytics(test.id, test.course_id)
    
    return {
        "attempt": attempt,
        "total_marks": total_marks,
        "total_possible": test.total_marks,
        "percentage": attempt.percentage,
        "status": attempt.status,
        "message": "Test submitted successfully"
    }

@router.get("/attempt/{attempt_id}")
async def get_attempt(attempt_id: str, user: User = Depends(current_active_user)):
    """Get attempt details with results."""
    try:
        attempt_uuid = uuid.UUID(attempt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    attempt = await TestAttempt.get(attempt_uuid)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    
    if attempt.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    
    return {"attempt": attempt}

@router.get("/attempts/my")
async def get_my_attempts(user: User = Depends(current_active_user)):
    """Get all test attempts for current student."""
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Only for students")
    
    attempts = await TestAttempt.find(
        TestAttempt.student_id == user.id
    ).sort(-TestAttempt.started_at).to_list()
    
    return {"attempts": attempts}

#   Mock Tests  

@router.post("/mock/generate")
async def generate_mock_test(
    req: GenerateMockTestRequest,
    user: User = Depends(current_active_user)
):
    """Generate a personalized mock test for practice."""
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Only for students")
    
    try:
        course_uuid = uuid.UUID(req.course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # Get knowledge graph
    graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
    if not graph:
        raise HTTPException(status_code=404, detail="No knowledge graph found for this course")

    graph_topics = graph.nodes
    
    # Generate questions
    generator = TestGenerator()
    questions = await generator.generate_mock_test_questions(
        graph_topics=graph_topics,
        focus_topics=req.focus_topics
    )
    
    # Create mock test
    mock_test = MockTest(
        course_id=course_uuid,
        student_id=user.id,
        graph_id=graph[0].id,
        title=f"Mock Test - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
        questions=questions,
        total_marks=sum(q.marks for q in questions),
        topics_included=req.focus_topics or [t.get("label") for t in graph_topics]
    )
    
    await mock_test.insert()
    
    return {
        "mock_test": mock_test,
        "questions_generated": len(questions),
        "message": "Mock test generated! Practice makes perfect."
    }

@router.post("/mock/{mock_test_id}/submit")
async def submit_mock_test(
    mock_test_id: str,
    req: SubmitTestRequest,
    user: User = Depends(current_active_user)
):
    """Submit mock test answers."""
    try:
        mock_uuid = uuid.UUID(mock_test_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    mock_test = await MockTest.get(mock_uuid)
    if not mock_test:
        raise HTTPException(status_code=404, detail="Mock test not found")
    
    if mock_test.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your mock test")
    
    # Evaluate answers
    evaluator = TestEvaluator()
    total_marks = 0.0
    answers = []
    
    for ans_req in req.answers:
        question = next((q for q in mock_test.questions if str(q.id) == ans_req.question_id), None)
        if not question:
            continue
        
        answer = Answer(
            question_id=uuid.UUID(ans_req.question_id),
            question_type=question.type,
            answer_text=ans_req.answer_text,
            selected_option_id=ans_req.selected_option_id,
            time_spent_seconds=ans_req.time_spent_seconds
        )
        
        # Auto-grade
        if question.type == "mcq" and ans_req.selected_option_id:
            is_correct, marks = evaluator.evaluate_mcq(question, ans_req.selected_option_id)
            answer.is_correct = is_correct
            answer.marks_awarded = marks
        
        elif question.type == "true_false" and ans_req.answer_text:
            student_answer = ans_req.answer_text.lower() in ["true", "yes", "1"]
            is_correct, marks = evaluator.evaluate_true_false(question, student_answer)
            answer.is_correct = is_correct
            answer.marks_awarded = marks
        
        total_marks += answer.marks_awarded or 0.0
        answers.append(answer)
    
    # Update mock test
    mock_test.answers = answers
    mock_test.marks_obtained = total_marks
    mock_test.percentage = (total_marks / mock_test.total_marks * 100) if mock_test.total_marks > 0 else 0
    mock_test.completed_at = datetime.now(timezone.utc)
    
    await mock_test.save()
    
    return {
        "mock_test": mock_test,
        "marks_obtained": total_marks,
        "total_marks": mock_test.total_marks,
        "percentage": mock_test.percentage,
        "message": "Mock test completed!"
    }

#   Professor Grading & Analytics  

@router.get("/analytics/{test_id}")
async def get_test_analytics(test_id: str, user: User = Depends(current_active_user)):
    """Get test analytics for professor."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only for professors")
    
    try:
        test_uuid = uuid.UUID(test_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    test = await Test.get(test_uuid)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if str(test.professor_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your test")
    
    # Get analytics
    analytics = await TestAnalytics.find_one(TestAnalytics.test_id == test_uuid)

    # Get all attempts
    attempts = await TestAttempt.find(
        TestAttempt.test_id == test_uuid,
        TestAttempt.status == "graded"
    ).to_list()

    return {
        "test": test,
        "analytics": analytics,
        "total_submissions": len(attempts),
        "attempts": attempts
    }

@router.post("/{test_id}/grade-manual")
async def grade_manual(
    test_id: str,
    attempt_id: str,
    question_id: str,
    marks: float,
    feedback: str,
    user: User = Depends(current_active_user)
):
    """Professor manually grades a question."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Only for professors")
    
    try:
        attempt_uuid = uuid.UUID(attempt_id)
        q_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    attempt = await TestAttempt.get(attempt_uuid)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    
    # Find and update the answer
    for answer in attempt.answers:
        if answer.question_id == q_uuid:
            answer.marks_awarded = marks
            answer.feedback = feedback
            answer.graded_by = str(user.id)
            answer.is_correct = marks > 0
            break
    
    # Recalculate total
    attempt.total_marks_awarded = sum(a.marks_awarded or 0 for a in attempt.answers)
    test = await Test.get(attempt.test_id)
    attempt.percentage = (attempt.total_marks_awarded / test.total_marks * 100) if test.total_marks > 0 else 0
    
    await attempt.save()
    
    return {"attempt": attempt, "message": "Answer graded"}

#   Helper Functions  

async def update_test_analytics(test_id: uuid.UUID, course_id: uuid.UUID):
    """Update test analytics after submission."""
    try:
        attempts = await TestAttempt.find(
            TestAttempt.test_id == test_id,
            TestAttempt.status == "graded"
        ).to_list()
        
        if not attempts:
            return
        
        scores = [a.percentage for a in attempts]
        
        analytics = await TestAnalytics.find_one(TestAnalytics.test_id == test_id)

        if analytics:
            a = analytics
        else:
            a = TestAnalytics(test_id=test_id, course_id=course_id)
        
        a.total_attempts = len(attempts)
        a.average_score = sum(scores) / len(scores)
        a.median_score = sorted(scores)[len(scores) // 2]
        a.highest_score = max(scores)
        a.lowest_score = min(scores)
        a.updated_at = datetime.now(timezone.utc)
        
        await a.save()
        
    except Exception as e:
        print(f"   Failed to update analytics: {e}")
