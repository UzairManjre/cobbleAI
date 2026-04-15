from app.services.llm import LLMAdapter
from app.core.config import settings
from typing import List, Dict, Any
import json
import time
import httpx
from datetime import datetime

STUDY_PLAN_GENERATION_PROMPT = """Return JSON with topic order only.

Course: {course_title}
{graph_structure}

JSON:
{{"topics":[
{{"node_id":"ID_FROM_GRAPH","order":1,"prerequisites":["other_ids"]}},
{{"node_id":"ID","order":2,"prerequisites":[]}}
]}}

CRITICAL RULES:
1. Each node_id MUST appear EXACTLY ONCE in the topics array
2. Order topics logically based on dependencies
3. Use real node_ids from the graph (listed above)
4. Return ONLY valid JSON with no markdown code blocks or extra text
5. Double-check that there are NO duplicate node_ids

Return ONLY JSON.
"""

TOPIC_STUDY_PLAN_PROMPT = """You are an expert educational planner creating a deep-dive study plan for a SPECIFIC TOPIC.

## INPUT DATA

### Topic Information
- Topic Name: {topic_label}
- Topic Description: {topic_description}
- Course: {course_title}

### Connected Topics (from knowledge graph)
{connected_topics}

### Related Course Documents
{document_list}

## YOUR TASK

Create a comprehensive, step-by-step study plan for mastering this specific topic.

## OUTPUT FORMAT (JSON ONLY)

```json
{{
  "title": "Deep Dive: {topic_label}",
  "description": "Brief overview (1-2 sentences)",
  "estimated_time_minutes": 60,
  "learning_path": [
    {{
      "step": 1,
      "type": "concept_overview",
      "title": "Understand the Basics",
      "content": "Detailed explanation of what this topic is, why it matters, and core definitions",
      "estimated_minutes": 15
    }},
    {{
      "step": 2,
      "type": "guided_reading",
      "title": "Read Related Materials",
      "content": "Specific sections from documents to study",
      "estimated_minutes": 20,
      "document_references": ["filename.pdf"]
    }},
    {{
      "step": 3,
      "type": "practical_example",
      "title": "Work Through an Example",
      "content": "Step-by-step example with explanation",
      "estimated_minutes": 25
    }},
    {{
      "step": 4,
      "type": "connections",
      "title": "Explore Related Topics",
      "content": "How this connects to other concepts",
      "estimated_minutes": 10
    }}
  ],
  "exercises": [
    {{
      "type": "practice",
      "title": "Exercise Title",
      "description": "Detailed instructions",
      "difficulty": "medium",
      "estimated_time_minutes": 20,
      "hints": ["Hint 1"],
      "solution": "Solution or example"
    }}
  ],
  "self_check_questions": [
    {{
      "question": "Can you explain X in your own words?",
      "answer": "Expected answer",
      "explanation": "Why this matters"
    }}
  ]
}}
```

## LEARNING PATH STEP TYPES
- **concept_overview**: Introduction and core concepts
- **guided_reading**: Point to specific document sections
- **practical_example**: Walk through a concrete example
- **hands_on_practice**: Student does something themselves
- **connections**: Relate to other topics in the graph
- **review**: Summary and key takeaways

## RULES
1. Be specific and actionable
2. Reference actual course documents
3. Include at least 3 exercises
4. Include at least 3 self-check questions
5. Order steps logically (basics → practice → connections)
6. Return ONLY valid JSON
"""

