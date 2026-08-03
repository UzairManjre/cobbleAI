import asyncio
import json
import numpy as np
from qdrant_client import QdrantClient
from app.core.qdrant import qdrant_sync as client
from app.services.rag import retrieve_context
from app.services.llm import LLMAdapter
from app.core.config import settings

COURSE_ID = "6633d708-33d7-45b0-983e-6ffb4037e178"
QDRANT_COLLECTION = f"course_{COURSE_ID}"

async def run_benchmark():
    llm = LLMAdapter()
    
    print("Fetching random chunks from Qdrant...")
    scroll_res = client.scroll(
        collection_name=QDRANT_COLLECTION,
        limit=10,  # 10 test samples for speed
        with_payload=True
    )
    
    chunks = scroll_res[0]
    if not chunks:
        print("No chunks found in Qdrant!")
        return
        
    print(f"Found {len(chunks)} chunks. Generating questions...")
    
    test_cases = []
    for chunk in chunks:
        text = chunk.payload.get("text", "")
        if len(text) < 100: continue
        
        # Use LLM to generate a question for this chunk
        prompt = f"Given the following text, write a single specific question that can ONLY be answered by this text. Return ONLY the question string.\n\nText: {text[:1000]}"
        
        q = await llm.generate_full_response(
            system="You are an expert question generator.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024
        )
        
        # Clean up tags
        import re
        q = re.sub(r"<thought>.*?</thought>", "", q, flags=re.DOTALL).strip()
        if "\n" in q:
            q = q.split("\n")[-1].strip()
            
        test_cases.append({
            "question": q,
            "ground_truth_id": chunk.id,
            "text": text
        })
        print(f"Generated Question: {q}")
        
    print(f"\nRunning retrieval for {len(test_cases)} questions...")
    
    # Metrics
    total_queries = len(test_cases)
    hits_at_5 = 0
    
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
    
    # F1-score proxy (for RAG chunk retrieval, we usually measure precision/recall of chunks, but since there's 1 relevant chunk, Recall@5 is either 1 or 0 per query, and Precision@5 is 1/5 or 0/5. F1 is harmonic mean).
    for case in test_cases:
        print(f"Querying: {case['question']}")
        
        # Simple sync search
        hits = client.query_points(
            collection_name=QDRANT_COLLECTION,
            query=embedder.encode(case['question']).tolist(),
            limit=5
        ).points
        
        retrieved_ids = [str(hit.id) for hit in hits]
        ground_truth = str(case['ground_truth_id'])
        
        if ground_truth in retrieved_ids:
            hits_at_5 += 1
            print(" -> HIT")
        else:
            print(" -> MISS")
            
    recall_at_5 = hits_at_5 / total_queries
    # Precision@5 is technically (hits_at_5 / (total_queries * 5)) since there's only 1 ground truth per query.
    # But normally Precision@k in RAG is calculated based on how many of the k are relevant.
    precision_at_5 = hits_at_5 / (total_queries * 5)
    
    if (precision_at_5 + recall_at_5) > 0:
        f1_score = 2 * (precision_at_5 * recall_at_5) / (precision_at_5 + recall_at_5)
    else:
        f1_score = 0.0
        
    print("\n=== OFFLINE RAG BENCHMARK RESULTS ===")
    print(f"Total Queries: {total_queries}")
    print(f"Recall@5:     {recall_at_5:.4f}  (Percentage of queries where the relevant chunk was in Top-5)")
    print(f"Precision@5:  {precision_at_5:.4f}  (Percentage of retrieved chunks that were relevant)")
    print(f"F1-Score:     {f1_score:.4f}")
    
if __name__ == "__main__":
    asyncio.run(run_benchmark())
