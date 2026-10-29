"""Grader v2 (Upgrade C): rubric-driven grading with cited evidence and a confidence value.

For a free-text answer the grader:
  1. builds a rubric (the question's key points, else sentences of its model answer),
  2. retrieves supporting course passages for the question,
  3. grades it GRADER_SAMPLES times independently at a sampling temperature,
  4. reports the median score, the evidence it relied on (verified student-answer
     spans + course passages) and a confidence combining sample agreement, the
     model's own confidence and how much reference material it had.
Answers below GRADER_REVIEW_THRESHOLD go to the instructor's review queue; an
evaluation error never silently scores 0, it goes to review too.
"""

import asyncio
import json
import re
import statistics
from dataclasses import dataclass, field
from typing import List, Optional

from app.core.config import settings
from app.models.test import Answer, Question
from app.services.llm import LLMAdapter
from app.utils.llm_text import split_thinking

GRADER_PROMPT = """You are grading one student answer against a rubric. Be fair and consistent.

Question: {question}
Maximum marks: {max_marks}

Rubric (key points a full-marks answer covers):
{rubric}

Course material relevant to the question:
{sources}

Student answer:
\"\"\"{answer}\"\"\"

For each rubric point decide whether the answer covers it, and copy the exact words from the student answer
that show it (empty if not covered). Then give the score (0 to {max_marks}, half marks allowed), one or two
sentences of feedback addressed to the student, and your confidence (0 to 1) that an instructor would give
the same score.
Return ONLY JSON:
{{"points": [{{"point": "...", "met": true, "student_span": "..."}}], "score": 0, "feedback": "...",
  "rationale": "...", "confidence": 0.0}}
"""


@dataclass
class GradeResult:
    score: Optional[float]
    max_score: float
    feedback: str = ""
    rationale: str = ""
    confidence: float = 0.0
    evidence: List[dict] = field(default_factory=list)
    samples: List[float] = field(default_factory=list)
    needs_review: bool = True
    method: str = "rubric_llm"
    error: Optional[str] = None

    @property
    def is_correct(self) -> Optional[bool]:
        return None if self.score is None else self.score >= 0.5 * self.max_score


def rubric_for(question: Question) -> List[str]:
    if question.rubric:
        return [p for p in question.rubric if p.strip()]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?;])\s+", question.explanation or "") if len(s.strip()) > 3]
    return sentences[:6]


def _parse(text: str) -> dict:
    text = split_thinking(text)[0]
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON in grader output")
    return json.loads(re.sub(r",\s*([\]}])", r"\1", match.group(0)))


def _clamp_half(score: float, max_score: float) -> float:
    return max(0.0, min(max_score, round(float(score) * 2) / 2))


async def _course_sources(question: Question, course_id: Optional[str]) -> List[dict]:
    if not course_id:
        return []
    try:
        from app.services.rag import retrieve_with_details
        from app.services.retrieval.config import default_config
        from app.services.retrieval.hybrid import chunk_to_source
        config = default_config().model_copy(update={"query_expansion": False, "top_k": 3})
        result = await retrieve_with_details(question.question_text, str(course_id), config)
        return [chunk_to_source(c) for c in result.chunks if c.support >= 0.2]
    except Exception as e:
        print(f"  Grader retrieval failed: {e}")
        return []


