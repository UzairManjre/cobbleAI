import re
import uuid
from dataclasses import dataclass, field, asdict
from typing import List, Optional

import nltk
from qdrant_client.models import PointStruct

from app.core.qdrant import qdrant_sync, ensure_collection_v2, delete_document_vectors, DENSE_VECTOR, SPARSE_VECTOR
from app.services.embeddings import embedder
from app.services.ingestion.segments import Segment
from app.services.retrieval.sparse import encode_document

# MiniLM-L6-v2 maps closely to roughly 1 token per word, so chunk sizes are in words.

_tokenizer_ready = None

# Stable namespace for chunk point ids, so re-ingesting a document overwrites its points
CHUNK_NAMESPACE = uuid.UUID("6b1f3c1e-5f0a-4c8e-9a51-0c0bb1e00a11")

SECTION_SIZE = 5  # pages/slides per document section (the chapter prior's unit for non-lecture files)
SUMMARY_WORDS = 120


def _sent_tokenize(text: str) -> list[str]:
    """NLTK sentence split; falls back to a regex split when punkt data is unavailable."""
    global _tokenizer_ready
    if _tokenizer_ready is None:
        _tokenizer_ready = True
        for resource in ("punkt", "punkt_tab"):
            try:
                nltk.data.find(f"tokenizers/{resource}")
            except LookupError:
                try:
                    nltk.download(resource, quiet=True)
                except Exception:
                    _tokenizer_ready = False
    if _tokenizer_ready:
        try:
            return nltk.sent_tokenize(text)
        except LookupError:
            _tokenizer_ready = False
    return [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def split_into_chunks(text: str, chunk_size: int = 400, overlap: int = 80, min_chunk: int = 100):
    sentences = _sent_tokenize(text)
    chunks = []
    current_chunk = []
    current_length = 0

    for sentence in sentences:
        words = sentence.split()
        if current_length + len(words) > chunk_size and len(current_chunk) > 0:
            chunks.append(" ".join(current_chunk))
            # Keep the overlap sentences
            overlap_length = 0
            overlap_chunk = []
            for s in reversed(current_chunk):
                s_len = len(s.split())
                if overlap_length + s_len <= overlap:
                    overlap_chunk.insert(0, s)
                    overlap_length += s_len
                else:
                    break
            current_chunk = overlap_chunk
            current_length = overlap_length

        current_chunk.append(sentence)
        current_length += len(words)

    if current_chunk and current_length >= min_chunk:
        chunks.append(" ".join(current_chunk))
    elif current_chunk and chunks:
        chunks[-1] += " " + " ".join(current_chunk)
    elif current_chunk:
        # A short document is still one chunk, not an empty (failed) document
        chunks.append(" ".join(current_chunk))

    return chunks


#   Located chunks (v2)

@dataclass
class Chunk:
    text: str
    chunk_index: int
    source_type: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    slide_start: Optional[int] = None
    slide_end: Optional[int] = None
    t_start: Optional[float] = None
    t_end: Optional[float] = None
    chapter_id: Optional[str] = None
    section_title: Optional[str] = None
    extra: dict = field(default_factory=dict)


@dataclass
class SectionSummary:
    chapter_id: str
    title: str
    text: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    slide_start: Optional[int] = None
    slide_end: Optional[int] = None
    t_start: Optional[float] = None
    t_end: Optional[float] = None


def _section_key(seg: Segment, position: int) -> int:
    if seg.page is not None:
        return (seg.page - 1) // SECTION_SIZE
    if seg.slide is not None:
        return (seg.slide - 1) // SECTION_SIZE
    return position  # docx: each heading block is its own section


def _span(values):
    values = [v for v in values if v is not None]
    return (min(values), max(values)) if values else (None, None)


def _make_chunk(parts: List[Segment], text: str, index: int, chapter_id: Optional[str]) -> Chunk:
    page_start, page_end = _span(p.page for p in parts)
    slide_start, slide_end = _span(p.slide for p in parts)
    t_start, _ = _span(p.t_start for p in parts)
    _, t_end = _span(p.t_end for p in parts)
    return Chunk(
        text=text,
        chunk_index=index,
        source_type=parts[0].source_type,
        page_start=page_start, page_end=page_end,
        slide_start=slide_start, slide_end=slide_end,
        t_start=t_start, t_end=t_end,
        chapter_id=chapter_id,
        section_title=next((p.section_title for p in parts if p.section_title), None),
        # Extra payload such as a lecture chunk's chapter_title travels with the chunk
        extra={k: v for k, v in (parts[0].extra or {}).items() if k != "chapter_id"},
    )


def chunk_segments(
    segments: List[Segment],
    doc_id: str,
    chunk_size: int = 400,
    overlap: int = 80,
    min_chunk: int = 100,
) -> tuple[List[Chunk], List[SectionSummary]]:
    """Pack located segments into ~chunk_size-word chunks that remember their source span.

    Slides and PDF pages stay one chunk each so citations, graph provenance and per-page counts
    name the right page (lecture PDFs are often exported slides with a few words per page);
    DOCX paragraphs are packed together. Long units are split into overlapping sentence windows.
    Segments that already carry a chapter (lecture transcripts) keep it.
    Returns the chunks plus one extractive summary per document section (for the chapter prior).
    """
    chunks: List[Chunk] = []
    sections: dict = {}

    def chapter_for(seg: Segment, position: int) -> str:
        if seg.extra.get("chapter_id"):
            return seg.extra["chapter_id"]
        key = _section_key(seg, position)
        chapter_id = f"{doc_id}:sec{key}"
        sections.setdefault(chapter_id, []).append(seg)
        return chapter_id

    pending: List[Segment] = []
    pending_words = 0
    pending_chapter: Optional[str] = None

    def flush_pending():
        nonlocal pending, pending_words, pending_chapter
        if pending:
            text = "\n".join(s.text for s in pending)
            prev = chunks[-1] if chunks else None
            if (prev and pending_words < min_chunk and prev.chapter_id == pending_chapter
                    and prev.source_type == pending[0].source_type):
                # Too small on its own: fold into the previous chunk of the same section
                tail = _make_chunk(pending, text, prev.chunk_index, pending_chapter)
                prev.text += "\n" + text
                prev.page_end = tail.page_end if tail.page_end is not None else prev.page_end
                prev.t_end = tail.t_end if tail.t_end is not None else prev.t_end
            else:
                chunks.append(_make_chunk(pending, text, len(chunks), pending_chapter))
        pending, pending_words, pending_chapter = [], 0, None

    for position, seg in enumerate(segments):
        text = (seg.text or "").strip()
        if not text:
            continue
        chapter_id = chapter_for(seg, position)
        words = len(text.split())

        if seg.source_type in ("slide", "pdf_page", "transcript", "frame_ocr"):
            # Pre-sized units: keep them whole unless oversized
            flush_pending()
            if words <= chunk_size:
                chunks.append(_make_chunk([seg], text, len(chunks), chapter_id))
            else:
                for piece in split_into_chunks(text, chunk_size, overlap, min_chunk=0):
                    chunks.append(_make_chunk([seg], piece, len(chunks), chapter_id))
            continue

        if words > chunk_size:
            flush_pending()
            for piece in split_into_chunks(text, chunk_size, overlap, min_chunk=0):
                chunks.append(_make_chunk([seg], piece, len(chunks), chapter_id))
            continue

        if pending and (pending_words + words > chunk_size or chapter_id != pending_chapter):
            flush_pending()
        pending.append(seg)
        pending_words += words
        pending_chapter = chapter_id
    flush_pending()

    summaries = []
    for chapter_id, segs in sections.items():
        titles = [s.section_title for s in segs if s.section_title]
        firsts = []
        for s in segs:
            sentences = _sent_tokenize(s.text)
            if sentences:
                firsts.append(sentences[0])
        words = " ".join(dict.fromkeys(titles + firsts)).split()
        page_start, page_end = _span(s.page for s in segs)
        slide_start, slide_end = _span(s.slide for s in segs)
        summaries.append(SectionSummary(
            chapter_id=chapter_id,
            title=titles[0] if titles else "",
            text=" ".join(words[:SUMMARY_WORDS]),
            page_start=page_start, page_end=page_end,
            slide_start=slide_start, slide_end=slide_end,
        ))
    return chunks, summaries


def _point_id(doc_id: str, key: str) -> str:
    return str(uuid.uuid5(CHUNK_NAMESPACE, f"{doc_id}:{key}"))


def _location_payload(item) -> dict:
    payload = {}
    for name in ("page_start", "page_end", "slide_start", "slide_end", "t_start", "t_end", "chapter_id"):
        value = getattr(item, name, None)
        if value is not None:
            payload[name] = value
    return payload


def index_chunks(
    chunks: List[Chunk],
    course_id: str,
    doc_id: str,
    filename: str = None,
    summaries: List[SectionSummary] = None,
    media_type: str = "document",
    batch_size: int = 64,
) -> int:
    """Embed located chunks (dense + BM25) into the course's v2 collection.

    Re-indexing a document first removes its previous points, so the operation is idempotent.
    Returns the number of content chunks stored (section summaries are not counted).
    """
    if isinstance(course_id, bytes):
        course_id = str(uuid.UUID(bytes=course_id))
    if isinstance(doc_id, bytes):
        doc_id = str(uuid.UUID(bytes=doc_id))
    if not chunks:
        return 0

    collection = ensure_collection_v2(course_id, client=qdrant_sync)
    delete_document_vectors(course_id, doc_id, client=qdrant_sync)

    items = []
    for chunk in chunks:
        payload = {
            "chunk_id": _point_id(doc_id, f"chunk:{chunk.chunk_index}"),
            "doc_id": doc_id,
            "course_id": course_id,
            "text": chunk.text,
            "chunk_index": chunk.chunk_index,
            "source_type": chunk.source_type,
            "media_type": media_type,
            **_location_payload(chunk),
        }
        if filename:
            payload["filename"] = filename
        if chunk.section_title:
            payload["section_title"] = chunk.section_title
        payload.update({k: v for k, v in (chunk.extra or {}).items() if v is not None})
        items.append((payload["chunk_id"], chunk.text, payload))

    for summary in summaries or []:
        if not summary.text:
            continue
        payload = {
            "chunk_id": _point_id(doc_id, f"summary:{summary.chapter_id}"),
            "doc_id": doc_id,
            "course_id": course_id,
            "text": summary.text,
            "source_type": "chapter_summary",
            "media_type": media_type,
            "section_title": summary.title,
            **_location_payload(summary),
        }
        if filename:
            payload["filename"] = filename
        items.append((payload["chunk_id"], summary.text, payload))

    print(f"    Encoding {len(items)} points (dense + BM25)...")
    for start in range(0, len(items), batch_size):
        batch = items[start:start + batch_size]
        dense = embedder.encode([text for _, text, _ in batch])
        points = [
            PointStruct(
                id=point_id,
                vector={
                    DENSE_VECTOR: list(map(float, vec.tolist() if hasattr(vec, "tolist") else vec)),
                    SPARSE_VECTOR: encode_document(text),
                },
                payload=payload,
            )
            for (point_id, text, payload), vec in zip(batch, dense)
        ]
        qdrant_sync.upsert(collection_name=collection, points=points)
    print(f"     Indexed {len(chunks)} chunks into {collection}")
    return len(chunks)


def embed_and_store(chunks: list[str], course_id: str, doc_id: str, filename: str = None):
    """Index plain-text chunks (no location metadata) into the v2 collection."""
    located = [Chunk(text=t, chunk_index=i, source_type="text") for i, t in enumerate(chunks)]
    return index_chunks(located, course_id, doc_id, filename)
