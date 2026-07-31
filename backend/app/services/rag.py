from qdrant_client.models import Filter, FieldCondition, MatchValue, QueryRequest
from app.core.qdrant import qdrant_async
from app.services.reranker import reranker_client
from app.services.llm import LLMAdapter
from sentence_transformers import SentenceTransformer
import uuid
import json
import asyncio

embedder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
llm_adapter = LLMAdapter()

EXPANSION_PROMPT = """You are an AI specialized in Retrieval Augmented Generation (RAG).
Given a user's query, generate 3 search queries that cover different aspects of the request.
These queries will be used to search a vector database.
Keep them short, distinct, and focused on core concepts.
Return ONLY a JSON list of 3 strings.

Query: {query}
"""

async def retrieve_context(query: str, course_id: str, top_k: int = 5, use_rerank: bool = True) -> tuple[str, list[dict]]:
    """
    Retrieve relevant context using Multi-Query Expansion and Reranking.
    1. Expand query into 3 variations.
    2. Batch-encode all vectors in one executor call (CPU-bound).
    3. Submit all queries in a single query_batch_points request (one HTTP round-trip).
    4. Aggregate, deduplicate, then Rerank.
    """
    collection_name = f"course_{course_id}"

    try:
        # 1. Query Expansion (Better RAG)
        queries = [query]
        try:
            expansion_resp = await llm_adapter.generate_full_response(
                system=EXPANSION_PROMPT.format(query=query),
                messages=[{"role": "user", "content": "Generate queries."}],
                max_tokens=1024
            )
            cleaned_resp = expansion_resp
            if "</thought>" in cleaned_resp:
                cleaned_resp = cleaned_resp.split("</thought>")[-1]

            if "[" in cleaned_resp and "]" in cleaned_resp:
                json_part = cleaned_resp[cleaned_resp.find("["):cleaned_resp.rfind("]") + 1]
                expanded_list = json.loads(json_part)
                if isinstance(expanded_list, list):
                    queries.extend(expanded_list[:3])
                    print(f"  Query expanded to: {queries}")
        except Exception as expansion_err:
            print(f"  Query expansion skipped: {expansion_err}")

        # 2. Batch-encode all query vectors in a single executor call (one thread, all queries)
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None, lambda: embedder.encode(queries).tolist()
        )

        # 3. Single query_batch_points request — one TCP round-trip for all vectors
        batch_requests = [
            QueryRequest(
                query=emb,
                limit=top_k * 2,
            )
            for emb in embeddings
        ]

        batch_responses = await qdrant_async.query_batch_points(
            collection_name=collection_name,
            requests=batch_requests,
        )

        # 4. Aggregate and deduplicate
        all_results = []
        seen_ids: set = set()
        for response in batch_responses:
            for result in response.points:
                if result.id not in seen_ids:
                    all_results.append(result)
                    seen_ids.add(result.id)

        if not all_results:
            return "No relevant course material found.", []

        # 5. Preparation for Reranking
        docs_with_metadata = [
            (res.payload.get("text", ""), res.score, res.payload, res.score)
            for res in all_results
        ]

        # 6. Reranking (Cross-Encoder)
        if use_rerank and len(docs_with_metadata) > 1:
            try:
                documents = [doc for doc, _, _, _ in docs_with_metadata]
                rerank_scores = await loop.run_in_executor(
                    None, lambda: reranker_client.rerank(query, documents)
                )

                reranked = []
                for idx, (doc, orig_score, payload, cos_score) in enumerate(docs_with_metadata):
                    combined_score = orig_score * 0.2 + rerank_scores[idx] * 0.8
                    reranked.append((doc, combined_score, payload, cos_score))

                reranked.sort(key=lambda x: x[1], reverse=True)
                docs_with_metadata = reranked[:top_k]
            except Exception as e:
                print(f"  Reranker error: {e}")
                docs_with_metadata = docs_with_metadata[:top_k]
        else:
            docs_with_metadata = docs_with_metadata[:top_k]

        # 7. Formulate Result
        context_parts = []
        sources = []
        for idx, (doc, score, payload, cos_score) in enumerate(docs_with_metadata, 1):
            doc_id = payload.get("doc_id", "unknown")
            filename = payload.get("filename")
            context_parts.append(f"[Source {idx}]:\n{doc}")
            sources.append({
                "doc_id": doc_id,
                "filename": filename or "Unknown",
                "relevance_score": float(cos_score),
                "reranked_score": float(score),
                "chunk_index": idx
            })

        return "\n\n---\n\n".join(context_parts), sources

    except Exception as e:
        print(f"  RAG Error: {e}")
        import traceback
        print(traceback.format_exc())
        return "Error in retrieval system.", []
