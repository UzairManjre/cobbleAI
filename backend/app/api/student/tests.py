from fastapi import APIRouter, Depends
from app.api.auth import current_active_user, require_role
from app.models.user import User
from app.schemas.test import SubmitTestRequest, GenerateMockTestRequest
from app.services.test_service import TestService
from fastapi.encoders import jsonable_encoder

router = APIRouter(prefix="/tests", tags=["tests (student)"])

@router.post("/mock/generate")
async def generate_mock_test(req: GenerateMockTestRequest, user: User = Depends(require_role("student"))):
    import uuid
    from fastapi import HTTPException
    from app.models.graph import KnowledgeGraph
    from app.services.test_generator import TestGenerator
    from app.models.test import MockTest
    from datetime import datetime, timezone
    
    try:
        course_uuid = uuid.UUID(req.course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
    if not graph or not graph.nodes:
        raise HTTPException(status_code=404, detail="Course knowledge graph not found. Cannot generate mock test.")

    graph_topics = []
    for node in graph.nodes:
        graph_topics.append({
            "label": node.get("label", node.get("id", "Unknown")),
            "description": node.get("description", "")
        })

    generator = TestGenerator()
    questions = await generator.generate_mock_test_questions(
        graph_topics=graph_topics,
        focus_topics=req.focus_topics
    )

    if not questions:
        raise HTTPException(status_code=500, detail="Failed to generate mock test questions.")

    mock_test = MockTest(
        course_id=course_uuid,
        student_id=user.id,
        graph_id=graph.id,
        title=f"Mock Test - {datetime.now(timezone.utc).strftime('%b %d, %Y')}",
        questions=questions,
        total_marks=sum([q.marks for q in questions]),
        topics_included=req.focus_topics,
        generated_from="graph",
        duration_minutes=30
    )
    from app.repositories.test_repository import MockTestRepository
    await MockTestRepository().create(mock_test)

    return jsonable_encoder(mock_test)

@router.post("/mock/{mock_id}/submit")
async def submit_mock_test(mock_id: str, req: SubmitTestRequest, user: User = Depends(require_role("student"))):
    import uuid
    import logging
    from fastapi import HTTPException
    from app.models.test import MockTest, Answer
    from app.services.test_generator import TestEvaluator
    from datetime import datetime, timezone

    try:
        mock_uuid = uuid.UUID(mock_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid mock test ID")

    from app.repositories.test_repository import MockTestRepository
    mock_test_repo = MockTestRepository()
    mock_test = await mock_test_repo.get_by_id(mock_uuid)
    if not mock_test or mock_test.student_id != user.id:
        raise HTTPException(status_code=404, detail="Mock test not found")

    if mock_test.completed_at:
        return {"attempt": jsonable_encoder(mock_test), "message": "Already submitted"}

    evaluator = TestEvaluator()
    total_marks = 0.0
    processed_answers = []

    for ans_req in req.answers:
        question = next((q for q in mock_test.questions if str(q.id) == ans_req.question_id), None)
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
        
        if not req.is_auto_save:
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
                except Exception as e:
                    logging.error(f"Failed to evaluate true/false question: {e}")
                    raise HTTPException(status_code=500, detail="Failed to evaluate question")
            elif question.type in ["short_answer", "code", "essay"] and ans_req.answer_text:
                is_correct, marks, feedback = await evaluator.evaluate_short_answer(question, ans_req.answer_text)
                answer.is_correct = is_correct
                answer.marks_awarded = marks
                answer.feedback = feedback
                answer.graded_by = "auto"

            total_marks += answer.marks_awarded or 0.0
            
        processed_answers.append(answer)

    mock_test.answers = processed_answers
    
    if req.is_auto_save:
        await mock_test_repo.update(mock_test)
        return {"attempt": jsonable_encoder(mock_test), "message": "Auto-saved successfully"}

    mock_test.marks_obtained = total_marks
    mock_test.percentage = (total_marks / mock_test.total_marks * 100) if mock_test.total_marks > 0 else 0
    mock_test.completed_at = datetime.now(timezone.utc)
    
    await mock_test_repo.update(mock_test)
    
    return {
        "attempt": jsonable_encoder(mock_test),
        "total_marks": total_marks,
        "total_possible": mock_test.total_marks,
        "percentage": mock_test.percentage,
        "message": "Mock test submitted successfully"
    }

@router.post("/{test_id}/start")
async def start_test(test_id: str, user: User = Depends(require_role("student"))):
    attempt, test, resumed = await TestService.start_test(user, test_id)
    return {
        "attempt": jsonable_encoder(attempt),
        "test": jsonable_encoder(test),
        "message": "Resuming existing attempt" if resumed else "Test started. Good luck!"
    }

@router.post("/attempt/{attempt_id}/submit")
async def submit_test(attempt_id: str, req: SubmitTestRequest, user: User = Depends(require_role("student"))):
    attempt, total_marks, total_possible = await TestService.submit_test(user, attempt_id, req)
    if attempt.status == "submitted":
        return {"attempt": jsonable_encoder(attempt), "message": "Already submitted"}
    return {
        "attempt": jsonable_encoder(attempt),
        "total_marks": total_marks,
        "total_possible": total_possible,
        "percentage": attempt.percentage,
        "status": attempt.status,
        "message": "Test submitted successfully"
    }

@router.get("/attempt/{attempt_id}")
async def get_attempt(attempt_id: str, user: User = Depends(require_role("student"))):
    from app.repositories.test_repository import TestAttemptRepository
    import uuid
    from fastapi import HTTPException
    try:
        attempt_uuid = uuid.UUID(attempt_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    attempt = await TestAttemptRepository().get_by_id(attempt_uuid)
    if not attempt or attempt.student_id != user.id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return {"attempt": jsonable_encoder(attempt)}

@router.get("/attempts/my")
async def get_my_attempts(user: User = Depends(require_role("student"))):
    from app.repositories.test_repository import TestAttemptRepository
    from fastapi import HTTPException
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Only for students")
    attempts = await TestAttemptRepository().find_by_student(user.id)
    return {"attempts": jsonable_encoder(attempts)}

@router.get("/course/{course_id}")
async def get_course_tests(course_id: str, user: User = Depends(require_role("student"))):
    tests = await TestService.get_course_tests(user, course_id)
    return jsonable_encoder([{
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "duration_minutes": t.duration_minutes,
        "passing_percentage": t.passing_percentage,
        "test_type": t.test_type,
        "status": t.status,
        "question_count": len(t.questions) if t.questions else 0,
        "total_marks": t.total_marks,
    } for t in tests])

@router.get("/{test_id}")
async def get_test(test_id: str, user: User = Depends(require_role("student"))):
    test = await TestService.get_test(user, test_id)
    res = {
        "test": {
            "id": str(test.id),
            "title": test.title,
            "description": test.description,
            "instructions": test.instructions,
            "duration_minutes": test.duration_minutes,
            "passing_percentage": test.passing_percentage,
            "test_type": test.test_type,
            "status": test.status,
            "total_marks": test.total_marks,
            "allow_retakes": test.allow_retakes,
            "max_attempts": test.max_attempts,
        }
    }
    return jsonable_encoder(res)
