"""Provenance for the course knowledge graph (Upgrade D).

Concepts and relations are extracted from *located* evidence chunks (labelled
E1, E2, ...). The LLM cites the label and a short quote; we then verify the
quote against that chunk, fall back to finding the concept mentioned in the
materials, and link concepts to the lecture moments that discuss them. An edge
with no verified quote and no chunk mentioning both ends is flagged unsupported.
"""

import hashlib
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from rapidfuzz import fuzz

QUOTE_THRESHOLD = 0.8  # partial-ratio match needed for a quote to count as verified
MENTION_THRESHOLD = 0.9
MAX_NODE_EVIDENCE = 3
MAX_LECTURE_MOMENTS = 3


@dataclass
class EvidenceChunk:
    ref: str
    text: str
    doc_id: Optional[str] = None
    filename: Optional[str] = None
    chunk_id: Optional[str] = None
    media_type: str = "document"
    page: Optional[int] = None
    slide: Optional[int] = None
    t_start: Optional[float] = None
    t_end: Optional[float] = None

    @property
    def location(self) -> str:
        from app.services.retrieval.hybrid import format_timestamp
        if self.t_start is not None:
            return f"{format_timestamp(self.t_start)}"
        if self.slide is not None:
            return f"slide {self.slide}"
        if self.page is not None:
            return f"p. {self.page}"
        return ""

    def evidence(self, quote: str, score: float, method: str) -> dict:
        return {
            "doc_id": self.doc_id, "filename": self.filename, "chunk_id": self.chunk_id,
            "page": self.page, "slide": self.slide, "t_start": self.t_start, "t_end": self.t_end,
            "quote": quote[:300], "support_score": round(score, 3), "method": method,
        }


def normalize_label(label: str) -> str:
    return re.sub(r"\s+", " ", (label or "").strip().lower())


def stable_node_id(course_id: str, label: str) -> str:
    """Same concept name in the same course -> same id across regenerations, so
    node metrics, study plans and sessions keyed by node id survive."""
    return "node_" + hashlib.sha1(f"{course_id}:{normalize_label(label)}".encode()).hexdigest()[:12]


def stable_edge_id(source_id: str, target_id: str, relation: str) -> str:
    return "edge_" + hashlib.sha1(f"{source_id}:{target_id}:{relation}".encode()).hexdigest()[:12]


#   Loading located evidence

def chunks_from_payloads(payloads: List[dict]) -> List[EvidenceChunk]:
    out = []
    for i, p in enumerate(payloads, start=1):
        out.append(EvidenceChunk(
            ref=f"E{i}", text=p.get("text", ""), doc_id=p.get("doc_id"), filename=p.get("filename"),
            chunk_id=p.get("chunk_id"), media_type=p.get("media_type", "document"),
            page=p.get("page_start"), slide=p.get("slide_start"), t_start=p.get("t_start"), t_end=p.get("t_end"),
        ))
    return out


def load_course_chunks(course_id: str, client=None) -> List[EvidenceChunk]:
    """Every indexed content chunk of a course (documents and lectures), in document order."""
    from app.core import qdrant as qdrant_core
    c = client or qdrant_core.qdrant_sync
    name = qdrant_core.collection_name(course_id)
    if not c.collection_exists(name):
        return []
    payloads, offset = [], None
    while True:
        batch, offset = c.scroll(name, limit=512, offset=offset, with_payload=True)
        payloads += [p.payload for p in batch if p.payload and p.payload.get("source_type") != "chapter_summary"]
        if offset is None:
            break
    payloads.sort(key=lambda p: (p.get("media_type", "document"), p.get("filename") or "", p.get("chunk_index", 0)))
    return chunks_from_payloads(payloads)


def build_prompt_chunks(chunks: List[EvidenceChunk], max_chars: int = 10_000) -> List[str]:
    """Pack labelled evidence into LLM-sized blocks: '[E3] week2.pdf, p. 4' + text."""
    blocks, current = [], ""
    for chunk in chunks:
        header = f"[{chunk.ref}] {chunk.filename or 'material'}" + (f", {chunk.location}" if chunk.location else "")
        piece = f"{header}\n{chunk.text.strip()}\n\n"
        if len(piece) > max_chars:
            piece = piece[:max_chars]
        if current and len(current) + len(piece) > max_chars:
            blocks.append(current)
            current = ""
        current += piece
    if current:
        blocks.append(current)
    return blocks


#   Verification

def quote_score(quote: str, text: str) -> float:
    quote = (quote or "").strip()
    if len(quote) < 8:
        return 0.0
    return fuzz.partial_ratio(quote.lower(), (text or "").lower()) / 100.0


def mention_score(label: str, text: str) -> float:
    label = normalize_label(label)
    if not label:
        return 0.0
    text = (text or "").lower()
    if label in text:
        return 1.0
    if len(label) < 5:
        return 0.0  # fuzzy matching of very short labels is noise
    return fuzz.partial_ratio(label, text) / 100.0


