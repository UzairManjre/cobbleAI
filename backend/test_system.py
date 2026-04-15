"""
Comprehensive test script for the Testing & Assessment System
Tests: Test creation, AI question generation, publishing, student taking, auto-grading
"""
import asyncio
import httpx
import uuid
from datetime import datetime, timedelta

API_URL = "http://127.0.0.1:8000"

# Test credentials (update these to match your DB)
PROFESSOR_EMAIL = "prof@test.com"
PROFESSOR_PASSWORD = "password123"
STUDENT_EMAIL = "student@test.com"
STUDENT_PASSWORD = "password123"

class TestRunner:
    def __init__(self):
        self.professor_token = None
        self.student_token = None
        self.course_id = None
        self.test_id = None
        self.attempt_id = None
    
    async def login(self, email, password):
        """Login and return token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/auth/jwt/login",
                data={"username": email, "password": password}
            )
            if response.status_code != 200:
                raise Exception(f"Login failed: {response.text}")
            return response.json()["access_token"]
    
    async def setup(self):
        """Login both users and get course"""
        print("=" * 80)
        print("SETTING UP TEST ENVIRONMENT")
        print("=" * 80)
        
        print("\n1. Logging in professor...")
        self.professor_token = await self.login(PROFESSOR_EMAIL, PROFESSOR_PASSWORD)
        print("   ✅ Professor logged in")
        
        print("\n2. Logging in student...")
        self.student_token = await self.login(STUDENT_EMAIL, STUDENT_PASSWORD)
        print("   ✅ Student logged in")
        
        # Get professor's course
        print("\n3. Fetching course...")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_URL}/courses/",
                headers={"Authorization": f"Bearer {self.professor_token}"}
            )
            courses = response.json()
            if not courses:
                raise Exception("No courses found. Please create a course first.")
            self.course_id = str(courses[0]["id"])
            print(f"   ✅ Using course: {courses[0]['title']} (ID: {self.course_id})")
    
    async def test_professor_create_test(self):
        """Test 1: Professor creates a test"""
        print("\n" + "=" * 80)
        print("TEST 1: PROFESSOR CREATES TEST")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/api/tests/create",
                json={
                    "course_id": self.course_id,
                    "title": "Automated Test - SQL Basics",
                    "description": "Test covering SQL fundamentals from lab materials",
                    "duration_minutes": 30,
                    "passing_percentage": 40.0,
                    "test_type": "quiz"
                },
                headers={"Authorization": f"Bearer {self.professor_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            data = response.json()
            self.test_id = str(data["test"]["id"])
            print(f"   ✅ Test created: {data['test']['title']}")
            print(f"   📝 Test ID: {self.test_id}")
            return True
    
    async def test_generate_questions(self):
        """Test 2: AI generates questions"""
        print("\n" + "=" * 80)
        print("TEST 2: AI QUESTION GENERATION")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/api/tests/{self.test_id}/generate-questions",
                json={
                    "course_id": self.course_id,
                    "question_count": 5
                },
                headers={"Authorization": f"Bearer {self.professor_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            data = response.json()
            print(f"   ✅ Generated {data['questions_generated']} questions")
            print(f"   📊 Total marks: {data['total_marks']}")
            
            # Show question types
            questions = data["test"]["questions"]
            for i, q in enumerate(questions[:3], 1):
                print(f"   Q{i}: [{q['type']}] {q['question_text'][:60]}...")
            
            return True
    
    async def test_publish_test(self):
        """Test 3: Publish test"""
        print("\n" + "=" * 80)
        print("TEST 3: PUBLISH TEST")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/api/tests/{self.test_id}/publish",
                json={},
                headers={"Authorization": f"Bearer {self.professor_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            print(f"   ✅ Test published successfully")
            return True
    
    async def test_student_view_tests(self):
        """Test 4: Student can see published test"""
        print("\n" + "=" * 80)
        print("TEST 4: STUDENT VIEWS TESTS")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_URL}/api/tests/course/{self.course_id}",
                headers={"Authorization": f"Bearer {self.student_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            tests = response.json()["tests"]
            print(f"   ✅ Student sees {len(tests)} test(s)")
            
            for t in tests:
                print(f"   - {t['title']} (status: {t['status']})")
            
            return True
    
    async def test_student_start_test(self):
        """Test 5: Student starts test"""
        print("\n" + "=" * 80)
        print("TEST 5: STUDENT STARTS TEST")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/api/tests/{self.test_id}/start",
                json={},
                headers={"Authorization": f"Bearer {self.student_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            data = response.json()
            self.attempt_id = str(data["attempt"]["id"])
            print(f"   ✅ Test started")
            print(f"   📋 Attempt ID: {self.attempt_id}")
            print(f"   ⏱️  Duration: {data['test']['duration_minutes']} minutes")
            return True
    
    async def test_submit_answers(self):
        """Test 6: Student submits answers"""
        print("\n" + "=" * 80)
        print("TEST 6: SUBMIT ANSWERS & AUTO-GRADING")
        print("=" * 80)
        
        # First get the test to see questions
        async with httpx.AsyncClient() as client:
            test_response = await client.get(
                f"{API_URL}/api/tests/{self.test_id}",
                headers={"Authorization": f"Bearer {self.student_token}"}
            )
            
            if test_response.status_code != 200:
                print(f"   ❌ Failed to get test: {test_response.text}")
                return False
            
            test_data = test_response.json()["test"]
            questions = test_data["questions"]
            
            # Prepare answers
            answers = []
            for q in questions:
                if q["type"] == "mcq":
                    # Pick first option (may be wrong - that's ok for testing)
                    selected = q["options"][0]["id"] if q["options"] else None
                    answers.append({
                        "question_id": str(q["id"]),
                        "answer_type": "option",
                        "selected_option_id": selected,
                        "time_spent_seconds": 30
                    })
                elif q["type"] == "true_false":
                    answers.append({
                        "question_id": str(q["id"]),
                        "answer_type": "text",
                        "answer_text": "true",
                        "time_spent_seconds": 15
                    })
                elif q["type"] in ["short_answer", "essay"]:
                    answers.append({
                        "question_id": str(q["id"]),
                        "answer_type": "text",
                        "answer_text": "This is a test answer for grading.",
                        "time_spent_seconds": 120
                    })
            
            # Submit
            submit_response = await client.post(
                f"{API_URL}/api/tests/attempt/{self.attempt_id}/submit",
                json={
                    "attempt_id": self.attempt_id,
                    "answers": answers
                },
                headers={"Authorization": f"Bearer {self.student_token}"}
            )
            
            if submit_response.status_code != 200:
                print(f"   ❌ Failed to submit: {submit_response.text}")
                return False
            
            result = submit_response.json()
            print(f"   ✅ Test submitted successfully")
            print(f"   📊 Score: {result['total_marks']}/{result['total_possible']} ({result['percentage']:.1f}%)")
            print(f"   📝 Status: {result['status']}")
            
            return True
    
    async def test_mock_test_generation(self):
        """Test 7: Generate mock test for practice"""
        print("\n" + "=" * 80)
        print("TEST 7: MOCK TEST GENERATION")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_URL}/api/tests/mock/generate",
                json={
                    "course_id": self.course_id,
                    "question_count": 5,
                    "focus_topics": []
                },
                headers={"Authorization": f"Bearer {self.student_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            data = response.json()
            mock_id = str(data["mock_test"]["id"])
            print(f"   ✅ Mock test generated: {data['mock_test']['title']}")
            print(f"   📝 Questions: {data['questions_generated']}")
            print(f"   📊 Total marks: {data['mock_test']['total_marks']}")
            
            # Submit mock test
            questions = data["mock_test"]["questions"]
            answers = []
            for q in questions[:2]:  # Just answer first 2 for speed
                if q["type"] == "mcq" and q["options"]:
                    answers.append({
                        "question_id": str(q["id"]),
                        "answer_type": "option",
                        "selected_option_id": q["options"][0]["id"],
                        "time_spent_seconds": 20
                    })
            
            if answers:
                submit_response = await client.post(
                    f"{API_URL}/api/tests/mock/{mock_id}/submit",
                    json={
                        "attempt_id": mock_id,
                        "answers": answers
                    },
                    headers={"Authorization": f"Bearer {self.student_token}"}
                )
                
                if submit_response.status_code == 200:
                    result = submit_response.json()
                    print(f"   ✅ Mock test submitted")
                    print(f"   📊 Score: {result['marks_obtained']}/{result['total_marks']} ({result['percentage']:.1f}%)")
            
            return True
    
    async def test_get_my_attempts(self):
        """Test 8: Get student's test history"""
        print("\n" + "=" * 80)
        print("TEST 8: STUDENT TEST HISTORY")
        print("=" * 80)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_URL}/api/tests/attempts/my",
                headers={"Authorization": f"Bearer {self.student_token}"}
            )
            
            if response.status_code != 200:
                print(f"   ❌ Failed: {response.text}")
                return False
            
            attempts = response.json()["attempts"]
            print(f"   ✅ Found {len(attempts)} attempt(s)")
            
            for a in attempts:
                status_icon = "✅" if a["status"] == "graded" else "⏳"
                print(f"   {status_icon} Test {a['test_id'][:8]}... - {a['status']} - {a.get('percentage', 0):.1f}%")
            
            return True
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        try:
            await self.setup()
            
            results = []
            
            # Professor tests
            results.append(("Create Test", await self.test_professor_create_test()))
            results.append(("Generate Questions", await self.test_generate_questions()))
            results.append(("Publish Test", await self.test_publish_test()))
            
            # Student tests
            results.append(("Student View Tests", await self.test_student_view_tests()))
            results.append(("Student Start Test", await self.test_student_start_test()))
            results.append(("Submit & Auto-Grade", await self.test_submit_answers()))
            
            # Mock tests
            results.append(("Mock Test Generation", await self.test_mock_test_generation()))
            
            # History
            results.append(("Test History", await self.test_get_my_attempts()))
            
            # Summary
            print("\n" + "=" * 80)
            print("TEST SUMMARY")
            print("=" * 80)
            
            passed = sum(1 for _, result in results if result)
            total = len(results)
            
            for name, result in results:
                status = "✅ PASS" if result else "❌ FAIL"
                print(f"  {status} - {name}")
            
            print(f"\n  Total: {passed}/{total} tests passed")
            
            if passed == total:
                print("\n  🎉 ALL TESTS PASSED!")
            else:
                print(f"\n  ⚠️  {total - passed} test(s) failed")
            
        except Exception as e:
            print(f"\n❌ Test runner failed with error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    print("\n" + "🧪" * 40)
    print("COBBLE AI - TEST SYSTEM INTEGRATION TESTS")
    print("🧪" * 40 + "\n")
    
    runner = TestRunner()
    asyncio.run(runner.run_all_tests())
