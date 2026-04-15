import io
import pdfplumber
from app.core.storage import get_s3_client, S3_BUCKET
from app.models.document import DocumentModel
from typing import List
import uuid

CHUNK_SIZE = 500  # tokens approx
CHUNK_OVERLAP = 50

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes."""
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks by words."""
    words = text.split()
    chunks = []
    
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
    
    return chunks if chunks else [text[:chunk_size]]

def get_course_documents(course_id: uuid.UUID) -> List[DocumentModel]:
    """Get all ready documents for a course."""
    import asyncio
    
    async def _fetch():
        return await DocumentModel.find(
            DocumentModel.course_id == course_id,
            DocumentModel.status == "ready"
        ).to_list()
    
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_fetch())
    finally:
        loop.close()

def download_document_from_s3(s3_path: str) -> bytes:
    """Download a document from S3/MinIO."""
    s3 = get_s3_client()
    response = s3.get_object(Bucket=S3_BUCKET, Key=s3_path)
    return response["Body"].read()

def extract_all_text_from_course(course_id: uuid.UUID) -> List[str]:
    """Extract and chunk text from all ready documents in a course."""
    documents = get_course_documents(course_id)
    all_chunks = []
    
    for doc in documents:
        try:
            file_bytes = download_document_from_s3(doc.s3_path)
            text = extract_text_from_pdf(file_bytes)
            chunks = chunk_text(text)
            all_chunks.extend(chunks)
        except Exception as e:
            print(f"Error processing {doc.filename}: {e}")
            continue
    
    return all_chunks
