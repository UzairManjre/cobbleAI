"""
Advanced knowledge graph generation with cross-document interconnections.
Builds an interconnected graph from all processed course documents and lectures.

CobbleAI 2.0 (Upgrade D): the graph is extracted from *located* evidence chunks
(labelled E1, E2, ...), the LLM cites the evidence for every concept and relation,
and app.services.graph_provenance verifies those citations, flags unsupported
edges and links concepts to the lecture moments that explain them.
"""
import json
import uuid
from typing import List, Dict
from app.services.llm import LLMAdapter
from app.core.config import settings
from app.services import graph_provenance as provenance

# System prompts for different stages
CONCEPT_EXTRACTION_PROMPT = """You are an expert at extracting key concepts and their relationships from academic course materials.

The course materials below are split into evidence passages, each starting with a label such as [E12].

Rules:
1. Extract 15-25 core concepts that appear in the passages
2. For each concept, provide a clear 1-2 sentence description based on the passages
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
5. Merge similar concepts (e.g., "Spark RDD" and "Resilient Distributed Dataset" are the same)
6. For EVERY concept and EVERY relationship, give "evidence": the label of a passage that states it and a short
   quote (under 25 words) copied exactly from that passage. Only include relationships the passages support.
7. Output ONLY valid JSON, no markdown, no explanation

Output format:
{{
  "concepts": [
    {{
      "name": "Concept Name",
      "description": "Clear description of what this concept is",
      "category": "technology|algorithm|concept|tool|framework|methodology",
      "evidence": [{{"ref": "E3", "quote": "exact words from passage E3"}}]
    }}
  ],
  "relationships": [
    {{
      "from": "Concept A",
      "to": "Concept B",
      "relation": "prerequisite_for",
      "strength": 0.9,
      "evidence": [{{"ref": "E7", "quote": "exact words from passage E7"}}]
    }}
  ]
}}

Course Materials:
{text}
"""

# Enrichment only adds: difficulty labels and extra relationships between existing concepts.
# It never rewrites the graph, so a truncated or partial response cannot drop concepts.
GRAPH_ENRICHMENT_PROMPT = """You are refining a knowledge graph extracted from a university course.

Concepts (name: description):
{concept_lines}

Existing relationships:
{relationship_lines}

Tasks:
1. Give every concept a difficulty: "beginner", "intermediate" or "advanced".
2. Propose up to {max_new} additional relationships between the concepts listed above that connect different
   topics or documents. Use only names from the list. Relation types: "prerequisite_for", "builds_on",
   "contrasts_with", "is_part_of", "enables", "uses", "produces", "requires", "relates_to".

Output ONLY valid JSON:
{{"difficulty": {{"Concept name": "beginner"}}, "new_relationships": [{{"from": "...", "to": "...", "relation": "...", "strength": 0.7}}]}}
"""


