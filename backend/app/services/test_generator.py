from app.services.llm import LLMAdapter
from app.core.config import settings
from app.models.test import Question, MCQOption
from typing import List, Dict, Any
import json
import time
import uuid

TEST_GENERATION_PROMPT = """You are an expert exam question generator for educational assessments. Generate high-quality test questions based on course materials.

## INPUT DATA

### Course Information
- Course: {course_title}
- Topics Covered: {topics_list}
- **REQUIRED QUESTION COUNT: {question_count}**

### Source Documents / Focus Areas
{document_context}

## QUESTION TYPES TO GENERATE

Generate a balanced mix of these question types:

1. **MCQ (Multiple Choice)** - 4 options, 1 correct
   - Test factual knowledge and understanding
   - Include plausible distractors

2. **True/False** - Binary choice
   - Test specific facts or misconceptions

3. **Short Answer** - 2-3 sentence response
   - Test comprehension and explanation

4. **Code/Practical** (if technical course)
   - Provide starter code and expected output

## OUTPUT FORMAT (JSON ONLY)

Return ONLY valid JSON with this structure:

```json
{{
  "questions": [
    {{
      "type": "mcq",
      "question_text": "Clear, unambiguous question?",
      "difficulty": "medium",
      "marks": 2,
      "topic": "Topic Name",
      "options": [
        {{
          "id": "opt_a",
          "text": "Option A text",
          "is_correct": true
        }},
        {{
          "id": "opt_b",
          "text": "Option B text",
          "is_correct": false
        }},
        ...
      ],
      "explanation": "Why this answer is correct",
      "hints": ["Hint 1"]
    }},
    {{
      "type": "short_answer",
      "question_text": "Explain the difference between X and Y",
      "difficulty": "medium",
      "marks": 5,
      "topic": "Topic Name",
      "explanation": "Expected answer should mention...",
      "hints": []
    }},
    {{
      "type": "true_false",
      "question_text": "Statement here",
      "difficulty": "easy",
      "marks": 1,
      "topic": "Topic Name",
      "correct_answer": true,
      "explanation": "Why this is true/false"
    }}
  ]
}}
```

## CRITICAL RULES

1. **EXACT QUESTION COUNT**: You MUST generate EXACTLY {question_count} questions. No more, no less.
2. **Difficulty Distribution**: 30% easy, 50% medium, 20% hard
3. **Marks**: Easy=1-2, Medium=3-5, Hard=6-10
4. **No Ambiguity**: Each question must have a clear correct answer
5. **Focus on Selected Content**: If specific documents or topics are provided, prioritize questions from those areas
6. **Progressive Difficulty**: Start easy, end hard
7. **Return ONLY JSON** - no markdown, no explanations
8. **Verify Count**: Before returning, COUNT your questions to ensure you have exactly {question_count}
"""

MOCK_TEST_PROMPT = """You are creating a personalized practice test (mock test) for a student. This is for learning, not grading.

## INPUT DATA

### Student's Knowledge Graph Topics
{graph_topics}

### Areas to Focus
{focus_topics}

## TASK

Generate practice questions that help the student learn and self-assess. Include:

1. **MCQs** for quick knowledge checks
2. **Short answers** for deeper understanding
3. **Hints** for every question (learning-focused)
4. **Detailed explanations** for all answers

## OUTPUT FORMAT (JSON ONLY)

```json
{{
  "questions": [
    {{
      "type": "mcq",
      "question_text": "...",
      "difficulty": "medium",
      "marks": 1,
      "topic": "Topic Name",
      "options": [...],
      "explanation": "Detailed explanation of why this is correct",
      "hints": ["Think about...", "Remember that..."]
    }}
  ]
}}
```

Focus on **learning value** over difficulty. Make explanations educational.
Return ONLY JSON.

"""