async def grade_free_text(question: Question, answer_text: str, course_id: Optional[str] = None,
                          adapter: Optional[LLMAdapter] = None) -> GradeResult:
    max_score = float(question.marks)
    if not (answer_text or "").strip():
        return GradeResult(score=0.0, max_score=max_score, feedback="No answer given.", confidence=1.0,
                           needs_review=False, method="blank")

    rubric = rubric_for(question)
    sources = await _course_sources(question, course_id)
    prompt = GRADER_PROMPT.format(
        question=question.question_text,
        max_marks=max_score,
        rubric="\n".join(f"- {p}" for p in rubric) or "- (no model answer given; judge against the course material)",
        sources="\n\n".join(f"[{s['sid']}] {s['filename']} {s.get('location', '')}: {s['snippet']}" for s in sources) or "(none found)",
        answer=answer_text.strip()[:6000],
    )
    adapter = adapter or LLMAdapter()
    n = max(1, settings.GRADER_SAMPLES)

    async def one_sample():
        raw = await adapter.generate_full_response(
            system="You are a fair, consistent grader. Return only JSON.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
            temperature=settings.GRADER_SAMPLE_TEMPERATURE if n > 1 else 0.0,
        )
        return _parse(raw)

    outcomes = await asyncio.gather(*(one_sample() for _ in range(n)), return_exceptions=True)
    parsed = [o for o in outcomes if isinstance(o, dict) and "score" in o]
    if not parsed:
        error = next((str(o) for o in outcomes if isinstance(o, Exception)), "unparseable grader output")
        return GradeResult(score=None, max_score=max_score, error=error[:300], needs_review=True, method="error",
                           feedback="This answer will be graded by your instructor.")

    scores = [_clamp_half(p.get("score", 0), max_score) for p in parsed]
    median = _clamp_half(statistics.median(scores), max_score)
    representative = min(parsed, key=lambda p: abs(_clamp_half(p.get("score", 0), max_score) - median))

    spread = (max(scores) - min(scores)) / max_score if max_score else 0.0
    agreement = max(0.0, 1.0 - 2.0 * spread)  # all samples equal -> 1; spread of half the marks -> 0
    stated = statistics.mean(min(1.0, max(0.0, float(p.get("confidence", 0.5) or 0.5))) for p in parsed)
    reference = 1.0 if rubric else (0.6 if sources else 0.2)
    reliability = len(parsed) / n
    confidence = round(reliability * (0.5 * agreement + 0.3 * stated + 0.2 * reference), 3)

    from app.services.graph_provenance import quote_score
    evidence = []
    for point in representative.get("points") or []:
        span = str(point.get("student_span") or "").strip()
        if span and quote_score(span, answer_text) >= 0.8:
            evidence.append({"kind": "student_answer", "point": str(point.get("point", ""))[:200],
                             "met": bool(point.get("met")), "quote": span[:300]})
    evidence += [{"kind": "course_source", "sid": s["sid"], "doc_id": s["doc_id"], "filename": s["filename"],
                  "location": s.get("location"), "snippet": s["snippet"], "t_start": s.get("t_start"),
                  "page_start": s.get("page_start"), "slide_start": s.get("slide_start")} for s in sources]

    return GradeResult(
        score=median, max_score=max_score,
        feedback=str(representative.get("feedback", ""))[:800],
        rationale=str(representative.get("rationale", ""))[:1200],
        confidence=confidence, evidence=evidence, samples=scores,
        needs_review=confidence < settings.GRADER_REVIEW_THRESHOLD,
    )


def apply_grade(answer: Answer, result: GradeResult) -> None:
    """Write a grade onto an answer. Answers routed to review keep the AI score as provisional marks."""
    answer.ai_score = result.score
    answer.ai_feedback = result.feedback
    answer.ai_rationale = result.rationale
    answer.grade_confidence = result.confidence
    answer.evidence = result.evidence
    answer.marks_awarded = result.score if result.score is not None else 0.0
    answer.is_correct = result.is_correct
    answer.feedback = result.feedback
    answer.graded_by = "auto"
    answer.review_status = "needs_review" if result.needs_review else "auto"


async def grade_answer_v1_compatible(question: Question, answer: Answer, answer_text: str, course_id) -> None:
    """Grade a free-text answer with grader v2, or the v1 evaluator when GRADER_V2 is off."""
    if settings.GRADER_V2:
        apply_grade(answer, await grade_free_text(question, answer_text, str(course_id) if course_id else None))
        return
    from app.services.test_generator import TestEvaluator
    is_correct, marks, feedback = await TestEvaluator().evaluate_short_answer(question, answer_text)
    answer.is_correct, answer.marks_awarded, answer.feedback, answer.graded_by = is_correct, marks, feedback, "auto"
    answer.ai_score = marks
