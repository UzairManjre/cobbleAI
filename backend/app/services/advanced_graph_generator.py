"""
Advanced knowledge graph generation with cross-document interconnections.
Builds an interconnected graph from all processed course documents.
"""
import json
import uuid
import asyncio
from typing import List, Dict, Tuple
from collections import defaultdict
from app.services.llm import LLMAdapter
from app.core.config import settings
from motor.motor_asyncio import AsyncIOMotorClient

# System prompts for different stages
CONCEPT_EXTRACTION_PROMPT = """You are an expert at extracting key concepts and their relationships from academic course materials.

Given text from multiple course documents, extract interconnected concepts that form a cohesive knowledge graph.

Rules:
1. Extract 15-25 core concepts that appear across the documents
2. For each concept, provide a clear 1-2 sentence description
3. Identify relationships between concepts using these relation types:
   - "prerequisite_for": A is needed before understanding B
   - "builds_on": A extends or enhances B
   - "contrasts_with": A and B are different approaches/concepts
   - "is_part_of": A is a component of B
   - "enables": A makes B possible
   - "uses": A utilizes B
   - "produces": A generates or creates B
   - "requires": A needs B to function
4. Ensure the graph is interconnected - concepts should have multiple relationships
5. Merge similar concepts across documents (e.g., "Spark RDD" and "Resilient Distributed Dataset" are the same)
6. Output ONLY valid JSON, no markdown, no explanation

Output format:
{{
  "concepts": [
    {{
      "name": "Concept Name",
      "description": "Clear description of what this concept is",
      "category": "technology|algorithm|concept|tool|framework|methodology",
      "source_docs": ["doc1.pdf", "doc2.pdf"]
    }}
  ],
  "relationships": [
    {{
      "from": "Concept A",
      "to": "Concept B",
      "relation": "prerequisite_for",
      "strength": 0.9
    }}
  ]
}}

Course Materials:
{text}
"""

GRAPH_ENRICHMENT_PROMPT = """You are refining a knowledge graph extracted from course materials.

Given the current graph and all source document titles, enhance it by:

1. Adding any missing cross-document relationships (concepts from different documents that relate to each other)
2. Ensuring every node has at least 2 connections
3. Merging duplicate or near-duplicate concepts
4. Adding a "difficulty" level to each concept: "beginner", "intermediate", or "advanced"
5. Ensuring the graph has a logical flow from basic to advanced concepts

Rules:
1. Output ONLY valid JSON
2. Maintain all existing nodes and relationships
3. Add new relationships between concepts from different source documents
4. Use relation types: "prerequisite_for", "builds_on", "contrasts_with", "is_part_of", "enables", "uses", "produces", "requires", "relates_to"
5. Set strength values between 0.5 (weak) and 1.0 (strong)

Current Graph:
{current_graph}

Document Titles:
{doc_titles}

Output the enhanced graph in the same format.
"""


