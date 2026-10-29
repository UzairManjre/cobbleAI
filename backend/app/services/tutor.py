from app.services.llm import LLMAdapter
from app.core.config import settings
from app.services.rag import retrieve_with_details
from app.services.retrieval.config import default_config
from app.services.retrieval.hybrid import RetrievalResult, chunk_to_source, format_context
from typing import List, Dict, Optional
import uuid
import traceback
import time

TUTOR_SYSTEM_PROMPT = """You are a Socratic tutor helping a student understand concepts from their course materials.

Context you have:
- Current concept: {node_label} - {node_description}
- Connected concepts: {neighbors}
- Course materials: {course_context}

Rules:
1. Answer based PRIMARILY on the provided course materials
2. Be concise but thorough (2-4 sentences for initial answers, more if summarizing)
3. If the topic is not in the course materials, say: "This isn't covered in your course materials, but here's what I know..."
4. Reference specific documents when possible using: "According to [Document Name]..."
1. When introducing a topic, clearly explain how it fits into the broader course context and how it relates to connected concepts.
2. Reference connected concepts to help the student see relationships.
3. Use specific evidence from the provided course materials to back up your explanations.

Course Material Sources:
{source_list}
"""

PROMPT_VERSION = "v1-tutor"


class TutorService:
    def __init__(self):
        self.adapter = LLMAdapter()
        self.model = settings.LLM_MODEL
        self.last_retrieval: Optional[RetrievalResult] = None

    async def _track_rag(self, course_id: str, question: str, result: RetrievalResult, sources: list):
        """Fire-and-forget RAG tracking with the measured stage latencies."""
        try:
            from app.services.analytics import analytics_service
            timings = result.timings_ms
            await analytics_service.track_rag_query(
                course_id=uuid.UUID(course_id),
                query_text=question,
                retrieved_count=result.candidates_considered,
                embedding_latency_ms=timings.get("embedding", 0),
                qdrant_search_latency_ms=timings.get("search", 0),
                reranker_latency_ms=timings.get("rerank", 0),
                total_retrieval_latency_ms=timings.get("total", 0),
                rerank_applied=any(c.rerank_logit is not None for c in result.chunks),
                final_context_count=len(sources),
                source_doc_ids=[s.get("doc_id", "") for s in sources],
                source_relevance_scores=[s.get("relevance_score", 0) for s in sources],
                avg_relevance_score=sum(s.get("relevance_score", 0) for s in sources) / max(len(sources), 1),
            )
        except Exception as e:
            import logging
            logging.error(f"Analytics tracking failed: {e}")

    async def get_context_and_stream(
        self,
        node: Dict,
        neighbors: List[Dict],
        question: str,
        chat_history: List[Dict],
        course_id: str = None,
    ):
        """Get RAG context and return (sources, async_generator) for streaming.
        The full retrieval result (all signals, timings, config) is kept on self.last_retrieval."""
        course_context = "No specific course material context available."
        sources = []
        source_list_text = "None available"

        if course_id:
            try:
                result = await retrieve_with_details(question, course_id, default_config())
                self.last_retrieval = result
                sources = [chunk_to_source(c) for c in result.chunks]
                course_context = format_context(result.chunks, numbered=False) or "No course material matched this question."
                print(f"  Retrieved {len(sources)} sources")

                import asyncio
                from app.utils.telemetry import _pending_tasks
                task = asyncio.create_task(self._track_rag(course_id, question, result, sources))
                _pending_tasks.add(task)
                task.add_done_callback(_pending_tasks.discard)

                if sources:
                    source_list_text = "\n".join([
                        f"- {s.get('filename', 'Document')}"
                        + (f" ({s['location']})" if s.get("location") else "")
                        + f" (Relevance: {s['relevance_score']:.2f})"
                        for s in sources
                    ])
            except Exception as e:
                print(f"  RAG retrieval failed: {e}")
                print(traceback.format_exc())
                course_context = "Course materials could not be searched for this question."

        neighbor_text = ", ".join([
            f"{n['label']} ({n['relation']})" for n in neighbors
        ]) if neighbors else "None"

        system_prompt = TUTOR_SYSTEM_PROMPT.format(
            node_label=node.get("label", "Unknown"),
            node_description=node.get("description", ""),
            neighbors=neighbor_text,
            course_context=course_context,
            source_list=source_list_text
        )

        stream_gen = self.adapter.generate_response(
            system=system_prompt,
            messages=[*chat_history, {"role": "user", "content": question}],
            max_tokens=2048,
            stream=True
        )
        return sources, stream_gen
