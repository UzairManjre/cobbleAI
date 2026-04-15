import json
import uuid
from app.services.llm import LLMAdapter
from app.core.config import settings
from typing import Optional
import re

GRAPH_GENERATION_PROMPT = """You are an expert knowledge graph builder. Given a topic, generate a cyclic knowledge graph with 10-12 core concepts.

Rules:
1. Every node must have at least 2 incoming edges (ensure cyclic connectivity)
2. Include a mix of hierarchical and cross-cutting relationships
3. Keep node labels concise (2-4 words) and descriptions informative (1-2 sentences)
4. Use meaningful relation types like "leads_to", "depends_on", "is_part_of", "influences", "enables", "contrasts_with", "builds_on"
5. Output ONLY valid JSON, no markdown, no explanation

Output format:
{{
  "nodes": [
    {{"id": "node_1", "label": "Concept Name", "description": "Brief explanation of this concept"}}
  ],
  "edges": [
    {{"from": "node_1", "to": "node_2", "relation": "leads_to"}}
  ]
}}

Topic: {topic}
"""

class GraphGenerator:
    def __init__(self):
        self.adapter = LLMAdapter()
        self.model = settings.LLM_MODEL

    async def generate_graph(self, topic: str) -> dict:
        """Generate a cyclic knowledge graph for a given topic."""
        prompt = GRAPH_GENERATION_PROMPT.format(topic=topic)
        
        raw_output = await self.adapter.generate_full_response(
            system="You are a knowledge graph builder. Output ONLY valid JSON.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096
        )
        
        # Extract JSON from response (handle potential markdown code blocks)
        json_str = self._extract_json(raw_output)
        
        try:
            graph_data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}\nRaw output: {raw_output[:500]}")
        
        # Validate and enforce cyclic structure
        graph_data = self._enforce_cyclic(graph_data)
        
        # Add UUIDs to nodes and edges
        graph_data = self._add_ids(graph_data)
        
        return graph_data

    def _extract_json(self, text: str) -> str:
        """Extract JSON from potential markdown code blocks."""
        # Try to find JSON in code blocks
        pattern = r'```(?:json)?\s*\n(.*?)\n```'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            return match.group(1).strip()
        return text

    def _enforce_cyclic(self, graph_data: dict) -> dict:
        """Ensure every node has at least 2 incoming edges."""
        nodes = {n["id"] for n in graph_data["nodes"]}
        
        # Count incoming edges per node
        incoming_count = {n["id"]: 0 for n in graph_data["nodes"]}
        for edge in graph_data["edges"]:
            if edge["to"] in incoming_count:
                incoming_count[edge["to"]] += 1
        
        # Add back-edges for nodes with insufficient incoming edges
        new_edges = []
        for node_id, count in incoming_count.items():
            if count < 2:
                # Find a neighbor that can provide a back-edge
                for edge in graph_data["edges"]:
                    if edge["from"] == node_id and incoming_count.get(edge["to"], 0) > 2:
                        # Add reverse edge
                        new_edges.append({
                            "from": edge["to"],
                            "to": node_id,
                            "relation": "relates_to"
                        })
                        incoming_count[node_id] += 1
                        if incoming_count[node_id] >= 2:
                            break
        
        graph_data["edges"].extend(new_edges)
        return graph_data

    def _add_ids(self, graph_data: dict) -> dict:
        """Add UUIDs to nodes and edges if not present."""
        for node in graph_data["nodes"]:
            if "id" not in node or not node["id"].startswith("uuid_"):
                node["id"] = f"uuid_{uuid.uuid4().hex[:12]}"
        
        for edge in graph_data["edges"]:
            edge["id"] = f"uuid_{uuid.uuid4().hex[:12]}"
        
        return graph_data
