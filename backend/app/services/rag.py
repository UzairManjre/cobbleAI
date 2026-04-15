from qdrant_client.models import Filter, FieldCondition, MatchValue
from app.core.qdrant import qdrant_sync
from app.services.reranker import reranker_client
from sentence_transformers import SentenceTransformer
import uuid

embedder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

def retrieve_context(query: str, course_id: str, top_k: int = 5, use_rerank: bool = True) -> tuple[str, list[dict]]:
    """
    Retrieve relevant context from Qdrant for a given query and course.
    Returns: (formatted_context_string, list_of_sources)
    """
    collection_name = f"course_{course_id}"
    
    try:
        # Encode query
        query_embedding = embedder.encode(query).tolist()
        
        # Search Qdrant
        search_results = qdrant_sync.query_points(
            collection_name=collection_name,
            query=query_embedding,
            limit=top_k * 2 if use_rerank else top_k  # Get more for reranking
        ).points
        
        if not search_results:
            return "No relevant course material found for this query.", []
        
        # Extract documents and scores
        docs_with_scores = [
            (result.payload.get("text", ""), result.score, result.payload)
            for result in search_results
        ]
        
        # Rerank if enabled
        if use_rerank and len(docs_with_scores) > 1:
            try:
                documents = [doc for doc, _, _ in docs_with_scores]
                rerank_scores = reranker_client.rerank(query, documents)
                
                # Combine original and rerank scores
                reranked = []
                for idx, (doc, orig_score, payload) in enumerate(docs_with_scores):
                    combined_score = orig_score * 0.3 + rerank_scores[idx] * 0.7
                    reranked.append((doc, combined_score, payload))
                
                # Sort by combined score
                reranked.sort(key=lambda x: x[1], reverse=True)
                docs_with_scores = reranked[:top_k]
            except Exception as e:
                print(f"Reranker failed, using original scores: {e}")
                docs_with_scores = docs_with_scores[:top_k]
        
        # Format context
        context_parts = []
        sources = []

        for idx, (doc, score, payload) in enumerate(docs_with_scores, 1):
            doc_id = payload.get("doc_id", "unknown")
            filename = payload.get("filename")
            context_parts.append(f"[Document {idx}]:\n{doc}")
            source_data = {
                "doc_id": doc_id,
                "relevance_score": float(score),
                "chunk_index": idx
            }
            if filename:
                source_data["filename"] = filename
            sources.append(source_data)
        
        formatted_context = "\n\n---\n\n".join(context_parts)
        return formatted_context, sources
        
    except Exception as e:
        print(f"❌ Retrieval failed: {e}")
        import traceback
        print(traceback.format_exc())
        return "Error retrieving course material. Please try again.", []
