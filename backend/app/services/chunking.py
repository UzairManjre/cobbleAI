import nltk
from sentence_transformers import SentenceTransformer
import os
from qdrant_client.models import PointStruct
from app.core.qdrant import qdrant_sync
import uuid

# Download punkt locally silently
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

# We load MiniLM-L6-v2 which maps closely to roughly 1 token per word. 
# For true token cap, we'd use transformers AutoTokenizer.
embedder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

def split_into_chunks(text: str, chunk_size: int = 400, overlap: int = 80, min_chunk: int = 100):
    sentences = nltk.sent_tokenize(text)
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
        
    return chunks

def embed_and_store(chunks: list[str], course_id: str, doc_id: str, filename: str = None):
    # Fix UUID bytes to proper string representation
    if isinstance(course_id, bytes):
        course_id = str(uuid.UUID(bytes=course_id))

    if isinstance(doc_id, bytes):
        doc_id = str(uuid.UUID(bytes=doc_id))

    collection_name = f"course_{course_id}"
    print(f"   Collection: {collection_name}")

    # Ensure collection exists
    try:
        qdrant_sync.get_collection(collection_name)
        print(f"     Collection exists")
    except Exception as e:
        error_str = str(e).lower()
        if "doesn't exist" in error_str or "not found" in error_str:
            print(f"    [EMOJI]  Creating new collection...")
            try:
                qdrant_sync.create_collection(
                    collection_name=collection_name,
                    vectors_config={"size": 384, "distance": "Cosine"}
                )
                print(f"     Collection created")
            except Exception as create_err:
                if "already exists" in str(create_err).lower() or "409" in str(create_err):
                    print(f"     Collection already exists (race condition handled)")
                else:
                    raise
        else:
            raise

    print(f"    [EMOJI]  Encoding {len(chunks)} chunks...")
    embeddings = embedder.encode(chunks)

    points = []
    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        point_id = str(uuid.uuid4())
        payload = {
            "chunk_id": point_id,
            "doc_id": doc_id,
            "course_id": course_id,
            "text": chunk
        }
        if filename:
            payload["filename"] = filename
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding.tolist(),
                payload=payload
            )
        )
    
    print(f"    [EMOJI]  Upserting {len(points)} points to Qdrant...")
    qdrant_sync.upsert(collection_name=collection_name, points=points)
    print(f"     Upserted {len(points)} points")
    return len(points)