class AdvancedGraphGenerator:
    """Generates an interconnected knowledge graph from course documents."""
    
    def __init__(self):
        self.adapter = LLMAdapter()
        self.model = settings.LLM_MODEL
        
        # Log configuration for debugging
        print(f"Graph Generator Config: URL={self.adapter.base_url}, Model={self.model}")
        
        self.db = None
    
    async def generate_from_course(self, course_id: str) -> Dict:
        """Generate an interconnected graph from all ready documents in a course."""

        # Connect to MongoDB with UUID support
        client = AsyncIOMotorClient(
            settings.MONGO_URI,
            uuidRepresentation="standard"
        )
        db = client.get_default_database()

        try:
            # Step 1: Get all ready documents
            print("📚 Step 1: Fetching ready documents...")
            
            # Convert course_id to UUID for MongoDB query
            try:
                course_uuid = uuid.UUID(course_id)
            except ValueError:
                raise ValueError(f"Invalid course ID: {course_id}")
            
            documents = await db["documents"].find({
                "course_id": course_uuid,
                "status": "ready"
            }).to_list(None)
            
            if not documents:
                raise ValueError("No processed documents found for this course. Upload and process documents first.")
            
            print(f"   Found {len(documents)} ready documents")
            
            # Step 2: Extract text from all documents
            print("\n📝 Step 2: Extracting text from all documents...")
            from app.core.storage import get_s3_client, S3_BUCKET
            from app.services.pdf_extractor import extract_text
            
            s3 = get_s3_client()
            all_text = ""
            doc_titles = []
            
            for doc in documents:
                try:
                    doc_bytes = s3.get_object(Bucket=S3_BUCKET, Key=doc["s3_path"])['Body'].read()
                    text = extract_text(doc.get("file_type", "pdf"), doc_bytes)
                    all_text += f"\n\n--- Document: {doc['filename']} ---\n\n{text}"
                    doc_titles.append(doc["filename"])
                except Exception as e:
                    print(f"   ⚠️ Failed to extract {doc['filename']}: {e}")
                    continue
            
            if not all_text.strip():
                raise ValueError("No text could be extracted from documents")
            
            print(f"   Extracted {len(all_text):,} characters total")
            
            # Step 3: Extract content from text
            print("\n🧠 Step 3: Extracting concepts and relationships...")
            
            # Utilize 32k context (25k characters of content + system prompt + buffer)
            max_chars = 25000 
            if len(all_text) > max_chars:
                # Take the most important parts (beginning + key sections) from all_text
                combined_chunks = all_text[:max_chars]
            else:
                combined_chunks = all_text
            
            initial_graph = await self._extract_concepts(combined_chunks)
            
            if not initial_graph.get("concepts"):
                print("   ⚠️ No concepts extracted in Step 3. Retrying with smaller chunks...")
                # Fallback to a smaller chunk if gemma4 choked on 25k chars
                initial_graph = await self._extract_concepts(all_text[:8000])

            if not initial_graph.get("concepts"):
                raise ValueError("No concepts could be extracted from documents. The AI might be struggling with the document content.")
            
            print(f"   Extracted {len(initial_graph['concepts'])} concepts")
            print(f"   Found {len(initial_graph['relationships'])} relationships")
            
            # Step 4: Enrich graph with cross-document connections
            print("\n🔗 Step 4: Enriching with cross-document connections...")
            enriched_graph = await self._enrich_graph(initial_graph, doc_titles)
            
            print(f"   Enhanced to {len(enriched_graph['relationships'])} relationships")
            
            # Step 5: Assign UUIDs and validate
            print("\n✅ Step 5: Finalizing graph...")
            final_graph = self._assign_uuids(enriched_graph)
            
            # Store source document metadata for traceablity
            final_graph["_source_docs"] = doc_titles
            
            # Validate graph structure
            self._validate_graph(final_graph)
            
            print(f"\n🎉 Graph generation complete!")
            print(f"   📊 {len(final_graph['nodes'])} nodes")
            print(f"   🔗 {len(final_graph['edges'])} edges")
            print(f"   📄 Sources: {len(doc_titles)} documents")
            
            return final_graph
            
        finally:
            client.close()
    
    async def _extract_concepts(self, text: str) -> Dict:
        """Extract initial concepts and relationships from text."""
        prompt = CONCEPT_EXTRACTION_PROMPT.format(text=text)
        
        try:
            print(f"📤 Sending request to LLM (Model: {self.model})...")
            raw_output = await self.adapter.generate_full_response(
                system="You are a knowledge graph expert. Output ONLY valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8192
            )
            return self._clean_and_parse_json(raw_output)
        except Exception as e:
            print(f"⚠️ Concept extraction error: {e}")
            print(f"🔍 Error Details: {str(e)}")
            # Check if it's a connection error
            if "404" in str(e):
                print("💡 Hint: 404 usually means:")
                print("   1. The model name is incorrect (e.g., 'gemma4:e2b' might not exist).")
                print("   2. The LLM_BASE_URL is wrong.")
                print("   3. Ollama is not running.")
                print("   Please verify your model and Ollama status.")
            elif "connection" in str(e).lower() or "refused" in str(e).lower():
                print("💡 Hint: Connection refused. Is Ollama running on the specified URL?")
            return {"concepts": [], "relationships": []}
    
    async def _enrich_graph(self, graph: Dict, doc_titles: List[str]) -> Dict:
        """Enrich graph with cross-document relationships."""
        prompt = GRAPH_ENRICHMENT_PROMPT.format(
            current_graph=json.dumps(graph, indent=2),
            doc_titles="\n".join(doc_titles)
        )
        
        try:
            raw_output = await self.adapter.generate_full_response(
                system="You are a knowledge graph expert. Output ONLY valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4096
            )
            return self._clean_and_parse_json(raw_output)
        except Exception as e:
            print(f"⚠️ Enrichment failed, using initial graph: {e}")
            return graph

    def _clean_and_parse_json(self, text: str) -> Dict:
        """Clean and parse JSON from LLM output, handling markdown and thinking blocks."""
        import re
        json_str = text

        # 1. Remove thinking blocks <thought>...</thought> (if gemma/qwen reasoning is active)
        json_str = re.sub(r'<thought>.*?</thought>', '', json_str, flags=re.DOTALL)

        # 2. Remove markdown formatting artifacts that break JSON parsing
        #    Bold: **text** or __text__
        #    Italic: *text* or _text_ (but not inside valid JSON strings)
        #    Strikethrough: ~~text~~
        #    These often leak into keys/values when LLM outputs malformed JSON
        json_str = re.sub(r'\*\*(.*?)\*\*', r'\1', json_str)  # **bold**
        json_str = re.sub(r'__(.*?)__', r'\1', json_str)      # __bold__
        json_str = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'\1', json_str)  # *italic* (standalone)
        json_str = re.sub(r'~~(.*?)~~', r'\1', json_str)      # ~~strikethrough~~
        json_str = re.sub(r'`([^`]+)`', r'\1', json_str)      # `inline code`

        # 3. Extract JSON from markdown code blocks
        match = re.search(r'```(?:json)?\s*\n(.*?)\n```', json_str, re.DOTALL)
        if match:
            json_str = match.group(1).strip()
        else:
            # Try to find the first { and last }
            match = re.search(r'\{.*\}', json_str, re.DOTALL)
            if match:
                json_str = match.group(0).strip()

        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"⚠️ JSON parse error: {e}")
            print(f"Cleaned JSON string (first 100 chars): {json_str[:100]}")
            return {"concepts": [], "relationships": []}
    
    def _assign_uuids(self, graph: Dict) -> Dict:
        """Assign UUIDs to nodes and edges."""
        name_to_id = {}
        nodes = []
        
        # Create nodes with UUIDs
        for concept in graph.get("concepts", []):
            node_id = f"node_{uuid.uuid4().hex[:12]}"
            name_to_id[concept["name"]] = node_id
            
            nodes.append({
                "id": node_id,
                "label": concept["name"],
                "description": concept.get("description", ""),
                "category": concept.get("category", "concept"),
                "source_docs": concept.get("source_docs", []),
                "difficulty": concept.get("difficulty", "intermediate")
            })
        
        # Create edges with UUIDs
        edges = []
        for rel in graph.get("relationships", []):
            from_id = name_to_id.get(rel["from"])
            to_id = name_to_id.get(rel["to"])
            
            if from_id and to_id:
                edges.append({
                    "id": f"edge_{uuid.uuid4().hex[:12]}",
                    "from": from_id,
                    "to": to_id,
                    "relation": rel["relation"],
                    "strength": rel.get("strength", 0.8)
                })
        
        return {
            "nodes": nodes,
            "edges": edges
        }
    
    def _validate_graph(self, graph: Dict):
        """Validate graph structure and ensure connectivity."""
        node_ids = {n["id"] for n in graph["nodes"]}
        
        # Check for orphan nodes (no connections)
        connected_nodes = set()
        for edge in graph["edges"]:
            connected_nodes.add(edge["from"])
            connected_nodes.add(edge["to"])
        
        orphan_nodes = node_ids - connected_nodes
        if orphan_nodes:
            print(f"   ⚠️ Warning: {len(orphan_nodes)} nodes have no connections")
        
        # Ensure minimum edges
        if len(graph["edges"]) < len(graph["nodes"]) * 1.5:
            print(f"   ⚠️ Warning: Graph may be sparse ({len(graph['edges'])} edges for {len(graph['nodes'])} nodes)")
    
    def _extract_json(self, text: str) -> str:
        """Extract JSON from text (handles markdown code blocks)."""
        import re
        
        # Try code block
        pattern = r'```(?:json)?\s*\n(.*?)\n```'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # Try direct JSON object
        pattern = r'\{.*\}'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            return match.group(0).strip()
        
        return text
