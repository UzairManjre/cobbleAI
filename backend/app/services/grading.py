import uuid
from typing import List, Optional, Tuple
from app.models.grading import GradingDraft, Rubric, CriterionDraft, EditHistoryRecord
from app.services.llm import LLMAdapter

class GradingService:
    def __init__(self):
        self.adapter = LLMAdapter()
    async def _detect_anomaly(self, submission_text: str) -> Tuple[bool, Optional[str]]:
        """
        Uses an LLM to quickly detect if the submission is blank, off-topic, or keyword-stuffed.
        Returns a tuple: (is_anomalous, anomaly_reason).
        """
        if not submission_text or not submission_text.strip():
            return True, "Submission is completely blank."
        
        prompt = (
            f"Analyze the following student submission and determine if it is "
            f"1) completely off-topic, or 2) merely stuffing keywords to game a grading rubric without coherence.\n\n"
            f"Submission:\n{submission_text}\n\n"
            f"Respond exactly in this format:\n"
            f"ANOMALY: YES or NO\n"
            f"REASON: (brief explanation if YES, otherwise None)"
        )
        
        response = await self.adapter.generate_full_response(
            system="You are a system that quickly detects anomalous student submissions.",
            messages=[{"role": "user", "content": prompt}]
        )
        
        # Parse response
        is_anomalous = False
        reason = None
        
        lines = response.strip().split('\n')
        for line in lines:
            if line.startswith("ANOMALY:"):
                is_anomalous = "YES" in line.upper()
            elif line.startswith("REASON:") and is_anomalous:
                reason = line.replace("REASON:", "").strip()
                
        return is_anomalous, reason

    async def _score_with_rubric(self, submission_text: str, rubric: Rubric) -> List[CriterionDraft]:
        """
        Uses an LLM to score a submission against the criteria of a rubric.
        """
        evaluations = []
        
        for criterion in rubric.criteria:
            prompt = (
                f"You are a strict and fair academic grader.\n"
                f"Evaluate the following student submission based ONLY on this criterion:\n"
                f"Name: {criterion.name}\n"
                f"Description: {criterion.description}\n"
                f"Max Points: {criterion.max_points}\n\n"
                f"Submission:\n{submission_text}\n\n"
                f"Respond exactly in this JSON format (with no markdown wrapping):\n"
                f"{{\n"
                f"  \"suggested_score\": <float between 0 and {criterion.max_points}>,\n"
                f"  \"suggested_feedback\": \"<direct constructive feedback for the student>\",\n"
                f"  \"ai_reasoning\": \"<private reasoning for the professor justifying the score>\"\n"
                f"}}"
            )
            
            response = await self.adapter.generate_full_response(
                system="You are a strict and fair academic grader.",
                messages=[{"role": "user", "content": prompt}]
            )
            
            import json
            try:
                # Remove markdown code blocks if present
                clean_resp = response.strip()
                if clean_resp.startswith("```json"):
                    clean_resp = clean_resp[7:]
                if clean_resp.endswith("```"):
                    clean_resp = clean_resp[:-3]
                    
                data = json.loads(clean_resp.strip())
                evaluations.append(CriterionDraft(
                    criterion_id=criterion.id,
                    suggested_score=data["suggested_score"],
                    suggested_feedback=data["suggested_feedback"],
                    ai_reasoning=data["ai_reasoning"]
                ))
            except Exception as e:
                # Fallback on parsing error
                evaluations.append(CriterionDraft(
                    criterion_id=criterion.id,
                    suggested_score=0.0,
                    suggested_feedback="Failed to generate feedback due to system error.",
                    ai_reasoning=f"LLM parsing failed: {str(e)} | Raw output: {response}"
                ))
                
        return evaluations

    async def generate_draft(self, submission_id: uuid.UUID, rubric: Rubric, submission_text: str) -> GradingDraft:
        """
        Generates a grading draft for a submission. Checks for anomalies first.
        If a draft already exists for this submission, returns it idempotently.
        """
        existing_draft = await GradingDraft.find_one({"submission_id": submission_id})
        if existing_draft:
            return existing_draft

        draft = GradingDraft(
            submission_id=submission_id,
            rubric_id=rubric.id,
            status='drafting',
            criteria_evaluations=[],
            total_score=0.0
        )
        
        is_anomalous, reason = await self._detect_anomaly(submission_text)
        
        if is_anomalous:
            draft.status = 'anomaly_flagged'
            draft.anomaly_reason = reason
        else:
            evaluations = await self._score_with_rubric(submission_text, rubric)
            draft.criteria_evaluations = evaluations
            draft.total_score = sum([e.suggested_score for e in evaluations])
            draft.status = 'needs_review'
            
        await draft.save()
        return draft

    async def calculate_calibration_override_rate(self, rubric_id: uuid.UUID, criterion_id: uuid.UUID) -> Optional[float]:
        """
        Calculates the override rate for a specific criterion across a rubric.
        Returns None if there are fewer than 10 graded submissions for this rubric.
        """
        drafts = await GradingDraft.find(
            {"rubric_id": rubric_id, "status": {"$in": ['approved', 'published']}}
        ).to_list()
        
        total_graded = len(drafts)
        
        if total_graded < 10:
            return None
            
        override_count = 0
        for draft in drafts:
            for c_eval in draft.criteria_evaluations:
                if c_eval.criterion_id == criterion_id and c_eval.override_score is not None:
                    override_count += 1
                    break
                    
        return override_count / total_graded

grading_service = GradingService()
