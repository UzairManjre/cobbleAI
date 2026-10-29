"""Hybrid retrieval against in-memory Qdrant with deterministic fake models."""

import uuid

import pytest
from qdrant_client.models import PointStruct, VectorParams, Distance

from app.services.chunking import chunk_segments, index_chunks
from app.services.ingestion.segments import Segment
from app.services.rag import retrieve_context
from app.services.retrieval.config import get_preset
from app.services.retrieval.hybrid import retrieve, location_label
from app.services.retrieval.sparse import encode_document, encode_query, tokenize
from tests.conftest import fake_vector

COURSE = "course-1"


def _index_course():
    lecture_notes = [
        Segment(text="Dijkstra's algorithm finds shortest paths using a priority queue.", source_type="pdf_page", page=1, section_title="Graphs"),
        Segment(text="Breadth-first search explores neighbours level by level.", source_type="pdf_page", page=2, section_title="Graphs"),
        Segment(text="Hash tables give average constant time lookups.", source_type="pdf_page", page=7, section_title="Hashing"),
    ]
    chunks, summaries = chunk_segments(lecture_notes, doc_id="notes", min_chunk=1, chunk_size=12)
    index_chunks(chunks, COURSE, "notes", "notes.pdf", summaries=summaries)

    slides = [
        Segment(text="Bellman-Ford handles negative edge weights.", source_type="slide", slide=1, section_title="Shortest paths"),
        Segment(text="Topological sort orders a DAG.", source_type="slide", slide=2, section_title="DAGs"),
    ]
    chunks, summaries = chunk_segments(slides, doc_id="slides")
    index_chunks(chunks, COURSE, "slides", "week5.pptx", summaries=summaries)


def no_expansion(name="hybrid", **overrides):
    return get_preset(name).model_copy(update={"query_expansion": False, **overrides})


def test_bm25_tokenizer_stems_and_drops_stopwords():
    assert tokenize("The sorting of the arrays") == ["sort", "array"]
    doc = encode_document("merge merge sort")
    assert len(doc.indices) == 2 and max(doc.values) > min(doc.values)  # repeated term weighs more
    assert set(encode_query("merge sort").indices) == set(doc.indices)


async def test_hybrid_returns_located_sources_with_all_signals(qdrant_memory):
    _index_course()
    result = await retrieve("How does Dijkstra find shortest paths?", COURSE, no_expansion(top_k=3))

    top = result.chunks[0]
    assert top.payload["filename"] == "notes.pdf" and top.payload["page_start"] == 1
    assert top.dense > 0 and top.bm25 > 0 and top.support >= 0.5
    assert top.chapter > 0  # its section summary matched the question
    assert result.collection == f"course_{COURSE}_v2"
    assert [c.rank for c in result.chunks] == [1, 2, 3]
    assert result.timings_ms["total"] >= 0


async def test_source_filters_and_doc_scope(qdrant_memory):
    _index_course()
    slides_only = await retrieve("shortest paths", COURSE, no_expansion(source_types=["slide"]))
    assert slides_only.chunks and all(c.payload["source_type"] == "slide" for c in slides_only.chunks)

    scoped = await retrieve("shortest paths", COURSE, no_expansion().with_scope(doc_ids=["notes"]))
    assert scoped.chunks and all(c.payload["doc_id"] == "notes" for c in scoped.chunks)
    # Chapter summaries are never returned as evidence
    assert all(c.payload["source_type"] != "chapter_summary" for c in scoped.chunks)


async def test_off_topic_question_has_low_support(qdrant_memory):
    _index_course()
    result = await retrieve("What is the capital of France?", COURSE, no_expansion())
    assert result.top_support < get_preset("hybrid").decline_min_support


async def test_v1_preset_uses_dense_only_and_v1_fusion(qdrant_memory):
    _index_course()
    result = await retrieve("Bellman-Ford negative weights", COURSE, no_expansion("v1"))
    assert all(c.bm25 == 0 and c.chapter == 0 for c in result.chunks)
    for c in result.chunks:
        assert c.score == pytest.approx(c.dense * 0.2 + c.rerank_logit * 0.8)
    scores = [c.score for c in result.chunks]
    assert scores == sorted(scores, reverse=True)


async def test_falls_back_to_legacy_v1_collection(qdrant_memory):
    legacy = f"course_{COURSE}"
    qdrant_memory.create_collection(legacy, vectors_config=VectorParams(size=384, distance=Distance.COSINE))
    qdrant_memory.upsert(legacy, points=[
        PointStruct(id=str(uuid.uuid4()), vector=fake_vector("heaps keep the minimum on top"),
                    payload={"doc_id": "old", "filename": "old.pdf", "text": "Heaps keep the minimum on top."}),
    ])
    result = await retrieve("What do heaps keep on top?", COURSE, no_expansion())
    assert result.collection == legacy
    assert result.chunks[0].payload["filename"] == "old.pdf"


async def test_missing_collection_returns_nothing(qdrant_memory):
    result = await retrieve("anything", "no-such-course", no_expansion())
    assert result.chunks == [] and result.collection is None


async def test_retrieve_context_keeps_v1_shape(qdrant_memory, monkeypatch):
    _index_course()
    monkeypatch.setattr("app.core.config.settings.RETRIEVAL_PRESET", "no_expansion")
    context, sources = await retrieve_context("priority queue shortest path", COURSE, top_k=2)
    assert context.startswith("[Source 1]:")
    for key in ("doc_id", "filename", "relevance_score", "reranked_score", "chunk_index", "location", "snippet", "support"):
        assert key in sources[0]


def test_location_labels():
    assert location_label({"page_start": 4, "page_end": 4}) == "p. 4"
    assert location_label({"page_start": 4, "page_end": 6}) == "pp. 4-6"
    assert location_label({"slide_start": 3, "slide_end": 3}) == "slide 3"
    assert location_label({"t_start": 724.2, "t_end": 771}) == "12:04-12:51"
    assert location_label({"t_start": 3725, "t_end": 3730}) == "1:02:05-1:02:10"
