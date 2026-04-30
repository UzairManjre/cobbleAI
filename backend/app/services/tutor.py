from app.services.llm import LLMAdapter
from app.core.config import settings
from app.services.rag import retrieve_context
from typing import List, Dict
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


class TutorService:
    def __init__(self):
        self.adapter = LLMAdapter()
        self.model = settings.LLM_MODEL
        print(f"Tutor Service Config: URL={self.adapter.base_url}, Model={self.model}")

    async def _track_rag(self, course_id: str, question: str, sources: list, retrieval_time_ms: int):
        """Fire-and-forget RAG tracking."""
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_rag_query(
                course_id=uuid.UUID(course_id),
                query_text=question,
                retrieved_count=len(sources),
                total_retrieval_latency_ms=retrieval_time_ms,
                rerank_applied=True,
                final_context_count=len(sources),
                source_doc_ids=[s.get("doc_id", "") for s in sources],
                source_relevance_scores=[s.get("relevance_score", 0) for s in sources],
                avg_relevance_score=sum(s.get("relevance_score", 0) for s in sources) / max(len(sources), 1),
                led_to_successful_answer=True,
            )
        except Exception:
            pass

    async def _track_llm(self, user_id, session_id, question, answer, latency_ms, sources):
        """Fire-and-forget LLM tracking."""
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_llm_usage(
                user_id=user_id,
                session_id=session_id,
                endpoint="/sessions/{id}/ask",
                model=self.model,
                prompt_text=question,
                latency_ms=latency_ms,
                response_length_chars=len(answer),
                estimated_input_tokens=len(question.split()),
                estimated_output_tokens=len(answer.split()),
                rag_retrieved_count=len(sources),
                rag_success=len(sources) > 0,
            )
        except Exception:
            pass

    async def answer_question(
        self,
        node: Dict,
        neighbors: List[Dict],
        question: str,
        chat_history: List[Dict],
        course_id: str = None,
        user_id: uuid.UUID = None,
        session_id: uuid.UUID = None,
    ) -> Dict:
        """Get an answer from the LLM tutor for a question about a node, with RAG support.

        Returns: {
            "answer": str,
            "sources": List[Dict]
        }
        """

        # Retrieve relevant course material if course_id is provided
        course_context = "No specific course material context available."
        sources = []
        source_list_text = "None available"

        if course_id:
            try:
                rag_start = time.time()
                print(f"  Tutor retrieving context for: '{question}' in course {course_id}")
                course_context, sources = await retrieve_context(question, course_id, top_k=5, use_rerank=True)
                retrieval_time_ms = int((time.time() - rag_start) * 1000)
                print(f"  Retrieved {len(sources)} sources")

                # Track RAG performance
                import asyncio
                asyncio.create_task(self._track_rag(course_id, question, sources, retrieval_time_ms))

                if sources:
                    source_list_text = "\n".join([
                        f"- {s.get('filename', 'Document')} (Relevance: {s['relevance_score']:.2f})"
                        for s in sources
                    ])
            except Exception as e:
                print(f"  RAG retrieval failed: {e}")
                print(traceback.format_exc())
                course_context = f"Error retrieving course materials: {str(e)}"

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

        try:
            print(f"  Sending request to LLM (Model: {self.model})...")
            llm_start = time.time()
            answer = await self.adapter.generate_full_response(
                system=system_prompt,
                messages=[*chat_history, {"role": "user", "content": question}],
                max_tokens=2048
            )
            latency_ms = int((time.time() - llm_start) * 1000)

            # Track LLM usage
            import asyncio
            asyncio.create_task(self._track_llm(user_id, session_id, question, answer, latency_ms, sources))

            return {
                "answer": answer,
                "sources": sources
            }

        except Exception as e:
            print(f"  LLM call failed: {e}")
            print(traceback.format_exc())
            return {
                "answer": f"I'm sorry, I encountered an error processing your question. Error: {str(e)}",
                "sources": sources
            }

    async def get_context_and_stream(
        self,
        node: Dict,
        neighbors: List[Dict],
        question: str,
        chat_history: List[Dict],
        course_id: str = None,
    ):
        """Get RAG context and return (sources, async_generator) for streaming."""
        course_context = "No specific course material context available."
        sources = []
        source_list_text = "None available"

        if course_id:
            try:
                rag_start = time.time()
                print(f"  Tutor retrieving context for: '{question}' in course {course_id}")
                course_context, sources = await retrieve_context(question, course_id, top_k=5, use_rerank=True)
                retrieval_time_ms = int((time.time() - rag_start) * 1000)
                print(f"  Retrieved {len(sources)} sources")

                import asyncio
                asyncio.create_task(self._track_rag(course_id, question, sources, retrieval_time_ms))

                if sources:
                    source_list_text = "\n".join([
                        f"- {s.get('filename', 'Document')} (Relevance: {s['relevance_score']:.2f})"
                        for s in sources
                    ])
            except Exception as e:
                print(f"  RAG retrieval failed: {e}")
                print(traceback.format_exc())
                course_context = f"Error retrieving course materials: {str(e)}"

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