def _snippet(text: str, label: str, width: int = 220) -> str:
    low = text.lower()
    i = low.find(normalize_label(label))
    if i < 0:
        return text[:width]
    start = max(0, i - width // 3)
    return text[start:start + width]


def _verify_refs(evidence_refs: List[dict], by_ref: Dict[str, EvidenceChunk]) -> List[dict]:
    verified = []
    for ev in evidence_refs or []:
        if not isinstance(ev, dict):
            continue
        chunk = by_ref.get(str(ev.get("ref", "")).strip().upper())
        if not chunk:
            continue
        quote = str(ev.get("quote", ""))
        score = quote_score(quote, chunk.text)
        verified.append(chunk.evidence(quote, score, "quote"))
    return verified


def node_provenance(label: str, evidence_refs: List[dict], chunks: List[EvidenceChunk],
                    by_ref: Dict[str, EvidenceChunk]) -> Tuple[List[dict], bool]:
    evidence = [e for e in _verify_refs(evidence_refs, by_ref) if e["support_score"] >= QUOTE_THRESHOLD]
    seen = {e["chunk_id"] for e in evidence}
    mentions = sorted(
        ((mention_score(label, c.text), c) for c in chunks),
        key=lambda pair: pair[0], reverse=True,
    )
    for score, chunk in mentions:
        if score < MENTION_THRESHOLD or len([e for e in evidence if e["method"] != "lecture_moment"]) >= MAX_NODE_EVIDENCE:
            break
        if chunk.media_type == "lecture" or chunk.chunk_id in seen:
            continue
        evidence.append(chunk.evidence(_snippet(chunk.text, label), score, "mention"))
        seen.add(chunk.chunk_id)
    # Lecture moments that discuss the concept ("jump to where it is explained")
    moments = [(s, c) for s, c in mentions if s >= MENTION_THRESHOLD and c.media_type == "lecture" and c.chunk_id not in seen]
    for score, chunk in sorted(moments, key=lambda pair: pair[1].t_start or 0)[:MAX_LECTURE_MOMENTS]:
        evidence.append(chunk.evidence(_snippet(chunk.text, label), score, "lecture_moment"))
    return evidence, any(e["support_score"] >= QUOTE_THRESHOLD for e in evidence)


def edge_provenance(source_label: str, target_label: str, evidence_refs: List[dict],
                    chunks: List[EvidenceChunk], by_ref: Dict[str, EvidenceChunk]) -> Tuple[List[dict], bool]:
    evidence = [e for e in _verify_refs(evidence_refs, by_ref) if e["support_score"] >= QUOTE_THRESHOLD]
    if evidence:
        return evidence[:2], True
    for chunk in chunks:
        a, b = mention_score(source_label, chunk.text), mention_score(target_label, chunk.text)
        if a >= MENTION_THRESHOLD and b >= MENTION_THRESHOLD:
            # Both concepts are discussed together: weaker than a quote, but auditable
            return [chunk.evidence(_snippet(chunk.text, source_label, 300), min(a, b) * 0.6, "co_mention")], True
    return [], False


def attach_provenance(course_id: str, concepts: List[dict], relationships: List[dict],
                      chunks: List[EvidenceChunk]) -> Tuple[List[dict], List[dict]]:
    """Turn merged LLM output into graph nodes/edges with stable ids and verified provenance."""
    by_ref = {c.ref.upper(): c for c in chunks}
    nodes, name_to_id = [], {}
    for concept in concepts:
        label = (concept.get("name") or concept.get("label") or "").strip()
        if not label:
            continue
        node_id = stable_node_id(course_id, label)
        if node_id in {n["id"] for n in nodes}:
            continue
        name_to_id[normalize_label(label)] = node_id
        evidence, supported = node_provenance(label, concept.get("evidence", []), chunks, by_ref)
        source_docs = sorted({e["filename"] for e in evidence if e.get("filename")} | set(concept.get("source_docs") or []))
        nodes.append({
            "id": node_id, "label": label, "description": concept.get("description", ""),
            "category": concept.get("category", "concept"), "source_docs": source_docs,
            "difficulty": concept.get("difficulty", "intermediate"),
            "provenance": evidence, "supported": supported,
        })

    labels = {n["id"]: n["label"] for n in nodes}
    edges, seen = [], set()
    for rel in relationships:
        src = name_to_id.get(normalize_label(rel.get("from") or rel.get("source") or ""))
        tgt = name_to_id.get(normalize_label(rel.get("to") or rel.get("target") or ""))
        if not src or not tgt or src == tgt:
            continue
        relation = rel.get("relation") or rel.get("type") or "relates_to"
        edge_id = stable_edge_id(src, tgt, str(relation))
        if edge_id in seen:
            continue
        seen.add(edge_id)
        evidence, supported = edge_provenance(labels[src], labels[tgt], rel.get("evidence", []), chunks, by_ref)
        edges.append({
            "id": edge_id, "from": src, "to": tgt, "relation": relation,
            "strength": rel.get("strength", 0.8), "provenance": evidence, "supported": supported,
        })
    return nodes, edges
