import pytest
from unittest.mock import patch, MagicMock
from app.services.chunking import split_into_chunks, embed_and_store

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

@patch('app.services.chunking.qdrant_sync')
@patch('app.services.chunking.embedder')
def test_embed_and_store_success(mock_embedder, mock_qdrant):
    mock_emb = MagicMock()
    mock_emb.tolist.return_value = [0.1, 0.2]
    mock_embedder.encode.return_value = [mock_emb, mock_emb]
    
    # Mock qdrant collection check to succeed (doesn't raise exception)
    mock_qdrant.get_collection.return_value = True
    
    chunks = ["chunk1", "chunk2"]
    count = embed_and_store(chunks, course_id="1234", doc_id="5678", filename="test.pdf")
    
    assert count == 2
    mock_embedder.encode.assert_called_once_with(chunks)
    mock_qdrant.upsert.assert_called_once()
    
    # Check payload structure
    args, kwargs = mock_qdrant.upsert.call_args
    points = kwargs['points']
    assert len(points) == 2
    assert points[0].payload['filename'] == "test.pdf"
    assert points[0].payload['course_id'] == "1234"
    assert points[0].payload['doc_id'] == "5678"

@patch('app.services.chunking.qdrant_sync')
@patch('app.services.chunking.embedder')
def test_embed_and_store_creates_collection(mock_embedder, mock_qdrant):
    mock_emb = MagicMock()
    mock_emb.tolist.return_value = [0.1, 0.2]
    mock_embedder.encode.return_value = [mock_emb]
    
    # Simulate collection doesn't exist
    mock_qdrant.get_collection.side_effect = Exception("not found")
    
    chunks = ["chunk1"]
    embed_and_store(chunks, course_id="1234", doc_id="5678")
    
    mock_qdrant.create_collection.assert_called_once()
    args, kwargs = mock_qdrant.create_collection.call_args
    assert kwargs['collection_name'] == "course_1234"
