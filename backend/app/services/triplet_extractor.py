import json
import re
from app.services.llm import LLMAdapter
from app.core.config import settings
from typing import List, Dict, Tuple

TRIPLET_PROMPT = """Extract knowledge triplets (concept, relation, concept) from the following text.

Rules:
1. Output ONLY valid JSON array of triplets
2. Each triplet: {"head": "concept_name", "relation": "relation_type", "tail": "concept_name"}
3. Use meaningful relations: "leads_to", "depends_on", "is_part_of", "influences", "enables", "contrasts_with", "builds_on", "requires", "produces", "uses"
4. Keep concept names concise (2-5 words)
5. Extract 5-10 triplets from this chunk
6. No markdown, no explanation, just JSON

Text:
{text}
"""

class TripletExtractor:
    def __init__(self):
        self.adapter = LLMAdapter()
        self.model = settings.LLM_MODEL

    async def extract_triplets(self, chunks: List[str]) -> List[Dict]:
        """Extract knowledge triplets from text chunks."""
        all_triplets = []
        
        for i, chunk in enumerate(chunks):
            print(f"Extracting triplets from chunk {i+1}/{len(chunks)}...")
            
            prompt = TRIPLET_PROMPT.format(text=chunk[:2000])  # Limit chunk size
            
            try:
                raw_output = await self.adapter.generate_full_response(
                    system="You are a knowledge graph builder. Output ONLY valid JSON arrays.",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=2048
                )
                
                json_str = self._extract_json(raw_output)
                
                if json_str:
                    triplets = json.loads(json_str)
                    if isinstance(triplets, list):
                        all_triplets.extend(triplets)
                        
            except Exception as e:
                print(f"Error extracting triplets from chunk {i}: {e}")
                continue
        
        return all_triplets

    def _extract_json(self, text: str) -> str:
        """Extract JSON from potential markdown code blocks."""
        # Try to find JSON array in code blocks
        pattern = r'```(?:json)?\s*\n(\[.*?\])\n```'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # Try to find JSON array directly
        pattern = r'\[.*\]'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            return match.group(0).strip()
        
        return ""
