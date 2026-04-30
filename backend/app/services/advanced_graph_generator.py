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
    
    async def generate_from_course(self, course_id: str, progress_callback=None) -> Dict:
        """Generate an interconnected graph from all ready documents in a course.
        
        Uses a recursive chunk-and-merge pipeline:
        1. Extract text from all documents
        2. Split into chunks that fit within 32k context
        3. Extract concepts from each chunk independently
        4. Merge all partial graphs (deduplicate concepts, unify relationships)
        5. Enrich with cross-document connections
        6. Assign UUIDs and validate
        
        Args:
            course_id: UUID of the course to generate the graph for.
            progress_callback: Optional async callable(step, total_steps, message, detail)
                               for streaming progress updates to the caller.
        """
        async def _progress(step: int, total_steps: int, message: str, detail: str = ""):
            """Emit a progress update if a callback is registered."""
            if progress_callback:
                await progress_callback(step, total_steps, message, detail)

        # Connect to MongoDB with UUID support
        client = AsyncIOMotorClient(
            settings.MONGO_URI,
            uuidRepresentation="standard"
        )
        db = client.get_default_database()

        try:
            # ── Step 1: Fetch ready documents ──
            print("  Step 1: Fetching ready documents...")
            await _progress(1, 6, "Fetching documents", "Looking up processed documents...")
            
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
            await _progress(1, 6, "Fetching documents", f"Found {len(documents)} ready documents")
            
            # ── Step 2: Extract text from all documents ──
            print("\n  Step 2: Extracting text from all documents...")
            await _progress(2, 6, "Extracting text", f"Reading {len(documents)} documents...")
            from app.core.storage import get_s3_client, S3_BUCKET
            from app.services.pdf_extractor import extract_text
            
            s3 = get_s3_client()
            doc_texts = []  # List of (filename, text) tuples
            doc_titles = []
            
            for doc in documents:
                try:
                    doc_bytes = s3.get_object(Bucket=S3_BUCKET, Key=doc["s3_path"])['Body'].read()
                    text = extract_text(doc.get("file_type", "pdf"), doc_bytes)
                    if text.strip():
                        doc_texts.append((doc["filename"], text))
                        doc_titles.append(doc["filename"])
                        print(f"     + {doc['filename']}: {len(text):,} chars")
                except Exception as e:
                    print(f"     x Failed to extract {doc['filename']}: {e}")
                    continue
            
            if not doc_texts:
                raise ValueError("No text could be extracted from documents")
            
            total_chars = sum(len(t) for _, t in doc_texts)
            print(f"   Total extracted: {total_chars:,} characters from {len(doc_texts)} docs")
            await _progress(2, 6, "Extracting text", f"Extracted {total_chars:,} characters from {len(doc_texts)} documents")
            
            # ── Step 3: Recursive Chunk-and-Extract Pipeline ──
            print("\n  Step 3: Recursive chunk-and-extract pipeline...")
            
            # Target ~20k chars per chunk (leaves ~12k for prompt + output in 32k ctx)
            CHUNK_SIZE = 20000
            chunks = self._build_chunks(doc_texts, CHUNK_SIZE)
            
            print(f"   Split into {len(chunks)} processing chunks")
            await _progress(3, 6, "Analyzing content", f"Split into {len(chunks)} chunks — sending to LLM...")
            
            # Process each chunk independently
            partial_graphs = []
            for i, chunk in enumerate(chunks):
                print(f"\n   -- Chunk {i+1}/{len(chunks)} ({len(chunk):,} chars) --")
                await _progress(3, 6, "Analyzing content", f"Processing chunk {i+1} of {len(chunks)}...")
                partial = await self._extract_concepts(chunk)
                concept_count = len(partial.get("concepts", []))
                rel_count = len(partial.get("relationships", []))
                print(f"      Extracted {concept_count} concepts, {rel_count} relationships")
                await _progress(3, 6, "Analyzing content", f"Chunk {i+1}/{len(chunks)}: found {concept_count} concepts, {rel_count} relationships")
                
                if concept_count > 0:
                    partial_graphs.append(partial)
            
            if not partial_graphs:
                raise ValueError("No concepts could be extracted from any document chunk.")
            
            # ── Step 4: Merge all partial graphs ──
            print(f"\n  Step 4: Merging {len(partial_graphs)} partial graphs...")
            await _progress(4, 6, "Merging graphs", f"Merging {len(partial_graphs)} partial graphs...")
            
            if len(partial_graphs) == 1:
                merged_graph = partial_graphs[0]
            else:
                merged_graph = self._merge_partial_graphs(partial_graphs)
            
            print(f"   Merged result: {len(merged_graph['concepts'])} concepts, {len(merged_graph['relationships'])} relationships")
            await _progress(4, 6, "Merging graphs", f"Merged to {len(merged_graph['concepts'])} unique concepts, {len(merged_graph['relationships'])} relationships")
            
            # ── Step 5: Enrich with cross-document connections ──
            print("\n  Step 5: Enriching with cross-document connections...")
            await _progress(5, 6, "Enriching connections", "Discovering cross-document relationships...")
            enriched_graph = await self._enrich_graph(merged_graph, doc_titles)
            
            print(f"   Enhanced to {len(enriched_graph['relationships'])} relationships")
            await _progress(5, 6, "Enriching connections", f"Enhanced to {len(enriched_graph['relationships'])} relationships")
            
            # ── Step 6: Assign UUIDs and validate ──
            print("\n  Step 6: Finalizing graph...")
            await _progress(6, 6, "Finalizing graph", "Assigning IDs and validating...")
            final_graph = self._assign_uuids(enriched_graph)
            
            final_graph["_source_docs"] = doc_titles
            self._validate_graph(final_graph)
            
            print(f"\n  Graph generation complete!")
            print(f"     {len(final_graph['nodes'])} nodes")
            print(f"     {len(final_graph['edges'])} edges")
            print(f"     Sources: {len(doc_titles)} documents")
            print(f"     Pipeline: {len(chunks)} chunks -> {len(partial_graphs)} partials -> 1 merged graph")
            await _progress(6, 6, "Complete", f"{len(final_graph['nodes'])} concepts, {len(final_graph['edges'])} connections from {len(doc_titles)} documents")
            
            return final_graph
            
        finally:
            client.close()
    
    def _build_chunks(self, doc_texts: List[Tuple[str, str]], chunk_size: int) -> List[str]:
        """Build text chunks that respect document boundaries where possible.
        
        Strategy:
        - If a single document fits in a chunk, keep it whole
        - If a document is too large, split it at paragraph boundaries
        - Pack multiple small documents into one chunk
        """
        chunks = []
        current_chunk = ""
        
        for filename, text in doc_texts:
            header = f"\n\n--- Document: {filename} ---\n\n"
            doc_content = header + text
            
            if len(doc_content) > chunk_size:
                # Document is too large — flush current, then split it
                if current_chunk.strip():
                    chunks.append(current_chunk)
                    current_chunk = ""
                
                # Split large doc at paragraph boundaries
                paragraphs = text.split("\n\n")
                sub_chunk = header
                
                for para in paragraphs:
                    if len(sub_chunk) + len(para) + 2 > chunk_size:
                        if sub_chunk.strip() and len(sub_chunk) > len(header) + 10:
                            chunks.append(sub_chunk)
                        sub_chunk = f"\n\n--- Document: {filename} (continued) ---\n\n"
                    sub_chunk += para + "\n\n"
                
                if sub_chunk.strip() and len(sub_chunk) > 50:
                    chunks.append(sub_chunk)
            
            elif len(current_chunk) + len(doc_content) > chunk_size:
                # Would overflow — flush current chunk first
                if current_chunk.strip():
                    chunks.append(current_chunk)
                current_chunk = doc_content
            else:
                # Pack into current chunk
                current_chunk += doc_content
        
        # Don't forget the last chunk
        if current_chunk.strip():
            chunks.append(current_chunk)
        
        return chunks if chunks else [""]
    
    def _merge_partial_graphs(self, partial_graphs: List[Dict]) -> Dict:
        """Merge multiple partial concept graphs into one unified graph.
        
        Deduplicates concepts by normalized name and merges their source_docs.
        Relationships are unified and deduplicated.
        """
        concept_map = {}  # normalized_name -> concept dict
        all_relationships = []
        seen_rels = set()
        
        for graph in partial_graphs:
            for concept in graph.get("concepts", []):
                name = concept.get("name", "").strip()
                if not name:
                    continue
                normalized = name.lower()
                
                if normalized in concept_map:
                    # Merge: combine source_docs, keep longer description
                    existing = concept_map[normalized]
                    existing_docs = set(existing.get("source_docs", []))
                    new_docs = set(concept.get("source_docs", []))
                    existing["source_docs"] = list(existing_docs | new_docs)
                    
                    if len(concept.get("description", "")) > len(existing.get("description", "")):
                        existing["description"] = concept["description"]
                else:
                    concept_map[normalized] = {
                        "name": name,
                        "description": concept.get("description", ""),
                        "category": concept.get("category", "concept"),
                        "source_docs": concept.get("source_docs", []),
                        "difficulty": concept.get("difficulty", "intermediate"),
                    }
            
            for rel in graph.get("relationships", []):
                from_name = (rel.get("from") or rel.get("source") or "").strip()
                to_name = (rel.get("to") or rel.get("target") or "").strip()
                relation = rel.get("relation") or rel.get("type") or "relates_to"
                
                if not from_name or not to_name:
                    continue
                
                rel_key = (from_name.lower(), to_name.lower(), relation)
                if rel_key not in seen_rels:
                    seen_rels.add(rel_key)
                    all_relationships.append({
                        "from": from_name,
                        "to": to_name,
                        "relation": relation,
                        "strength": rel.get("strength", 0.8)
                    })
        
        raw_concepts = sum(len(g.get("concepts", [])) for g in partial_graphs)
        raw_rels = sum(len(g.get("relationships", [])) for g in partial_graphs)
        merged_concepts = list(concept_map.values())
        
        print(f"   Deduplication: {raw_concepts} raw -> {len(merged_concepts)} unique concepts")
        print(f"   Relationships: {raw_rels} raw -> {len(all_relationships)} unique")
        
        return {
            "concepts": merged_concepts,
            "relationships": all_relationships
        }
    
    async def _extract_concepts(self, text: str) -> Dict:
        """Extract initial concepts and relationships from text."""
        prompt = CONCEPT_EXTRACTION_PROMPT.format(text=text)
        
        try:
            print(f"  Sending request to LLM (Model: {self.model})...")
            raw_output = await self.adapter.generate_full_response(
                system="You are a knowledge graph expert. Output ONLY valid JSON using the requested schema. Do not include markdown or thought blocks.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8192
            )
            data = self._clean_and_parse_json(raw_output)
            
            # Normalize keys for robustness
            concepts = data.get("concepts") or data.get("nodes") or []
            rels = data.get("relationships") or data.get("edges") or []
            return {"concepts": concepts, "relationships": rels}
        except Exception as e:
            print(f"  Concept extraction error: {e}")
            print(f"  Error Details: {str(e)}")
            # Check if it's a connection error
            if "404" in str(e):
                print("  Hint: 404 usually means:")
                print("   1. The model name is incorrect (e.g., 'gemma4:e2b' might not exist).")
                print("   2. The LLM_BASE_URL is wrong.")
                print("   3. Ollama is not running.")
                print("   Please verify your model and Ollama status.")
            elif "connection" in str(e).lower() or "refused" in str(e).lower():
                print("  Hint: Connection refused. Is Ollama running on the specified URL?")
            return {"concepts": [], "relationships": []}
    
    async def _enrich_graph(self, graph: Dict, doc_titles: List[str]) -> Dict:
        """Enrich graph with cross-document relationships."""
        prompt = GRAPH_ENRICHMENT_PROMPT.format(
            current_graph=json.dumps(graph, indent=2),
            doc_titles="\n".join(doc_titles)
        )
        
        try:
            raw_output = await self.adapter.generate_full_response(
                system="You are a knowledge graph expert. Output ONLY valid JSON using the same schema as input.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4096
            )
            data = self._clean_and_parse_json(raw_output)
            
            # Normalize keys
            concepts = data.get("concepts") or data.get("nodes") or graph.get("concepts") or []
            rels = data.get("relationships") or data.get("edges") or graph.get("relationships") or []
            return {"concepts": concepts, "relationships": rels}
        except Exception as e:
            print(f"  Enrichment failed, using initial graph: {e}")
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
            # Handle potential trailing commas or other JSON oddities
            json_str = json_str.strip()
            # Remove trailing comma before closing brace/bracket
            json_str = re.sub(r',\s*([\]}])', r'\1', json_str)
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"  JSON parse error: {e}")
            print(f"Cleaned JSON string (first 100 chars): {json_str[:100]}")
            # Final attempt: try to find the inner content if the structure is nested
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
            # Handle different key names from LLM
            source_name = rel.get("from") or rel.get("source")
            target_name = rel.get("to") or rel.get("target")
            
            if not source_name or not target_name:
                continue
                
            from_id = name_to_id.get(source_name)
            to_id = name_to_id.get(target_name)
            
            if from_id and to_id:
                edges.append({
                    "id": f"edge_{uuid.uuid4().hex[:12]}",
                    "from": from_id,
                    "to": to_id,
                    "relation": rel.get("relation") or rel.get("type") or "relates_to",
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
            print(f"     Warning: {len(orphan_nodes)} nodes have no connections")
        
        # Ensure minimum edges
        if len(graph["edges"]) < len(graph["nodes"]) * 1.5:
            print(f"     Warning: Graph may be sparse ({len(graph['edges'])} edges for {len(graph['nodes'])} nodes)")
    
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