class StudyPlanGenerator:
    def __init__(self):
        self.adapter = LLMAdapter(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL
        )
    
    async def generate_plan(
        self,
        course_title: str,
        course_description: str,
        graph_nodes: List[Dict],
        graph_edges: List[Dict],
        document_filenames: List[str] = None
    ) -> Dict[str, Any]:
        """Generate a study plan from knowledge graph data."""

        start_time = time.time()

        # Verify Ollama is running
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{settings.LLM_BASE_URL}/api/tags")
                if resp.status_code != 200:
                    raise Exception(f"Ollama not running at {settings.LLM_BASE_URL}")
        except Exception as e:
            raise Exception(f"Cannot connect to Ollama: {str(e)}. Make sure 'ollama serve' is running.")

        # Build graph structure description
        graph_structure = self._format_graph_structure(graph_nodes, graph_edges)

        # Build document list
        doc_list = ", ".join(document_filenames[:5]) if document_filenames else "None"

        # Create prompt
        prompt = STUDY_PLAN_GENERATION_PROMPT.format(
            course_title=course_title,
            topic_count=len(graph_nodes),
            graph_structure=graph_structure,
            document_list=doc_list
        )
        
        print(f"📋 Generating study plan for {course_title}...")

        try:
            response = await self.adapter.generate_full_response(
                system="Return only valid JSON. No extra text.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4096
            )

            latency_ms = int((time.time() - start_time) * 1000)
            print(f"✅ Study plan generated in {latency_ms}ms")

            # Save raw LLM response for analysis
            import os
            output_dir = os.path.join(os.path.dirname(__file__), "..", "..", "llm_outputs")
            os.makedirs(output_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = os.path.join(output_dir, f"study_plan_{timestamp}.txt")
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"=== RAW LLM RESPONSE ===\n")
                f.write(f"Length: {len(response)} chars\n")
                f.write(f"Model: {settings.LLM_MODEL}\n")
                f.write(f"Prompt length: {len(prompt)} chars\n")
                f.write(f"\n{'='*80}\n\n")
                f.write(response)
            print(f"💾 Saved raw LLM response to: {filepath}")

            plan_data = self._extract_json(response)
            if not plan_data:
                raise ValueError("LLM did not return valid JSON")

            # Build full plan from LLM ordering + backend-generated content
            return self._build_full_plan(plan_data, graph_nodes, graph_edges, course_title, document_filenames)

        except Exception as e:
            print(f"⚠️  LLM generation failed, using fallback: {e}")
            return self._generate_fallback_plan(graph_nodes, graph_edges, course_title)

    def _build_full_plan(self, llm_data: Dict, graph_nodes: List[Dict], graph_edges: List[Dict], course_title: str, document_filenames: List[str] = None) -> Dict:
        """Build full study plan from LLM topic ordering + backend-generated exercises."""
        node_map = {n['id']: n for n in graph_nodes}
        edge_map = {}
        for edge in graph_edges:
            to_id = edge.get('to')
            if to_id:
                if to_id not in edge_map:
                    edge_map[to_id] = []
                edge_map[to_id].append(edge.get('from'))

        # Get LLM ordering or use default
        llm_topics = llm_data.get('topics', [])
        ordered_nodes = []
        
        if llm_topics:
            # Sort nodes by LLM order, removing duplicates
            seen_ids = set()
            sorted_topics = sorted(llm_topics, key=lambda x: x.get('order', 999))
            
            for item in sorted_topics:
                nid = item.get('node_id')
                if nid and nid in node_map and nid not in seen_ids:
                    seen_ids.add(nid)
                    ordered_nodes.append((item.get('order', 999), nid, item.get('prerequisites', [])))
        
        # Add any nodes not in LLM output
        llm_ids = {n[1] for n in ordered_nodes}
        for node in graph_nodes:
            if node['id'] not in llm_ids:
                prereqs = edge_map.get(node['id'], [])
                ordered_nodes.append((999 + len(ordered_nodes), node['id'], prereqs))
        
        # Build topics with backend-generated exercises
        topics = []
        for idx, (order, node_id, prereqs) in enumerate(ordered_nodes):
            node = node_map[node_id]
            topics.append({
                "order": idx + 1,
                "node_id": node_id,
                "node_label": node.get('label', 'Unknown'),
                "node_description": node.get('description', ''),
                "estimated_time_minutes": 30,
                "difficulty": "medium",
                "prerequisites": prereqs,
                "learning_objectives": [f"Understand {node.get('label', 'this topic')}"],
                "key_concepts": [node.get('label', 'Key concept')],
                "exercises": [
                    {
                        "type": "quiz",
                        "title": f"Check understanding of {node.get('label', 'topic')}",
                        "description": f"What are the key aspects of {node.get('label', 'this topic')}?",
                        "difficulty": "medium",
                        "estimated_time_minutes": 10,
                        "hints": [],
                        "solution": f"Review the {node.get('label', 'topic')} material and key concepts."
                    }
                ],
                "document_references": document_filenames[:3] if document_filenames else [],
                "notes": ""
            })
        
        return {
            "title": f"Study Plan: {course_title}",
            "description": f"AI-ordered study plan covering {len(topics)} topics",
            "estimated_duration_hours": round(len(topics) * 30 / 60, 1),
            "topics": topics
        }
    
    def _format_graph_structure(self, nodes: List[Dict], edges: List[Dict]) -> str:
        """Format graph data into a compact structure."""
        lines = []
        
        # Compact node list
        for node in nodes:
            desc = node.get('description', '')
            lines.append(f"- {node['id']}|{node['label']}|{desc[:50] if desc else ''}")
        
        # Compact edges
        if edges:
            lines.append("\nRelations:")
            for edge in edges[:20]:  # Limit edges to reduce size
                from_id = edge.get('from', '')
                to_id = edge.get('to', '')
                relation = edge.get('relation', 'related')
                lines.append(f"- {from_id}->{to_id}|{relation}")
        
        return "\n".join(lines)
    
    def _extract_json(self, text: str) -> Dict:
        """Extract JSON from LLM response, handling thought tags and code blocks."""
        print(f"🔍 Raw LLM response length: {len(text)} chars")

        # Remove thought tags first
        import re
        cleaned = re.sub(r'<thought>.*?</thought>', '', text, flags=re.DOTALL)
        cleaned = re.sub(r'<\|end_of_thought\|>', '', cleaned)
        cleaned = cleaned.strip()

        # Remove markdown code fence markers
        cleaned = cleaned.replace('```json', '').replace('```', '').replace('```', '')
        cleaned = cleaned.strip()

        # Now try to find and parse JSON
        # Strategy 1: Find first { and last }
        first_brace = cleaned.find('{')
        last_brace = cleaned.rfind('}')

        if first_brace == -1 or last_brace == -1:
            print(f"⚠️  No JSON braces found")
            return None

        json_str = cleaned[first_brace:last_brace + 1]
        print(f"📝 Extracted JSON: {len(json_str)} chars")

        # Fix missing "node_id": keys produced by small LLMs
        json_str = re.sub(r'\{\s*"node_([a-zA-Z0-9_]+)"\s*,', r'{"node_id":"node_\1",', json_str)

        # Try direct parse
        try:
            result = json.loads(json_str)
            if isinstance(result, dict):
                print(f"✅ Parsed JSON successfully")
                return result
        except json.JSONDecodeError as e:
            print(f"⚠️  Direct parse failed: {e}")

        # Try fixing duplicate keys by keeping only the first occurrence
        try:
            fixed_json = self._fix_duplicate_keys(json_str)
            if fixed_json:
                result = json.loads(fixed_json)
                if isinstance(result, dict):
                    print(f"✅ Parsed JSON after fixing duplicate keys")
                    return result
        except Exception as e:
            print(f"⚠️  Duplicate key fix failed: {e}")

        # Try trimming trailing content after last }
        last_b = json_str.rfind('}')
        if last_b != -1 and last_b < len(json_str) - 1:
            try:
                result = json.loads(json_str[:last_b + 1])
                if isinstance(result, dict):
                    print(f"✅ Parsed after trimming")
                    return result
            except:
                pass

        # Try line-by-line from the end
        lines = json_str.split('\n')
        for i in range(len(lines), 0, -1):
            try:
                result = json.loads('\n'.join(lines[:i]))
                if isinstance(result, dict):
                    print(f"✅ Parsed after removing {len(lines) - i} lines")
                    return result
            except:
                continue

        print(f"⚠️  All JSON extraction strategies failed")
        return None

    def _fix_duplicate_keys(self, json_str: str) -> str:
        """Fix JSON with duplicate keys by keeping only first occurrence of each key."""
        import re
        
        # Try to parse and manually deduplicate
        # This is a simple heuristic: find all "node_id": "value" pairs
        # and remove duplicates
        
        lines = json_str.split('\n')
        seen_node_ids = set()
        cleaned_lines = []
        in_topics_array = False
        current_object_lines = []
        skip_current_object = False
        
        for line in lines:
            # Track if we're in the topics array
            if '"topics"' in line and '[' in line:
                in_topics_array = True
                cleaned_lines.append(line)
                continue
            
            if in_topics_array:
                # Detect start of an object in topics array
                if line.strip() == '{':
                    current_object_lines = [line]
                    skip_current_object = False
                    continue
                elif line.strip().startswith('}'):
                    # End of object
                    current_object_lines.append(line)
                    if not skip_current_object:
                        cleaned_lines.extend(current_object_lines)
                    current_object_lines = []
                    skip_current_object = False
                    continue
                elif current_object_lines:
                    # We're inside an object
                    current_object_lines.append(line)
                    # Check for node_id
                    node_id_match = re.search(r'"node_id"\s*:\s*"([^"]+)"', line)
                    if node_id_match:
                        node_id = node_id_match.group(1)
                        if node_id in seen_node_ids:
                            skip_current_object = True
                        else:
                            seen_node_ids.add(node_id)
                    continue
                else:
                    # Outside objects in topics array
                    if line.strip() == ']':
                        in_topics_array = False
                    cleaned_lines.append(line)
            else:
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def _validate_plan(self, plan_data: Dict, graph_nodes: List[Dict]) -> Dict:
        """Validate and fix the generated plan."""
        valid_node_ids = {n['id'] for n in graph_nodes}

        if 'title' not in plan_data:
            plan_data['title'] = 'Generated Study Plan'
        if 'description' not in plan_data:
            plan_data['description'] = 'A comprehensive study plan for this course.'
        if 'topics' not in plan_data:
            plan_data['topics'] = []

        valid_topics = []
        for topic in plan_data.get('topics', []):
            if topic.get('node_id') not in valid_node_ids:
                continue

            topic.setdefault('order', len(valid_topics) + 1)
            topic.setdefault('estimated_time_minutes', 30)
            topic.setdefault('difficulty', 'medium')
            topic.setdefault('prerequisites', [])
            topic.setdefault('learning_objectives', [])
            topic.setdefault('key_concepts', [])
            topic.setdefault('exercises', [])
            topic.setdefault('document_references', [])

            for exercise in topic.get('exercises', []):
                exercise.setdefault('type', 'quiz')
                exercise.setdefault('difficulty', 'medium')
                exercise.setdefault('estimated_time_minutes', 15)
                exercise.setdefault('hints', [])

            valid_topics.append(topic)

        plan_data['topics'] = valid_topics
        plan_data['total_topics'] = len(valid_topics)
        total_minutes = sum(t.get('estimated_time_minutes', 30) for t in valid_topics)
        plan_data['estimated_duration_hours'] = round(total_minutes / 60, 1)

        return plan_data

    def _generate_fallback_plan(self, graph_nodes: List[Dict], graph_edges: List[Dict], course_title: str) -> Dict:
        """Generate a basic study plan from graph structure when LLM fails."""
        print(f"📋 Generating fallback plan for {course_title} with {len(graph_nodes)} topics")
        
        topics = []
        for idx, node in enumerate(graph_nodes):
            # Find prerequisites from edges
            prereqs = []
            for edge in graph_edges:
                if edge.get('to') == node['id']:
                    prereqs.append(edge.get('from'))
            
            topics.append({
                "order": idx + 1,
                "node_id": node['id'],
                "node_label": node.get('label', 'Unknown'),
                "node_description": node.get('description', ''),
                "estimated_time_minutes": 30,
                "difficulty": "medium",
                "prerequisites": prereqs,
                "learning_objectives": [f"Understand {node.get('label', 'this topic')}"],
                "key_concepts": [node.get('label', 'Key concept')],
                "exercises": [
                    {
                        "type": "quiz",
                        "title": f"Check understanding of {node.get('label', 'topic')}",
                        "description": f"What are the key aspects of {node.get('label', 'this topic')}?",
                        "difficulty": "medium",
                        "estimated_time_minutes": 10,
                        "hints": [],
                        "solution": f"Review the {node.get('label', 'topic')} material and key concepts."
                    }
                ],
                "document_references": [],
                "notes": ""
            })
        
        return {
            "title": f"Study Plan: {course_title}",
            "description": f"Auto-generated study plan covering {len(topics)} topics",
            "estimated_duration_hours": round(len(topics) * 30 / 60, 1),
            "topics": topics
        }

    async def generate_topic_plan(
        self,
        topic_label: str,
        topic_description: str,
        course_title: str,
        connected_topics: List[Dict],
        document_filenames: List[str] = None
    ) -> Dict[str, Any]:
        """Generate a deep-dive study plan for a single topic."""

        start_time = time.time()

        # Format connected topics
        connected_text = "\n".join([
            f"- **{t['label']}** ({t.get('relation', 'related')})"
            for t in connected_topics
        ]) if connected_topics else "No directly connected topics."

        # Format documents
        doc_list = "\n".join([f"- {fn}" for fn in (document_filenames or [])])

        # Create prompt
        prompt = TOPIC_STUDY_PLAN_PROMPT.format(
            topic_label=topic_label,
            topic_description=topic_description or "No description available.",
            course_title=course_title,
            connected_topics=connected_text,
            document_list=doc_list
        )

        print(f"📋 Generating topic study plan for: {topic_label}")

        try:
            response = await self.adapter.generate_full_response(
                system="You are an expert educational planner. Return only valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8192
            )

            latency_ms = int((time.time() - start_time) * 1000)
            print(f"✅ Topic plan generated in {latency_ms}ms")

            plan_data = self._extract_json(response)

            if not plan_data:
                raise ValueError("LLM did not return valid JSON")

            # Ensure required fields
            plan_data.setdefault('title', f"Deep Dive: {topic_label}")
            plan_data.setdefault('description', f"Study plan for {topic_label}")
            plan_data.setdefault('estimated_time_minutes', 60)
            plan_data.setdefault('learning_path', [])
            plan_data.setdefault('exercises', [])
            plan_data.setdefault('self_check_questions', [])

            return plan_data

        except Exception as e:
            print(f"❌ Topic plan generation failed: {e}")
            import traceback
            print(traceback.format_exc())
            raise
