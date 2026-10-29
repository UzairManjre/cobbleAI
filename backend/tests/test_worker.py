import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.ingestion.segments import Segment
from app.worker import process_document


def _doc():
    mock_doc = MagicMock()
    mock_doc.s3_path = "path/to/file.pdf"
    mock_doc.file_type = "pdf"
    mock_doc.course_id = "course123"
    mock_doc.filename = "file.pdf"
    return mock_doc


def _s3():
    mock_s3_instance = MagicMock()
    mock_s3_instance.get_object.return_value = {"Body": MagicMock(read=lambda: b"file data")}
    return mock_s3_instance


@patch('app.worker.connect_to_mongo', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.update_status', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.get_by_id', new_callable=AsyncMock)
@patch('app.worker.get_s3_client')
@patch('app.worker.extract_segments')
@patch('app.worker.chunk_segments')
@patch('app.worker.index_chunks')
def test_process_document_success(mock_index, mock_chunk, mock_extract, mock_s3, mock_get_by_id, mock_update_status, mock_connect):
    doc_id = uuid.uuid4()
    mock_get_by_id.return_value = _doc()
    mock_s3.return_value = _s3()

    segments = [Segment(text="extracted text", source_type="pdf_page", page=1)]
    mock_extract.return_value = segments
    mock_chunk.return_value = (["chunk1", "chunk2"], ["summary"])
    mock_index.return_value = 2  # Pushed 2 chunks

    # run process_document (which is a celery task, so we call it directly)
    result = process_document(str(doc_id))

    assert result is True
    mock_extract.assert_called_once_with("pdf", b"file data")
    mock_chunk.assert_called_once_with(segments, str(doc_id))
    mock_index.assert_called_once_with(["chunk1", "chunk2"], "course123", str(doc_id), "file.pdf", summaries=["summary"])
    mock_update_status.assert_any_call(doc_id, "ready", chunks=2)


@patch('app.worker.connect_to_mongo', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.update_status', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.get_by_id', new_callable=AsyncMock)
@patch('app.worker.get_s3_client')
@patch('app.worker.extract_segments')
@patch('app.worker.chunk_segments')
@patch('app.worker.index_chunks')
def test_process_document_zero_chunks_failure(mock_index, mock_chunk, mock_extract, mock_s3, mock_get_by_id, mock_update_status, mock_connect):
    doc_id = uuid.uuid4()
    mock_get_by_id.return_value = _doc()
    mock_s3.return_value = _s3()

    mock_extract.return_value = [Segment(text="extracted text", source_type="pdf_page", page=1)]
    mock_chunk.return_value = ([], [])
    mock_index.return_value = 0  # 0 chunks

    with patch('app.worker.process_document.retry') as mock_retry:
        mock_retry.side_effect = Exception("Celery Retry Triggered")
        with pytest.raises(Exception, match="Celery Retry Triggered"):
            process_document(str(doc_id))

    # Check that status was updated to failed
    mock_update_status.assert_any_call(doc_id, "failed", error="No chunks were successfully pushed to Qdrant. Document is empty or embedding failed.")


@patch('app.worker.connect_to_mongo', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.update_status', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.get_by_id', new_callable=AsyncMock)
@patch('app.worker.get_s3_client')
@patch('app.worker.extract_segments')
def test_process_document_without_text_fails_without_retry(mock_extract, mock_s3, mock_get_by_id, mock_update_status, mock_connect):
    doc_id = uuid.uuid4()
    mock_get_by_id.return_value = _doc()
    mock_s3.return_value = _s3()
    mock_extract.return_value = []  # e.g. a scanned PDF with no text layer

    with patch('app.worker.process_document.retry') as mock_retry:
        assert process_document(str(doc_id)) is False
        mock_retry.assert_not_called()

    failed = [c for c in mock_update_status.call_args_list if c.args[1] == "failed"]
    assert "No extractable text" in failed[0].kwargs["error"]
