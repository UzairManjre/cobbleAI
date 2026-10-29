"""LLM judge for RAGAs-style metrics and pedagogy rubrics.

Talks to any OpenAI-compatible /chat/completions endpoint. The default is the
local Ollama server's /v1 API, so no course data leaves the institution; point
JUDGE_BASE_URL / JUDGE_MODEL at a larger local model when one is available,
or at a hosted model only for the optional local-vs-cloud comparison (G).
Judge verdicts must be calibrated against human ratings before they are reported
(see `eval.cli import-ratings`).
"""

import json
import os
import re
from typing import List, Optional

import httpx

from app.core.config import settings

_JSON_RE = re.compile(r"(\{.*\}|\[.*\])", re.DOTALL)


def extract_json(text: str):
    text = (text or "").split("</thought>")[-1]
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    match = _JSON_RE.search(text)
    if not match:
        raise ValueError(f"no JSON in judge output: {text[:200]}")
    return json.loads(match.group(1))


class Judge:
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None,
                 api_key: Optional[str] = None, seed: int = 7, timeout: float = 300.0):
        default_base = settings.LLM_BASE_URL.rstrip("/").removesuffix("/v1") + "/v1"
        self.base_url = (base_url or os.environ.get("JUDGE_BASE_URL") or default_base).rstrip("/")
        self.model = model or os.environ.get("JUDGE_MODEL") or settings.LLM_MODEL
        self.api_key = api_key or os.environ.get("JUDGE_API_KEY") or "ollama"
        # Thinking models otherwise spend the small verdict budgets reasoning and return no JSON.
        # "none" works on Ollama's /v1; set JUDGE_REASONING_EFFORT="" for servers that reject it.
        self.reasoning_effort = os.environ.get("JUDGE_REASONING_EFFORT", "none")
        self.seed = seed
        self.timeout = timeout

    def describe(self) -> dict:
        return {"base_url": self.base_url, "model": self.model, "seed": self.seed, "temperature": 0,
                "reasoning_effort": self.reasoning_effort or None}

    async def complete(self, system: str, user: str, max_tokens: int = 1024) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,
            "seed": self.seed,
            "max_tokens": max_tokens,
        }
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(f"{self.base_url}/chat/completions", json=payload,
                                    headers={"Authorization": f"Bearer {self.api_key}"})
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"] or ""

    async def _json(self, system: str, user: str, max_tokens: int = 1024):
        last_error = None
        for _ in range(2):
            try:
                return extract_json(await self.complete(system, user, max_tokens))
            except (ValueError, json.JSONDecodeError) as e:
                last_error = e
        raise last_error

    #   RAGAs-style building blocks

    async def decompose_claims(self, answer: str) -> List[str]:
        data = await self._json(
            "Split the answer into short, self-contained factual claims. Ignore questions, greetings and "
            "instructions to the student. Return a JSON list of strings (empty list if there are no factual claims).",
            f"Answer:\n{answer}",
        )
        return [str(c) for c in data] if isinstance(data, list) else []

    async def verify_claims(self, claims: List[str], context: str) -> List[bool]:
        if not claims:
            return []
        numbered = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(claims))
        data = await self._json(
            "For each claim, decide whether it is directly supported by the context. Use only the context. "
            'Return a JSON list of objects {"claim": <number>, "supported": true|false}, one per claim, in order.',
            f"Context:\n{context}\n\nClaims:\n{numbered}",
        )
        verdicts = {int(d.get("claim", i + 1)): bool(d.get("supported")) for i, d in enumerate(data if isinstance(data, list) else [])}
        return [verdicts.get(i + 1, False) for i in range(len(claims))]

    async def chunk_relevant(self, question: str, reference: str, chunk: str) -> bool:
        data = await self._json(
            'Decide whether the passage contains information useful for answering the question. Return JSON {"relevant": true|false}.',
            f"Question: {question}\nReference answer: {reference or '(not given)'}\n\nPassage:\n{chunk}",
            max_tokens=200,
        )
        return bool(data.get("relevant")) if isinstance(data, dict) else False

    async def answer_correctness(self, question: str, reference: str, answer: str) -> float:
        data = await self._json(
            "Compare the tutor's answer with the reference answer. Return JSON "
            '{"verdict": "correct"|"partially_correct"|"incorrect"|"no_answer"}. '
            'Use "no_answer" when the tutor only asks questions or declines.',
            f"Question: {question}\nReference answer: {reference}\n\nTutor answer:\n{answer}",
            max_tokens=200,
        )
        verdict = (data or {}).get("verdict", "incorrect") if isinstance(data, dict) else "incorrect"
        return {"correct": 1.0, "partially_correct": 0.5}.get(verdict, 0.0)

    async def questions_from_answer(self, answer: str, n: int = 3) -> List[str]:
        data = await self._json(
            f"Write {n} different questions that the given answer would be a good answer to. Return a JSON list of strings.",
            f"Answer:\n{answer}",
        )
        return [str(q) for q in data][:n] if isinstance(data, list) else []

    async def leakage(self, question: str, reference: str, reply: str) -> bool:
        """Did a hint-level reply give away the final answer?"""
        data = await self._json(
            "A tutor was asked to give a hint, not the answer. Decide whether the tutor's reply states the final "
            'answer (in substance) so the student no longer needs to think. Return JSON {"leaked": true|false}.',
            f"Question: {question}\nFinal answer: {reference}\n\nTutor reply:\n{reply}",
            max_tokens=200,
        )
        return bool(data.get("leaked")) if isinstance(data, dict) else False

    async def pedagogy_rubric(self, question: str, reference: str, reply: str, hint_level: str) -> dict:
        data = await self._json(
            "Rate one tutor turn. scaffolding: 1-5, how well it moves the student toward understanding without doing "
            "the thinking for them. correctness: 1-5, whether everything it states is accurate. leaked: whether it "
            f"gives away the final answer although the requested help level was '{hint_level}'. "
            'Return JSON {"scaffolding": int, "correctness": int, "leaked": bool, "rationale": str}.',
            f"Student question: {question}\nReference answer: {reference or '(not given)'}\n\nTutor reply:\n{reply}",
            max_tokens=400,
        )
        if not isinstance(data, dict):
            data = {}
        return {
            "scaffolding": int(data.get("scaffolding", 0) or 0),
            "correctness": int(data.get("correctness", 0) or 0),
            "leaked": bool(data.get("leaked", False)),
            "rationale": str(data.get("rationale", ""))[:500],
        }