class AdvancedGraphGenerator:
    """Generates an interconnected, provenance-backed knowledge graph from course materials."""

    def __init__(self):
        self.adapter = LLMAdapter()
        self.model = settings.LLM_MODEL
        print(f"Graph Generator Config: URL={self.adapter.base_url}, Model={self.model}")

    async def generate_from_course(self, course_id: str, progress_callback=None) -> Dict:
        """Generate the course graph.

        1. Load located evidence chunks (indexed documents and lecture transcripts)
        2. Pack them into labelled blocks that fit the context window
        3. Extract concepts/relations with cited evidence from each block
        4. Merge partial graphs (deduplicate concepts, union evidence)
        5. Enrich: difficulty labels and extra cross-topic relations (additive only)
        6. Stable ids + provenance verification (unsupported edges flagged)
        """
        async def _progress(step: int, total_steps: int, message: str, detail: str = ""):
            if progress_callback:
                await progress_callback(step, total_steps, message, detail)

        try:
            uuid.UUID(course_id)
        except ValueError:
            raise ValueError(f"Invalid course ID: {course_id}")

        print("  Step 1: Loading located course material...")
        await _progress(1, 6, "Fetching documents", "Looking up processed documents and lectures...")
        chunks = provenance.load_course_chunks(course_id)
        if not chunks:
            # Courses indexed before CobbleAI 2.0: extract located segments from the files
            chunks = await self._chunks_from_files(course_id)
        if not chunks:
            raise ValueError("No processed documents found for this course. Upload and process documents first.")
        doc_titles = sorted({c.filename for c in chunks if c.filename})
        await _progress(1, 6, "Fetching documents", f"Found {len(doc_titles)} sources ({len(chunks)} passages)")

        print("  Step 2: Packing evidence passages...")
        await _progress(2, 6, "Extracting text", f"Preparing {len(chunks)} passages from {len(doc_titles)} sources")
        blocks = provenance.build_prompt_chunks(chunks)

        print(f"  Step 3: Extracting concepts from {len(blocks)} blocks...")
        await _progress(3, 6, "Analyzing content", f"Split into {len(blocks)} chunks — sending to LLM...")
        partial_graphs = []
        for i, block in enumerate(blocks):
            await _progress(3, 6, "Analyzing content", f"Processing chunk {i + 1} of {len(blocks)}...")
            partial = await self._extract_concepts(block)
            n_concepts, n_rels = len(partial.get("concepts", [])), len(partial.get("relationships", []))
            print(f"      chunk {i + 1}: {n_concepts} concepts, {n_rels} relationships")
            await _progress(3, 6, "Analyzing content", f"Chunk {i + 1}/{len(blocks)}: found {n_concepts} concepts, {n_rels} relationships")
            if n_concepts:
                partial_graphs.append(partial)
        if not partial_graphs:
            raise ValueError("No concepts could be extracted from any document chunk.")

        print(f"  Step 4: Merging {len(partial_graphs)} partial graphs...")
        await _progress(4, 6, "Merging graphs", f"Merging {len(partial_graphs)} partial graphs...")
        merged = self._merge_partial_graphs(partial_graphs)
        await _progress(4, 6, "Merging graphs", f"Merged to {len(merged['concepts'])} unique concepts, {len(merged['relationships'])} relationships")

        print("  Step 5: Enriching (additive)...")
        await _progress(5, 6, "Enriching connections", "Discovering cross-topic relationships...")
        enriched = await self._enrich_graph(merged)
        await _progress(5, 6, "Enriching connections", f"Enhanced to {len(enriched['relationships'])} relationships")

        print("  Step 6: Verifying provenance...")
        await _progress(6, 6, "Finalizing graph", "Checking every concept and relation against the materials...")
        nodes, edges = provenance.attach_provenance(course_id, enriched["concepts"], enriched["relationships"], chunks)
        final_graph = {"nodes": nodes, "edges": edges, "_source_docs": doc_titles}
        self._validate_graph(final_graph)
        unsupported = sum(1 for e in edges if not e["supported"])
        print(f"  Graph: {len(nodes)} nodes, {len(edges)} edges ({unsupported} unsupported) from {len(doc_titles)} sources")
        await _progress(6, 6, "Complete", f"{len(nodes)} concepts, {len(edges)} connections ({unsupported} flagged unsupported) from {len(doc_titles)} sources")
        return final_graph

    async def _chunks_from_files(self, course_id: str) -> List[provenance.EvidenceChunk]:
        from app.core.storage import get_s3_client, S3_BUCKET
        from app.models.document import DocumentModel
        from app.services.chunking import chunk_segments
        from app.services.ingestion.segments import extract_segments

        docs = await DocumentModel.find(
            DocumentModel.course_id == uuid.UUID(course_id),
            DocumentModel.status == "ready",
            DocumentModel.media_type == "document",
        ).to_list()
        s3 = get_s3_client()
        payloads = []
        for doc in docs:
            try:
                body = s3.get_object(Bucket=S3_BUCKET, Key=doc.s3_path)["Body"].read()
                located, _ = chunk_segments(extract_segments(doc.file_type, body), str(doc.id))
                for c in located:
                    payloads.append({
                        "text": c.text, "doc_id": str(doc.id), "filename": doc.filename,
                        "chunk_id": f"{doc.id}:{c.chunk_index}", "page_start": c.page_start, "slide_start": c.slide_start,
                    })
            except Exception as e:
                print(f"     x Failed to extract {doc.filename}: {e}")
        return provenance.chunks_from_payloads(payloads)

    def _merge_partial_graphs(self, partial_graphs: List[Dict]) -> Dict:
        """Deduplicate concepts by normalised name (unioning evidence) and relations by (from, to, relation)."""
        concept_map: Dict[str, dict] = {}
        relationships: Dict[tuple, dict] = {}
        for graph in partial_graphs:
            for concept in graph.get("concepts", []):
                name = (concept.get("name") or concept.get("label") or "").strip()
                if not name:
                    continue
                key = provenance.normalize_label(name)
                evidence = concept.get("evidence") or []
                if key in concept_map:
                    existing = concept_map[key]
                    existing["evidence"] += [e for e in evidence if e not in existing["evidence"]]
                    existing["source_docs"] = sorted(set(existing["source_docs"]) | set(concept.get("source_docs") or []))
                    if len(concept.get("description", "")) > len(existing["description"]):
                        existing["description"] = concept["description"]
                else:
                    concept_map[key] = {
                        "name": name,
                        "description": concept.get("description", ""),
                        "category": concept.get("category", "concept"),
                        "source_docs": list(concept.get("source_docs") or []),
                        "difficulty": concept.get("difficulty", "intermediate"),
                        "evidence": list(evidence),
                    }
            for rel in graph.get("relationships", []):
                src = (rel.get("from") or rel.get("source") or "").strip()
                tgt = (rel.get("to") or rel.get("target") or "").strip()
                relation = rel.get("relation") or rel.get("type") or "relates_to"
                if not src or not tgt:
                    continue
                key = (provenance.normalize_label(src), provenance.normalize_label(tgt), relation)
                evidence = rel.get("evidence") or []
                if key in relationships:
                    relationships[key]["evidence"] += [e for e in evidence if e not in relationships[key]["evidence"]]
                else:
                    relationships[key] = {"from": src, "to": tgt, "relation": relation,
                                          "strength": rel.get("strength", 0.8), "evidence": list(evidence)}
        return {"concepts": list(concept_map.values()), "relationships": list(relationships.values())}

    async def _extract_concepts(self, text: str) -> Dict:
        """Extract concepts and relationships (with cited evidence) from one block of passages."""
        try:
            raw_output = await self.adapter.generate_full_response(
                system="You extract knowledge graphs from course materials. Output ONLY valid JSON.",
                messages=[{"role": "user", "content": CONCEPT_EXTRACTION_PROMPT.format(text=text)}],
                max_tokens=8192,
            )
            data = self._clean_and_parse_json(raw_output)
            return {
                "concepts": data.get("concepts") or data.get("nodes") or [],
                "relationships": data.get("relationships") or data.get("edges") or [],
            }
        except Exception as e:
            print(f"  Concept extraction error: {e}")
            return {"concepts": [], "relationships": []}

    async def _enrich_graph(self, graph: Dict, max_new: int = 25) -> Dict:
        """Add difficulty labels and extra relationships; never removes anything."""
        names = {provenance.normalize_label(c["name"]): c["name"] for c in graph["concepts"]}
        prompt = GRAPH_ENRICHMENT_PROMPT.format(
            concept_lines="\n".join(f"- {c['name']}: {c.get('description', '')[:160]}" for c in graph["concepts"]),
            relationship_lines="\n".join(f"- {r['from']} --{r['relation']}--> {r['to']}" for r in graph["relationships"][:80]) or "(none)",
            max_new=max_new,
        )
        try:
            raw_output = await self.adapter.generate_full_response(
                system="You are a knowledge graph expert. Output ONLY valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4096,
            )
            data = self._clean_and_parse_json(raw_output) or {}
        except Exception as e:
            print(f"  Enrichment failed, using merged graph: {e}")
            return graph

        difficulty = {provenance.normalize_label(k): v for k, v in (data.get("difficulty") or {}).items()}
        for concept in graph["concepts"]:
            level = difficulty.get(provenance.normalize_label(concept["name"]))
            if level in ("beginner", "intermediate", "advanced"):
                concept["difficulty"] = level

        existing = {(provenance.normalize_label(r["from"]), provenance.normalize_label(r["to"]), r["relation"]) for r in graph["relationships"]}
        added = 0
        for rel in (data.get("new_relationships") or [])[:max_new]:
            src, tgt = provenance.normalize_label(rel.get("from", "")), provenance.normalize_label(rel.get("to", ""))
            relation = rel.get("relation") or "relates_to"
            if src in names and tgt in names and src != tgt and (src, tgt, relation) not in existing:
                graph["relationships"].append({"from": names[src], "to": names[tgt], "relation": relation,
                                               "strength": rel.get("strength", 0.6), "evidence": []})
                existing.add((src, tgt, relation))
                added += 1
        print(f"   Enrichment added {added} relationships")
        return graph

    def _clean_and_parse_json(self, text: str) -> Dict:
        """Clean and parse JSON from LLM output, handling markdown and thinking blocks."""
        import re
        json_str = text

        # 1. Remove thinking blocks <thought>...</thought> (if gemma/qwen reasoning is active)
        json_str = re.sub(r'<thought>.*?</thought>', '', json_str, flags=re.DOTALL)
        # Also handle unclosed thought blocks
        if '<thought>' in json_str and '</thought>' not in json_str:
            json_str = re.sub(r'<thought>.*', '', json_str, flags=re.DOTALL)

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
            
            # Fallback: Extract concepts using regex if JSON is truncated
            concepts = []
            rels = []
            
            # Extract concepts
            concept_matches = re.finditer(r'\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:\s*"([^"]+)"\s*(?:,\s*"category"\s*:\s*"([^"]+)")?\s*(?:,\s*"source_docs"\s*:\s*\[([^\]]*)\])?\s*\}', json_str)
            for m in concept_matches:
                concepts.append({
                    "name": m.group(1),
                    "description": m.group(2),
                    "category": m.group(3) or "concept",
                    "source_docs": [d.strip(' "\n') for d in (m.group(4) or "").split(",")] if m.group(4) else []
                })
            
            # Extract relationships
            rel_matches = re.finditer(r'\{\s*"from"\s*:\s*"([^"]+)"\s*,\s*"to"\s*:\s*"([^"]+)"\s*,\s*"relation"\s*:\s*"([^"]+)"\s*(?:,\s*"strength"\s*:\s*([0-9.]+))?\s*\}', json_str)
            for m in rel_matches:
                rels.append({
                    "from": m.group(1),
                    "to": m.group(2),
                    "relation": m.group(3),
                    "strength": float(m.group(4) or "0.8")
                })
                
            if concepts or rels:
                print(f"  Salvaged {len(concepts)} concepts and {len(rels)} relationships from truncated JSON via regex fallback")
                return {"concepts": concepts, "relationships": rels}
                
            return {}  # Return empty dict if fallback also fails
    
    def _validate_graph(self, graph: Dict):
        """Warn about orphan nodes and sparse graphs (does not modify the graph)."""
        node_ids = {n["id"] for n in graph["nodes"]}
        connected = {e["from"] for e in graph["edges"]} | {e["to"] for e in graph["edges"]}
        orphans = node_ids - connected
        if orphans:
            print(f"     Warning: {len(orphans)} nodes have no connections")
        if len(graph["edges"]) < len(graph["nodes"]) * 1.5:
            print(f"     Warning: Graph may be sparse ({len(graph['edges'])} edges for {len(graph['nodes'])} nodes)")
