"""RAGAs-style generation metrics, computed locally with the judge and the course embedder."""

import math
from typing import List, Optional

from eval.judge import Judge


async def faithfulness(judge: Judge, answer: str, context: str) -> Optional[float]:
    """Share of the answer's factual claims supported by the retrieved context (None: no claims)."""
    claims = await judge.decompose_claims(answer)
    if not claims:
        return None
    verdicts = await judge.verify_claims(claims, context)
    return sum(verdicts) / len(claims)


async def context_precision(judge: Judge, question: str, reference: str, chunks: List[str]) -> Optional[float]:
    """Average precision of relevant chunks over the ranking (rewards relevant chunks ranked first)."""
    if not chunks:
        return None
    relevant = [await judge.chunk_relevant(question, reference, c) for c in chunks]
    if not any(relevant):
        return 0.0
    hits, total = 0, 0.0
    for k, rel in enumerate(relevant, start=1):
        if rel:
            hits += 1
            total += hits / k
    return total / sum(relevant)


def _cosine(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


async def answer_relevancy(judge: Judge, question: str, answer: str, n: int = 3) -> Optional[float]:
    """Mean similarity between the question and questions the answer would answer."""
    from app.services.embeddings import embedder
    generated = await judge.questions_from_answer(answer, n)
    if not generated:
        return None
    vectors = [list(map(float, v)) for v in embedder.encode([question, *generated])]
    return sum(_cosine(vectors[0], v) for v in vectors[1:]) / len(generated)


def decision_metrics(items: List[dict]) -> dict:
    """Cite-or-decline: declines on unanswerable questions vs. false declines on answerable ones.
    Each item needs `answerable` (bool) and `decision` ('answered' | 'declined' | 'error')."""
    unanswerable = [i for i in items if not i["answerable"]]
    answerable = [i for i in items if i["answerable"]]
    correct = sum(1 for i in items if (i["decision"] == "declined") != i["answerable"])
    return {
        "correct_decline_rate": (sum(1 for i in unanswerable if i["decision"] == "declined") / len(unanswerable)) if unanswerable else None,
        "false_decline_rate": (sum(1 for i in answerable if i["decision"] == "declined") / len(answerable)) if answerable else None,
        "decision_accuracy": correct / len(items) if items else None,
        "n_answerable": len(answerable),
        "n_unanswerable": len(unanswerable),
    }
