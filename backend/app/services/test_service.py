import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from app.models.test import Test, TestAttempt, MockTest, TestAnalytics, Question, Answer
from app.repositories.test_repository import TestRepository, TestAttemptRepository
from app.repositories.course_repository import CourseRepository
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
            
        course = await CourseRepository().get_by_id(course_uuid)
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
        await TestRepository().create(test)
        return test

    @staticmethod
    async def generate_questions(user: User, test_id: str, req: GenerateTestRequest):
        try:
            test_uuid = uuid.UUID(test_id)
            course_uuid = uuid.UUID(req.course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")
            
        test = await TestRepository().get_by_id(test_uuid)
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        if str(test.professor_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not your test")
            
        graph = await KnowledgeGraph.find(
            KnowledgeGraph.course_id == course_uuid
        ).sort(-KnowledgeGraph.created_at).first_or_none()
        topics = [node.label for node in graph.nodes] if graph and graph.nodes else []
        
        generator = TestGenerator()
        questions = await generator.generate_test_questions(
            course_title=test.title,
            topics=req.topics_filter if req.topics_filter else topics,
            document_context=req.document_context,
            question_count=req.question_count
        )
        from app.services.learner.tagging import tag_questions
        tag_questions(questions, graph)
        test.questions = questions
        test.total_marks = sum(q.marks for q in questions)
        test.updated_at = datetime.now(timezone.utc)
        await TestRepository().update(test)
        return test, len(questions)

    @staticmethod
    async def publish_test(user: User, test_id: str):
        try:
            test_uuid = uuid.UUID(test_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")
            
        test = await TestRepository().get_by_id(test_uuid)
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        if str(test.professor_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not your test")
        if not test.questions:
            raise HTTPException(status_code=400, detail="Test has no questions")
            
        test.status = "published"
        test.published_at = datetime.now(timezone.utc)
        test.updated_at = datetime.now(timezone.utc)
        await TestRepository().update(test)
        return test

    @staticmethod
    async def get_all_professor_tests(user: User):
        courses = await CourseRepository().find_by_professor(user.id)
        course_ids = [c.id for c in courses]
        if not course_ids:
            return [], {}
        course_map = {c.id: c.title for c in courses}
        tests = await TestRepository().find_by_courses(course_ids)
        return tests, course_map

    @staticmethod
    async def get_course_tests(user: User, course_id: str):
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
            
        course = await CourseRepository().get_by_id(course_uuid)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if user.role == "professor" and course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Not your course")
            
        if user.role == "student":
            from app.repositories.course_repository import EnrolmentRepository
            enrolment_repo = EnrolmentRepository()
            enrolment = await enrolment_repo.find_by_student_and_course(user.id, course_uuid)
            if not enrolment:
                raise HTTPException(status_code=403, detail="Not enrolled in this course")
                
        if user.role == "student":
            return await TestRepository().find_published_by_course(course_uuid)
        return await TestRepository().find_by_course(course_uuid)

    @staticmethod
    async def get_test(user: User, test_id: str):
        try:
            test_uuid = uuid.UUID(test_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")
        test = await TestRepository().get_by_id(test_uuid)
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        if user.role == "professor" and str(test.professor_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not your test")
        if user.role == "student":
            if test.status != "published":
                raise HTTPException(status_code=403, detail="Test not available")
            from app.repositories.course_repository import EnrolmentRepository
            enrolment_repo = EnrolmentRepository()
            enrolment = await enrolment_repo.find_by_student_and_course(user.id, test.course_id)
            if not enrolment:
                raise HTTPException(status_code=403, detail="Not enrolled in this course")
            # The availability window limits students only: the instructor still previews, edits,
            # reviews and releases a test before it opens and after it closes
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
        # get_test enforces published status, enrolment and the availability window
        test = await TestService.get_test(user, test_id)
        test_uuid = test.id

        existing_list = await TestAttemptRepository().find_by_test_and_student(test_uuid, user.id)
        existing = next((a for a in existing_list if a.status == "in_progress"), None)
        if existing:
            return existing, test, True
            
        if not test.allow_retakes:
            # Attempts waiting for review count too, otherwise every pending attempt is a free retake
            completed = sum(1 for a in existing_list if a.status in ("submitted", "graded"))
            if completed >= test.max_attempts:
                raise HTTPException(status_code=403, detail="Max attempts reached")
                
        attempt = TestAttempt(
            test_id=test_uuid,
            student_id=user.id,
            course_id=test.course_id,
            answers=[],
            status="in_progress"
        )
        await TestAttemptRepository().create(attempt)
        return attempt, test, False

    @staticmethod
    async def submit_test(user: User, attempt_id: str, req: SubmitTestRequest):
        try:
            attempt_uuid = uuid.UUID(attempt_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")
        attempt = await TestAttemptRepository().get_by_id(attempt_uuid)
        if not attempt:
            raise HTTPException(status_code=404, detail="Attempt not found")
        if attempt.student_id != user.id:
            raise HTTPException(status_code=403, detail="Not your attempt")
        if attempt.status != "in_progress":
            # A submitted or graded attempt is final: no re-grading with the revealed key, and a late
            # auto-save cannot overwrite graded answers
            return attempt, None, None
            
        if req.last_saved_at and attempt.last_saved_at:
            # Check for optimistic concurrency (version/timestamp check)
            if attempt.last_saved_at.isoformat() != req.last_saved_at:
                raise HTTPException(status_code=409, detail="A newer version of this test attempt exists. Please refresh.")
        
        test = await TestRepository().get_by_id(attempt.test_id)
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
                time_spent_seconds=ans_req.time_spent_seconds,
                confidence=ans_req.confidence,
            )
            if not req.is_auto_save:
                await TestService.grade_answer(evaluator, question, answer, ans_req, test.course_id)
                total_marks += answer.marks_awarded or 0.0
            answers.append(answer)
            
        attempt.answers = answers
        attempt.last_saved_at = datetime.now(timezone.utc)
        
        if req.is_auto_save:
            attempt.is_auto_saved = True
            if not await TestService._write_if_in_progress(attempt, answers=answers, last_saved_at=attempt.last_saved_at,
                                                           is_auto_saved=True):
                return await TestAttemptRepository().get_by_id(attempt.id), None, None
            return attempt, 0, test.total_marks

        attempt.total_marks_awarded = total_marks
        attempt.percentage = (total_marks / test.total_marks * 100) if test.total_marks > 0 else 0
        attempt.submitted_at = datetime.now(timezone.utc)
        attempt.time_taken_seconds = int((attempt.submitted_at - attempt.started_at).total_seconds())
        # Answers the grader was unsure about wait for the instructor before results are released
        pending_review = any(a.review_status == "needs_review" for a in answers)
        attempt.status = "graded" if TestService.results_visible(test) and not pending_review else "submitted"
        if not await TestService._write_if_in_progress(
                attempt, answers=answers, last_saved_at=attempt.last_saved_at, total_marks_awarded=attempt.total_marks_awarded,
                percentage=attempt.percentage, submitted_at=attempt.submitted_at,
                time_taken_seconds=attempt.time_taken_seconds, status=attempt.status):
            # A concurrent submit finished first: it was graded once, keep that
            return await TestAttemptRepository().get_by_id(attempt.id), None, None
        await TestService.update_test_analytics(test.id, test.course_id)
        await TestService.update_mastery(user.id, test, [a for a in answers if a.review_status != "needs_review"])
        return attempt, total_marks, test.total_marks

    @staticmethod
    async def _write_if_in_progress(attempt: TestAttempt, **fields) -> bool:
        """Write the given fields only while the attempt is still in progress. A whole-document save
        would let a late auto-save overwrite a graded submission, or a double submit grade twice."""
        from beanie.operators import Set
        result = await TestAttempt.find_one(TestAttempt.id == attempt.id, TestAttempt.status == "in_progress").update(
            Set({getattr(TestAttempt, name): value for name, value in fields.items()}))
        return bool(getattr(result, "matched_count", 0))

    @staticmethod
    async def grade_answer(evaluator, question, answer: Answer, ans_req, course_id) -> None:
        """Grade one submitted answer in place (deterministic types directly, free text with grader v2)."""
        def deterministic(is_correct: bool, marks: float):
            answer.is_correct = is_correct
            answer.marks_awarded = marks
            answer.ai_score = marks
            answer.graded_by = "auto"
            answer.grade_confidence = 1.0
            answer.review_status = "auto"

        if question.type == "mcq" and ans_req.selected_option_id:
            deterministic(*evaluator.evaluate_mcq(question, ans_req.selected_option_id))
        elif question.type == "true_false" and (ans_req.answer_text or ans_req.selected_option_id):
            # TakeTest sends True/False as an option id ("true"/"false"); older clients sent answer_text
            raw = (ans_req.answer_text or ans_req.selected_option_id or "").strip().lower()
            deterministic(*evaluator.evaluate_true_false(question, raw in ["true", "yes", "1"]))
        elif question.type in ["short_answer", "code", "essay"] and ans_req.answer_text:
            from app.services.grading_v2 import grade_answer_v1_compatible
            await grade_answer_v1_compatible(question, answer, ans_req.answer_text, course_id)

    @staticmethod
    async def update_mastery(student_id: uuid.UUID, test, answers) -> None:
        """Feed graded answers on concept-tagged questions into the learner model."""
        from app.core.config import settings
        if not settings.LEARNER_MODEL_V2:
            return
        try:
            from app.services.learner.mastery import observations_from_attempt, record_observations
            await record_observations(student_id, test.course_id, observations_from_attempt(test, answers))
        except Exception as e:
            import logging
            logging.error(f"Mastery update failed: {e}")

    @staticmethod
    def student_test_view(test: Test) -> dict:
        """Test payload safe to send to a student: no answer keys, explanations, rubric points
        (the key points a full-marks answer makes) or grading test cases. Hints stay."""
        data = test.model_dump(mode="json")
        for q in data.get("questions", []):
            for key in ("correct_answer", "explanation", "rubric", "test_cases"):
                q.pop(key, None)
            for opt in q.get("options", []):
                opt.pop("is_correct", None)
        return data

    # Per-answer grading output, hidden from the student until the attempt's results are released
    GRADE_FIELDS = ("is_correct", "marks_awarded", "feedback", "graded_by", "ai_score", "ai_feedback", "ai_rationale",
                    "evidence", "grade_confidence", "review_status", "reviewed_by", "reviewed_at")

    @staticmethod
    def results_visible(test: Test) -> bool:
        return bool(test.show_results_immediately or test.results_released)

    @staticmethod
    def student_attempt_view(attempt) -> dict:
        """An attempt as its student may see it: grades, evidence and rationale (built from the
        model answer) only once the attempt is graded and released."""
        from fastapi.encoders import jsonable_encoder
        data = jsonable_encoder(attempt)
        if attempt.status != "graded":
            data["total_marks_awarded"] = None
            data["percentage"] = None
            for a in data.get("answers", []):
                for key in TestService.GRADE_FIELDS:
                    a.pop(key, None)
        return data

    @staticmethod
    async def release_results(user: User, test_id: str) -> dict:
        """Instructor releases results: every attempt with nothing left to review becomes visible,
        and so will later submissions and reviews."""
        test = await TestService.get_test(user, test_id)  # owner check for professors
        test.results_released = True
        await TestRepository().update(test)
        released, waiting = 0, 0
        for attempt in await TestAttempt.find(TestAttempt.test_id == test.id, TestAttempt.status == "submitted").to_list():
            if any(a.review_status == "needs_review" for a in attempt.answers):
                waiting += 1
                continue
            attempt.status = "graded"
            await attempt.save()
            released += 1
        if released:
            await TestService.update_test_analytics(test.id, test.course_id)
        return {"released": released, "waiting_for_review": waiting}

    @staticmethod
    async def update_test_analytics(test_id: uuid.UUID, course_id: uuid.UUID):
        try:
            # Every fully graded attempt counts, released to the student or not
            attempts = await TestAttemptRepository().model.find(
                TestAttempt.test_id == test_id,
                In(TestAttempt.status, ["submitted", "graded"]),
            ).to_list()
            attempts = [t for t in attempts if not any(x.review_status == "needs_review" for x in t.answers)]
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
            # Analytics must never fail a submission
            import logging
            logging.error(f"Failed to update test analytics: {e}")
