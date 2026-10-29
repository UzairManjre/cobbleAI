import pytest
from unittest.mock import patch, MagicMock
from app.services.chunking import split_into_chunks, embed_and_store, chunk_segments, index_chunks
from app.services.ingestion.segments import Segment

def test_split_into_chunks_basic():
    text = "This is sentence one. This is sentence two. This is sentence three."
    chunks = split_into_chunks(text, chunk_size=10, min_chunk=0)
    assert len(chunks) > 0
    assert "sentence one" in chunks[0]

def test_split_into_chunks_logic():
    text = " ".join([f"Sentence {i}." for i in range(10)])
    chunks = split_into_chunks(text, chunk_size=10, overlap=2, min_chunk=0)
    assert len(chunks) >= 2
    assert "Sentence 0." in chunks[0]

def test_split_into_chunks_keeps_short_document():
    # A document shorter than min_chunk used to produce zero chunks (and fail ingestion)
    assert split_into_chunks("A short note about recursion.") == ["A short note about recursion."]


@patch('app.services.chunking.qdrant_sync')
@patch('app.services.chunking.embedder')
def test_embed_and_store_success(mock_embedder, mock_qdrant):
    mock_emb = MagicMock()
    mock_emb.tolist.return_value = [0.1, 0.2]
    mock_embedder.encode.return_value = [mock_emb, mock_emb]
    mock_qdrant.collection_exists.return_value = True

    chunks = ["chunk1", "chunk2"]
    count = embed_and_store(chunks, course_id="1234", doc_id="5678", filename="test.pdf")

    assert count == 2
    mock_embedder.encode.assert_called_once_with(chunks)
    mock_qdrant.upsert.assert_called_once()

    # Check payload structure
    args, kwargs = mock_qdrant.upsert.call_args
    assert kwargs['collection_name'] == "course_1234_v2"
    points = kwargs['points']
    assert len(points) == 2
    assert points[0].payload['filename'] == "test.pdf"
    assert points[0].payload['course_id'] == "1234"
    assert points[0].payload['doc_id'] == "5678"
    assert set(points[0].vector) == {"dense", "bm25"}


@patch('app.services.chunking.qdrant_sync')
@patch('app.services.chunking.embedder')
def test_embed_and_store_creates_collection(mock_embedder, mock_qdrant):
    mock_emb = MagicMock()
    mock_emb.tolist.return_value = [0.1, 0.2]
    mock_embedder.encode.return_value = [mock_emb]

    # Simulate collection doesn't exist
    mock_qdrant.collection_exists.return_value = False

    chunks = ["chunk1"]
    embed_and_store(chunks, course_id="1234", doc_id="5678")

    mock_qdrant.create_collection.assert_called_once()
    args, kwargs = mock_qdrant.create_collection.call_args
    assert kwargs['collection_name'] == "course_1234_v2"
    assert "dense" in kwargs['vectors_config']
    assert "bm25" in kwargs['sparse_vectors_config']


#   Located chunks

def _pages(*texts):
    return [Segment(text=t, source_type="pdf_page", page=i + 1, section_title=f"Page {i + 1}") for i, t in enumerate(texts)]


def test_chunk_segments_tracks_page_spans_and_sections():
    long_page = " ".join(f"Sorting fact number {i} is stated here." for i in range(70))  # ~490 words
    segments = _pages("Intro to sorting. " * 30, "Merge sort splits lists. " * 30, long_page)
    chunks, summaries = chunk_segments(segments, doc_id="d1", chunk_size=400, overlap=40)

    # Short pages are never merged, so a citation or graph quote names its own page
    assert [(c.page_start, c.page_end) for c in chunks[:2]] == [(1, 1), (2, 2)]
    assert all(c.page_start == 3 and c.page_end == 3 for c in chunks[2:])  # the long page was split
    assert len(chunks) >= 4
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    assert {c.chapter_id for c in chunks} == {"d1:sec0"}
    assert summaries[0].chapter_id == "d1:sec0" and summaries[0].page_start == 1 and summaries[0].page_end == 3


def test_chunk_segments_keeps_one_chunk_per_slide():
    slides = [Segment(text=f"Slide {i} about heaps", source_type="slide", slide=i, section_title=f"Heaps {i}") for i in range(1, 8)]
    chunks, summaries = chunk_segments(slides, doc_id="d2")
    assert [(c.slide_start, c.slide_end) for c in chunks] == [(i, i) for i in range(1, 8)]
    # Slides are grouped five per section
    assert chunks[0].chapter_id == "d2:sec0" and chunks[5].chapter_id == "d2:sec1"
    assert len(summaries) == 2


def test_chunk_segments_respects_given_lecture_chapters():
    segs = [
        Segment(text="Today we cover recursion.", source_type="transcript", t_start=0.0, t_end=30.0, extra={"chapter_id": "lec:ch0"}),
        Segment(text="Base cases stop recursion.", source_type="transcript", t_start=30.0, t_end=61.5, extra={"chapter_id": "lec:ch1"}),
    ]
    chunks, summaries = chunk_segments(segs, doc_id="lec")
    assert [(c.t_start, c.t_end, c.chapter_id) for c in chunks] == [(0.0, 30.0, "lec:ch0"), (30.0, 61.5, "lec:ch1")]
    assert summaries == []  # lecture chapter summaries come from the lecture pipeline


def test_index_chunks_is_idempotent(qdrant_memory):
    segments = _pages("Quicksort picks a pivot and partitions the array around it. " * 5)
    chunks, summaries = chunk_segments(segments, doc_id="doc-a")
    assert index_chunks(chunks, "c1", "doc-a", "algos.pdf", summaries=summaries) == 1
    assert index_chunks(chunks, "c1", "doc-a", "algos.pdf", summaries=summaries) == 1

    points, _ = qdrant_memory.scroll("course_c1_v2", with_payload=True, limit=50)
    kinds = sorted(p.payload["source_type"] for p in points)
    assert kinds == ["chapter_summary", "pdf_page"]  # re-indexing replaced, not duplicated
    content = next(p for p in points if p.payload["source_type"] == "pdf_page")
    assert content.payload["page_start"] == 1 and content.payload["filename"] == "algos.pdf"
    assert content.payload["chapter_id"] == "doc-a:sec0"


async def test_first_v2_upload_queues_v1_only_documents_for_reindex(qdrant_memory, monkeypatch):
    # Retrieval prefers _v2 once it exists, so v1-only documents must be re-indexed, not hidden
    import uuid
    from qdrant_client import models
    from app.models.document import DocumentModel
    import app.worker as worker
    course_id = uuid.uuid4()
    old = DocumentModel(course_id=course_id, filename="old.pdf", s3_path="x/old.pdf", status="ready")
    new = DocumentModel(course_id=course_id, filename="new.pdf", s3_path="x/new.pdf", status="ready")
    await old.insert()
    await new.insert()
    qdrant_memory.create_collection(f"course_{course_id}", vectors_config=models.VectorParams(size=4, distance=models.Distance.COSINE))
    index_chunks(chunk_segments(_pages("Fresh 2.0 notes. " * 5), doc_id=str(new.id))[0], str(course_id), str(new.id), "new.pdf")
    queued = []
    monkeypatch.setattr(worker.process_document, "delay", lambda doc_id: queued.append(doc_id))

    assert await worker.reindex_legacy_documents(str(course_id), str(new.id)) == 1
    assert queued == [str(old.id)] and (await DocumentModel.get(old.id)).status == "pending"
    assert await worker.reindex_legacy_documents(str(course_id), str(new.id)) == 0  # not queued twice
