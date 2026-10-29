"""Shared helpers for professor insights: the period window, the student questions
it covers, concept labels, keyword topics and clustering."""

import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from app.models.tutor import TutorRun
from app.utils.llm_text import split_thinking

# Cosine distance under which two questions join the same cluster (average linkage).
# Recorded in every insight's `method` so a report can say how it was made.
DISTANCE_THRESHOLD = 0.6
_WORD_RE = re.compile(r"[a-z][a-z0-9+#-]{2,}")


def period(days: int, until: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    end = until or datetime.now(timezone.utc)
    return end - timedelta(days=max(1, days)), end


async def student_runs(course_id: uuid.UUID, since: datetime, until: datetime) -> List[TutorRun]:
    """Live tutor runs from students (evaluation runs, professor previews and teach-back
    explanations are not questions about the material)."""
    return await TutorRun.find(
        TutorRun.course_id == course_id,
        TutorRun.eval_run == None,  # noqa: E711
        TutorRun.user_role == "student",
        TutorRun.created_at >= since,
        TutorRun.created_at <= until,
        {"mode": {"$ne": "teach_back"}},
    ).sort(+TutorRun.created_at).to_list()


async def node_labels(course_id: uuid.UUID) -> Dict[str, str]:
    from app.services.learner.features import latest_graph
    graph = await latest_graph(course_id)
    if not graph:
        return {}
    return {n["id"]: n["label"] or n["id"] for n in graph.nodes_as_dicts()}


def keyword_topic(texts: List[str], k: int = 3) -> str:
    """Most frequent content words across the texts; the fallback cluster label."""
    from app.services.retrieval.sparse import STOPWORDS
    counts = Counter(
        w for t in texts for w in set(_WORD_RE.findall((t or "").lower()))
        if w not in STOPWORDS and w not in {"explain", "what", "how", "does", "why", "mean", "means", "difference"}
    )
    words = [w for w, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]
    return ", ".join(words) if words else "General questions"


def common_nodes(node_ids: List[Optional[str]], labels: Dict[str, str], k: int = 3) -> Tuple[List[str], List[str]]:
    top = [n for n, _ in Counter(n for n in node_ids if n).most_common(k)]
    return top, [labels.get(n, n) for n in top]


def cluster_texts(texts: List[str], distance_threshold: float = DISTANCE_THRESHOLD) -> List[List[int]]:
    """Agglomerative clustering of question embeddings; groups of indices, largest first."""
    if not texts:
        return []
    if len(texts) == 1:
        return [[0]]
    import numpy as np
    from sklearn.cluster import AgglomerativeClustering
    from app.services.embeddings import embedder

    vectors = np.array([list(map(float, v)) for v in embedder.encode(texts)])
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors = vectors / np.where(norms == 0, 1, norms)
    labels = AgglomerativeClustering(
        n_clusters=None, distance_threshold=distance_threshold, metric="cosine", linkage="average",
    ).fit_predict(vectors)
    groups: Dict[int, List[int]] = defaultdict(list)
    for i, label in enumerate(labels):
        groups[int(label)].append(i)
    return sorted(groups.values(), key=lambda g: (-len(g), g[0]))


def parse_json_object(text: str) -> dict:
    text = split_thinking(text or "")[0]
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object in model output")
    return json.loads(re.sub(r",\s*([\]}])", r"\1", match.group(0)))


def is_gap(run: TutorRun) -> bool:
    """The tutor declined, or answered from weak or no support."""
    return run.decision == "declined" or (run.decision == "answered" and run.support_level in ("weak", "none"))
