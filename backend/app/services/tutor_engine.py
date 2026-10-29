"""CobbleAI 2.0 tutor engine: one pipeline for every tutor surface.

    policy -> hybrid retrieval -> cite-or-decline gate -> prompt (mode + hint level)
           -> stream -> post-process (citations, decline token, support) -> persist + run log

Used by the graph-node study session (/sessions/{id}/ask), the course-level
"ask the course / ask this lecture" chat, and the evaluation harness (answer_once).
"""

import re
import time
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Optional

from app.core.config import settings
from app.core.prompts import (
    DECLINE_MESSAGE, DECLINE_TOKEN, HINT_INSTRUCTIONS, MODE_INSTRUCTIONS,
    GROUNDING_RULES, TUTOR_PROMPT_VERSION, TUTOR_SYSTEM_V2,
)
from app.services.llm import LLMAdapter, is_llm_error
from app.services.rag import retrieve_with_details
from app.services.retrieval.config import RetrievalConfig, default_config
from app.services.retrieval.hybrid import RetrievalResult, chunk_to_source, format_context
from app.services.tutor_policy import EffectivePolicy, clamp_hint, effective_policy
from app.utils.llm_text import split_thinking

MODES = ("teach", "review", "teach_back")
LLM_OPTIONS = {"temperature": 0.3, "num_ctx": 32768, "max_tokens": 1024}
HISTORY_TURNS = 8  # most recent messages sent back to the model
STRONG_SUPPORT = 0.5  # top reranked support at or above this, with a valid citation, is "strong"

_CITATION_RE = re.compile(r"\[\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*\]", re.IGNORECASE)


@dataclass
class TutorRequest:
    question: str
    course_id: Optional[str]
    mode: str = "teach"
    hint_level: Optional[str] = None
    node: Optional[dict] = None  # {"label", "description"} of the concept being studied
    neighbors: List[dict] = field(default_factory=list)
    history: List[dict] = field(default_factory=list)  # [{"role", "content"}], oldest first
    doc_ids: Optional[List[str]] = None  # scope, e.g. one lecture for "ask this lecture"
    media_types: Optional[List[str]] = None
    node_id: Optional[str] = None
    retrieval_config: Optional[RetrievalConfig] = None  # override (evaluation / ablations)
    user: object = None
    # A fixed policy instead of the course's live one: evaluation runs must not depend on what an
    # instructor set today, and FAQ drafting is not bound by the student hint cap
    policy: Optional[EffectivePolicy] = None


@dataclass
class PreparedAnswer:
    request: TutorRequest
    policy: EffectivePolicy
    hint_level: str
    retrieval: RetrievalResult
    sources: List[dict]
    decision: str  # "answer" (call the LLM) or "declined"
    decline_reason: Optional[str] = None
    cite_or_decline: bool = True  # off: no retrieval gate, no decline rule in the prompt (v1 behaviour)
    system_prompt: str = ""
    messages: List[dict] = field(default_factory=list)
    prepare_ms: int = 0


@dataclass
class TutorOutcome:
    answer: str
    thinking: str
    decision: str  # answered | declined | error
    citations: List[dict]
    cited_sids: List[str]
    support: str  # strong | weak | none
    decline_reason: Optional[str] = None
    error: Optional[str] = None


def parse_citations(text: str, sources: List[dict]) -> tuple[List[str], List[dict]]:
    """Cited source labels in order of first use, keeping only labels that exist."""
    by_sid = {s["sid"].upper(): s for s in sources if s.get("sid")}
    order: List[str] = []
    for group in _CITATION_RE.findall(text or ""):
        for sid in re.split(r"\s*[,;]\s*", group):
            sid = sid.strip().upper()
            if sid in by_sid and sid not in order:
                order.append(sid)
    return order, [by_sid[s] for s in order]


def _concept_block(req: TutorRequest) -> str:
    if not req.node:
        return ""
    related = ", ".join(f"{n.get('label')} ({n.get('relation')})" for n in req.neighbors if n.get("label")) or "none"
    return (
        f"The student is studying the concept: {req.node.get('label', '')} — {req.node.get('description', '')}\n"
        f"Related concepts: {related}\n"
    )


def build_prompt(req: TutorRequest, hint_level: str, retrieval: RetrievalResult, cite_or_decline: bool = True) -> str:
    sources_block = format_context(retrieval.chunks, numbered=True) or "(no sources found)"
    grounding = GROUNDING_RULES["decline" if cite_or_decline else "answer"].format(decline_token=DECLINE_TOKEN)
    return TUTOR_SYSTEM_V2.format(
        concept_block=_concept_block(req),
        grounding_rule=grounding,
        mode_instructions=MODE_INSTRUCTIONS.get(req.mode, MODE_INSTRUCTIONS["teach"]),
        hint_instructions=HINT_INSTRUCTIONS[hint_level],
        sources_block=sources_block,
    )


def _history_messages(history: List[dict]) -> List[dict]:
    cleaned = []
    for msg in history[-HISTORY_TURNS:]:
        content = split_thinking(msg.get("content", ""))[0]
        if content:
            cleaned.append({"role": msg.get("role", "user"), "content": content})
    return cleaned