class TestGenerator:
    def __init__(self):
        self.adapter = LLMAdapter(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL
        )
    
    async def generate_test_questions(
        self,
        course_title: str,
        topics: List[str],
        document_context: str = None,
        question_count: int = 10,
        include_types: List[str] = None
    ) -> List[Question]:
        """Generate test questions for a professor-created test."""

        start_time = time.time()

        # Build prompt
        topics_text = "\n".join([f"- {t}" for t in topics])

        prompt = TEST_GENERATION_PROMPT.format(
            course_title=course_title,
            topics_list=topics_text,
            document_context=document_context or "No specific documents provided.",
            question_count=question_count
        )
        
        print(f"  Generating {question_count} test questions for {course_title}...")
        
        try:
            response = await self.adapter.generate_full_response(
                system="You are an expert exam question generator. Return only valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8192
            )
            
            latency_ms = int((time.time() - start_time) * 1000)

            # Parse JSON
            questions_data = self._extract_json(response)

            # Convert to Question objects
            questions = []
            for q_data in questions_data.get("questions", [])[:question_count]:
                question = self._create_question(q_data)
                if question:
                    questions.append(question)

            # Validate question count
            if len(questions) < question_count:
                print(f"   LLM generated only {len(questions)}/{question_count} questions")
            elif len(questions) > question_count:
                print(f"   LLM generated {len(questions)} questions, truncating to {question_count}")
                questions = questions[:question_count]
            
            print(f"  Generated {len(questions)} questions in {latency_ms}ms")

            return questions
            
        except Exception as e:
            print(f"  Test generation failed: {e}")
            import traceback
            print(traceback.format_exc())
            raise
    
    async def generate_mock_test_questions(
        self,
        graph_topics: List[Dict],
        focus_topics: List[str] = None
    ) -> List[Question]:
        """Generate mock test questions for student practice."""
        
        start_time = time.time()
        
        # Build topics text
        topics_text = "\n".join([
            f"- {t.get('label', 'Unknown')}: {t.get('description', '')}"
            for t in graph_topics
        ])
        
        focus_text = "\n".join([f"- {t}" for t in (focus_topics or [])])
        
        prompt = MOCK_TEST_PROMPT.format(
            graph_topics=topics_text,
            focus_topics=focus_text or "All topics equally"
        )
        
        print(f"  Generating mock test questions...")
        
        try:
            response = await self.adapter.generate_full_response(
                system="You are creating practice questions. Return only valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8192
            )
            
            latency_ms = int((time.time() - start_time) * 1000)
            print(f"  Generated mock test in {latency_ms}ms")
            
            # Parse JSON
            questions_data = self._extract_json(response)
            
            # Convert to Question objects
            questions = []
            for q_data in questions_data.get("questions", []):
                question = self._create_question(q_data)
                if question:
                    questions.append(question)
            
            return questions
            
        except Exception as e:
            print(f"  Mock test generation failed: {e}")
            import traceback
            print(traceback.format_exc())
            raise
    
    def _extract_json(self, text: str) -> Dict:
        """Extract JSON from LLM response."""
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            json_str = text[start:end].strip()
        elif "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            json_str = text[start:end].strip()
        else:
            json_str = text.strip()
        
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            first_brace = json_str.find('{')
            last_brace = json_str.rfind('}')
            if first_brace != -1 and last_brace != -1:
                try:
                    return json.loads(json_str[first_brace:last_brace + 1])
                except:
                    pass
            raise ValueError(f"Failed to parse JSON: {e}")
    
    def _create_question(self, q_data: Dict) -> Question:
        """Convert dict to Question model."""
        try:
            q_type = q_data.get("type", "mcq")
            
            # Build MCQ options if present
            options = []
            if q_type == "mcq" and "options" in q_data:
                options = [
                    MCQOption(
                        id=opt.get("id", f"opt_{i}"),
                        text=opt.get("text", ""),
                        is_correct=opt.get("is_correct", False)
                    )
                    for i, opt in enumerate(q_data["options"])
                ]
            
            question = Question(
                id=uuid.uuid4(),
                type=q_type,
                question_text=q_data.get("question_text", ""),
                difficulty=q_data.get("difficulty", "medium"),
                marks=q_data.get("marks", 1),
                topic=q_data.get("topic"),
                options=options,
                correct_answer=q_data.get("correct_answer"),
                explanation=q_data.get("explanation"),
                hints=q_data.get("hints", []),
                document_references=q_data.get("document_references", [])
            )
            
            return question
            
        except Exception as e:
            print(f"   Failed to create question: {e}")
            return None


class TestEvaluator:
    """Evaluate student answers automatically."""
    
    def __init__(self):
        self.adapter = LLMAdapter(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL
        )
    
    def evaluate_mcq(self, question: Question, selected_option_id: str) -> tuple:
        """Evaluate MCQ answer. Returns (is_correct, marks)."""
        for option in question.options:
            if option.id == selected_option_id:
                return option.is_correct, question.marks if option.is_correct else 0.0
        return False, 0.0
    
    def evaluate_true_false(self, question: Question, answer: bool) -> tuple:
        """Evaluate True/False answer."""
        is_correct = answer == question.correct_answer
        return is_correct, question.marks if is_correct else 0.0
    
    async def evaluate_short_answer(
        self,
        question: Question,
        student_answer: str
    ) -> tuple:
        """Use LLM to evaluate short answer. Returns (is_correct, marks, feedback)."""
        
        evaluation_prompt = f"""Evaluate this student's answer.

Question: {question.question_text}
Expected: {question.explanation or 'N/A'}
Student Answer: {student_answer}
Max Marks: {question.marks}

Rate the answer (0 to max_marks) and provide brief feedback.

Return JSON:
{{
  "marks": 3.5,
  "is_correct": true,
  "feedback": "Good explanation, but could mention X..."
}}"""
        
        try:
            response = await self.adapter.generate_full_response(
                system="You are a fair grader. Be constructive. Return only JSON.",
                messages=[{"role": "user", "content": evaluation_prompt}],
                max_tokens=512
            )
            
            result = self._extract_json(response)
            
            marks = min(float(result.get("marks", 0)), question.marks)
            is_correct = marks >= (question.marks * 0.5)  # 50% or more = correct
            feedback = result.get("feedback", "")
            
            return is_correct, marks, feedback
            
        except Exception as e:
            print(f"  Short answer evaluation failed: {e}")
            return False, 0.0, f"Evaluation error: {str(e)}"
    
    def _extract_json(self, text: str) -> Dict:
        """Extract JSON from text."""
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            json_str = text[start:end].strip()
        else:
            json_str = text.strip()
        
        try:
            return json.loads(json_str)
        except:
            first = json_str.find('{')
            last = json_str.rfind('}')
            if first != -1 and last != -1:
                return json.loads(json_str[first:last+1])
            raise
