import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from app.models.test import Test, TestAttempt, MockTest, TestAnalytics, Question, Answer
from app.models.course import Course
from app.models.graph import KnowledgeGraph
from app.models.user import User
from app.services.test_generator import TestGenerator, TestEvaluator
from app.schemas.test import CreateTestRequest, GenerateTestRequest, SubmitTestRequest, GenerateMockTestRequest
from beanie.operators import In

class TestService:
    @staticmethod
    async def create_test(user: User, req: CreateTestRequest) -> Test:
        try:
            course_uuid = uuid.UUID(req.course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
            
        course = await Course.get(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if str(course.professor_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not your course")
            
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
        if req.available_from:
            test.available_from = datetime.fromisoformat(req.available_from)
        if req.available_until:
            test.available_until = datetime.fromisoformat(req.available_until)
        await test.insert()
        return test

    @staticmethod
    async def generate_questions(user: User, test_id: str, req: GenerateTestRequest):
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
            
        graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
        topics = [node.get("label") for node in graph.nodes] if graph and graph.nodes else []
        
        generator = TestGenerator()
        questions = await generator.generate_test_questions(
            course_title=test.title,
            topics=req.topics_filter if req.topics_filter else topics,
            document_context=req.document_context,
            question_count=req.question_count
        )
        test.questions = questions
        test.total_marks = sum(q.marks for q in questions)
        test.updated_at = datetime.now(timezone.utc)
        await test.save()
        return test, len(questions)

    @staticmethod
    async def publish_test(user: User, test_id: str):
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
        return test

    @staticmethod
    async def get_all_professor_tests(user: User):
        courses = await Course.find(Course.professor_id == user.id).to_list()
        course_ids = [c.id for c in courses]
        if not course_ids:
            return [], {}
        course_map = {c.id: c.title for c in courses}
        tests = await Test.find(In(Test.course_id, course_ids)).to_list()
        return tests, course_map

    @staticmethod
    async def get_course_tests(user: User, course_id: str):
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
            
        course = await Course.get(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if user.role == "professor" and course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")
            
        query = Test.find(Test.course_id == course_uuid)
        if user.role == "student":
            query = query.find(Test.status == "published")
        return await query.to_list()

    @staticmethod
    async def get_test(user: User, test_id: str):
        try:
            test_uuid = uuid.UUID(test_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")
        test = await Test.get(test_uuid)
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        if user.role == "professor" and str(test.professor_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not your test")
        if user.role == "student" and test.status != "published":
            raise HTTPException(status_code=403, detail="Test not available")
            
        now = datetime.now(timezone.utc)
        if test.available_from:
            av_from = test.available_from if test.available_from.tzinfo else test.available_from.replace(tzinfo=timezone.utc)
            if now < av_from:
                raise HTTPException(status_code=403, detail="Test not yet available")
        if test.available_until:
            av_until = test.available_until if test.available_until.tzinfo else test.available_until.replace(tzinfo=timezone.utc)
            if now > av_until:
                raise HTTPException(status_code=403, detail="Test has ended")
        return test

    @staticmethod
    async def start_test(user: User, test_id: str):
        try:
            test_uuid = uuid.UUID(test_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")
        test = await Test.get(test_uuid)
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        if test.status != "published":
            raise HTTPException(status_code=403, detail="Test not available")
            
        existing = await TestAttempt.find_one(
            TestAttempt.test_id == test_uuid,
            TestAttempt.student_id == user.id,
            TestAttempt.status == "in_progress"
        )
        if existing:
            return existing, test, True
            
        if not test.allow_retakes:
            completed = await TestAttempt.find(
                TestAttempt.test_id == test_uuid,
                TestAttempt.student_id == user.id,
                TestAttempt.status == "graded"
            ).count()
            if completed >= test.max_attempts:
                raise HTTPException(status_code=403, detail="Max attempts reached")
                
        attempt = TestAttempt(
            test_id=test_uuid,
            student_id=user.id,
            course_id=test.course_id,
            answers=[],
            status="in_progress"
        )
        await attempt.insert()
        return attempt, test, False

    @staticmethod
    async def submit_test(user: User, attempt_id: str, req: SubmitTestRequest):
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
            return attempt, 0, 0
            
        test = await Test.get(attempt.test_id)
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
            
        evaluator = TestEvaluator()
        total_marks = 0.0
        answers = []
        for ans_req in req.answers:
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
            elif question.type in ["short_answer", "code", "essay"] and ans_req.answer_text:
                is_correct, marks, feedback = await evaluator.evaluate_short_answer(question, ans_req.answer_text)
                answer.is_correct = is_correct
                answer.marks_awarded = marks
                answer.feedback = feedback
                answer.graded_by = "auto"
            total_marks += answer.marks_awarded or 0.0
            answers.append(answer)
            
        attempt.answers = answers
        attempt.total_marks_awarded = total_marks
        attempt.percentage = (total_marks / test.total_marks * 100) if test.total_marks > 0 else 0
        attempt.submitted_at = datetime.now(timezone.utc)
        attempt.time_taken_seconds = int((attempt.submitted_at - attempt.started_at).total_seconds())
        attempt.status = "graded" if test.show_results_immediately else "submitted"
        attempt.last_saved_at = datetime.now(timezone.utc)
        await attempt.save()
        await TestService.update_test_analytics(test.id, test.course_id)
        return attempt, total_marks, test.total_marks

    @staticmethod
    async def update_test_analytics(test_id: uuid.UUID, course_id: uuid.UUID):
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
        except Exception:
            pass
