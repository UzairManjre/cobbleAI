import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from app.worker import process_document

@patch('app.worker.connect_to_mongo', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.update_status', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.get_by_id', new_callable=AsyncMock)
@patch('app.worker.get_s3_client')
@patch('app.worker.extract_text')
@patch('app.worker.split_into_chunks')
@patch('app.worker.embed_and_store')
def test_process_document_success(mock_embed, mock_split, mock_extract, mock_s3, mock_get_by_id, mock_update_status, mock_connect):
    doc_id = uuid.uuid4()
    mock_doc = MagicMock()
    mock_doc.s3_path = "path/to/file.pdf"
    mock_doc.file_type = "pdf"
    mock_doc.course_id = "course123"
    mock_doc.filename = "file.pdf"
    mock_get_by_id.return_value = mock_doc
    
    mock_s3_instance = MagicMock()
    mock_s3_instance.get_object.return_value = {"Body": MagicMock(read=lambda: b"file data")}
    mock_s3.return_value = mock_s3_instance
    
    mock_extract.return_value = "extracted text"
    mock_split.return_value = ["chunk1", "chunk2"]
    mock_embed.return_value = 2  # Pushed 2 chunks
    
    # run process_document (which is a celery task, so we call it directly)
    result = process_document(str(doc_id))
    
    assert result is True
    mock_extract.assert_called_once_with("pdf", b"file data")
    mock_embed.assert_called_once_with(["chunk1", "chunk2"], "course123", str(doc_id), "file.pdf")
    mock_update_status.assert_any_call(doc_id, "ready", chunks=2)

@patch('app.worker.connect_to_mongo', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.update_status', new_callable=AsyncMock)
@patch('app.worker.DocumentRepository.get_by_id', new_callable=AsyncMock)
@patch('app.worker.get_s3_client')
@patch('app.worker.extract_text')
@patch('app.worker.split_into_chunks')
@patch('app.worker.embed_and_store')
def test_process_document_zero_chunks_failure(mock_embed, mock_split, mock_extract, mock_s3, mock_get_by_id, mock_update_status, mock_connect):
    doc_id = uuid.uuid4()
    mock_doc = MagicMock()
    mock_doc.s3_path = "path/to/file.pdf"
    mock_doc.file_type = "pdf"
    mock_doc.course_id = "course123"
    mock_doc.filename = "file.pdf"
    mock_get_by_id.return_value = mock_doc
    
    mock_s3_instance = MagicMock()
    mock_s3_instance.get_object.return_value = {"Body": MagicMock(read=lambda: b"file data")}
    mock_s3.return_value = mock_s3_instance
    
    mock_extract.return_value = "extracted text"
    mock_split.return_value = []
    mock_embed.return_value = 0  # 0 chunks
    
    with patch('app.worker.process_document.retry') as mock_retry:
        mock_retry.side_effect = Exception("Celery Retry Triggered")
        with pytest.raises(Exception, match="Celery Retry Triggered"):
            process_document(str(doc_id))
            
    # Check that status was updated to failed
    mock_update_status.assert_any_call(doc_id, "failed", error="No chunks were successfully pushed to Qdrant. Document is empty or embedding failed.")

