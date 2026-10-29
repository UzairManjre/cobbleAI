"""Link generated questions to the graph concept they assess (needed for mastery updates)."""

from typing import Iterable, Optional

from rapidfuzz import fuzz, process

from app.services.graph_provenance import normalize_label


def match_node(topic: Optional[str], nodes, text: Optional[str] = None) -> Optional[str]:
    """Best graph node for a question: its topic (exact label, then fuzzy >= 85), else the concept
    the question text names (the longest label mentioned, so "Priority Scheduling" beats "Scheduling")."""
    if not nodes:
        return None
    labels = {normalize_label(n.label): n.id for n in nodes if n.label}
    if topic:
        key = normalize_label(topic)
        if key in labels:
            return labels[key]
        best = process.extractOne(key, list(labels), scorer=fuzz.token_sort_ratio)
        if best and best[1] >= 85:
            return labels[best[0]]
    if text:
        low = normalize_label(text)
        mentioned = [label for label in labels if len(label) >= 4 and label in low]
        if not mentioned:
            # Labels often carry an abbreviation or suffix the question leaves out: "Aging" vs "Aging (priority)"
            mentioned = [label for label in labels if len(label) >= 6 and fuzz.partial_ratio(label, low) >= 92]
        if mentioned:
            return labels[max(mentioned, key=len)]
    return None


def tag_questions(questions: Iterable, graph) -> int:
    """Set node_id on questions whose topic matches a concept; returns how many were tagged."""
    if not graph:
        return 0
    tagged = 0
    for q in questions:
        if not getattr(q, "node_id", None):
            q.node_id = match_node(q.topic, graph.nodes, getattr(q, "question_text", None))
        tagged += int(bool(q.node_id))
    return tagged