class TutorEngine:
    def __init__(self, adapter: Optional[LLMAdapter] = None):
        self.adapter = adapter or LLMAdapter()
        self.model = self.adapter.model

    async def prepare(self, req: TutorRequest) -> PreparedAnswer:
        start = time.perf_counter()
        mode = req.mode if req.mode in MODES else "teach"
        req.mode = mode
        course_uuid = uuid.UUID(str(req.course_id)) if req.course_id else None
        policy = req.policy or await effective_policy(course_uuid, req.user, req.node_id)
        hint_level = clamp_hint(req.hint_level, policy)

        config = req.retrieval_config or default_config()
        # A student-chosen scope (one lecture, some documents) narrows the instructor's scope, never widens it
        doc_ids = req.doc_ids or None
        if policy.allowed_doc_ids:
            allowed = set(policy.allowed_doc_ids)
            doc_ids = [d for d in doc_ids if d in allowed] if doc_ids else list(policy.allowed_doc_ids)
        out_of_scope = doc_ids is not None and not doc_ids
        config = config.with_scope(doc_ids=doc_ids, media_types=req.media_types)

        # Teach-back retrieves on the student's explanation, so claims can be checked against it
        query = req.question
        if mode == "teach_back" and req.node:
            query = f"{req.node.get('label', '')}: {req.question}"

        if req.course_id and not out_of_scope:
            retrieval = await retrieve_with_details(query, str(req.course_id), config)
        else:
            retrieval = RetrievalResult(query=query, chunks=[], config=config)
        sources = [chunk_to_source(c) for c in retrieval.chunks]

        cite_or_decline = bool(settings.CITE_OR_DECLINE and policy.cite_or_decline)
        gate_on = cite_or_decline and mode != "teach_back"
        decision, reason = "answer", None
        if out_of_scope:
            decision, reason = "declined", "out_of_scope"
        elif gate_on and not retrieval.chunks:
            decision, reason = "declined", "no_sources"
        elif gate_on and retrieval.top_support < config.decline_min_support:
            decision, reason = "declined", "low_support"

        prepared = PreparedAnswer(
            request=req, policy=policy, hint_level=hint_level, retrieval=retrieval,
            sources=sources, decision=decision, decline_reason=reason, cite_or_decline=cite_or_decline,
        )
        if decision == "answer":
            prepared.system_prompt = build_prompt(req, hint_level, retrieval, cite_or_decline)
            prepared.messages = [*_history_messages(req.history), {"role": "user", "content": req.question}]
        prepared.prepare_ms = int((time.perf_counter() - start) * 1000)
        return prepared

    def stream(self, prepared: PreparedAnswer) -> AsyncIterator[str]:
        return self.adapter.generate_response(
            system=prepared.system_prompt,
            messages=prepared.messages,
            max_tokens=LLM_OPTIONS["max_tokens"],
            stream=True,
        )

    def finalize(self, prepared: PreparedAnswer, raw_text: str, error: Optional[str] = None) -> TutorOutcome:
        if prepared.decision == "declined":
            return TutorOutcome(answer=DECLINE_MESSAGE, thinking="", decision="declined", citations=[],
                                cited_sids=[], support="none", decline_reason=prepared.decline_reason)
        answer, thinking = split_thinking(raw_text)
        if error and not answer:
            return TutorOutcome(answer="", thinking=thinking, decision="error", citations=[], cited_sids=[],
                                support="none", error=error)
        if DECLINE_TOKEN in answer and not prepared.cite_or_decline:
            answer = answer.replace(DECLINE_TOKEN, "").strip()  # declining is switched off
        if DECLINE_TOKEN in answer:
            # The model judged the sources insufficient
            note = answer.split(DECLINE_TOKEN, 1)[1].strip()
            text = DECLINE_MESSAGE + (f" ({note})" if note else "")
            return TutorOutcome(answer=text, thinking=thinking, decision="declined", citations=[],
                                cited_sids=[], support="none", decline_reason="model_declined")
        cited_sids, citations = parse_citations(answer, prepared.sources)
        support = "strong" if citations and prepared.retrieval.top_support >= STRONG_SUPPORT else "weak"
        return TutorOutcome(answer=answer, thinking=thinking, decision="answered", citations=citations,
                            cited_sids=cited_sids, support=support, error=error)

    async def answer_once(self, req: TutorRequest) -> tuple[PreparedAnswer, TutorOutcome, Dict[str, int]]:
        """Non-streaming answer (evaluation harness, simulated students)."""
        prepared = await self.prepare(req)
        timings = {"prepare": prepared.prepare_ms, **prepared.retrieval.timings_ms}
        if prepared.decision == "declined":
            return prepared, self.finalize(prepared, ""), timings
        start = time.perf_counter()
        text, error = "", None
        async for chunk in self.stream(prepared):
            if is_llm_error(chunk):
                error = chunk
                break
            text += chunk
        timings["generation"] = int((time.perf_counter() - start) * 1000)
        return prepared, self.finalize(prepared, text, error), timings

    def run_fields(self, prepared: PreparedAnswer, outcome: TutorOutcome) -> dict:
        """TutorRun fields shared by live and evaluation runs."""
        req = prepared.request
        return {
            "mode": req.mode,
            "hint_level": prepared.hint_level,
            "question": req.question,
            "scope": {"doc_ids": req.doc_ids, "media_types": req.media_types},
            "policy": prepared.policy.to_dict(),
            "prompt_version": TUTOR_PROMPT_VERSION,
            "model": self.model if prepared.decision == "answer" else None,
            "llm_options": LLM_OPTIONS,
            "decision": outcome.decision,
            "decline_reason": outcome.decline_reason,
            "support_level": outcome.support,
            "cited_sids": outcome.cited_sids,
            "answer": outcome.answer,
            "error": outcome.error,
        }
