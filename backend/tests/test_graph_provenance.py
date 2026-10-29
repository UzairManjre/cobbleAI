"""Provenance knowledge graph (Upgrade D): verification, stable ids, additive enrichment, edge audit."""

import json
import uuid

import pytest

from app.models.course import Course
from app.models.graph import KnowledgeGraph
from app.services import graph_provenance as prov
from app.services.chunking import chunk_segments, index_chunks
from app.services.ingestion.segments import Segment

COURSE = str(uuid.uuid4())


def _chunks():
    return prov.chunks_from_payloads([
        {"text": "Recursion is when a function calls itself. A base case stops the recursion.", "doc_id": "d1",
         "filename": "notes.pdf", "chunk_id": "c1", "page_start": 2},
        {"text": "Merge sort uses recursion to sort each half of the list.", "doc_id": "d1",
         "filename": "notes.pdf", "chunk_id": "c2", "page_start": 5},
        {"text": "Today we trace recursion on the board with factorial.", "doc_id": "lec", "filename": "lec1.mp4",
         "chunk_id": "c3", "media_type": "lecture", "t_start": 120.0, "t_end": 165.0},
        {"text": "Hash tables store key value pairs.", "doc_id": "d2", "filename": "hash.pdf", "chunk_id": "c4", "page_start": 1},
    ])


def test_quote_and_mention_scores():
    text = "Recursion is when a function calls itself."
    assert prov.quote_score("a function calls itself", text) == 1.0
    assert prov.quote_score("a function calls ITSELF!", text) > 0.8
    assert prov.quote_score("hash tables store pairs", text) < 0.6
    assert prov.mention_score("Recursion", text) == 1.0
    assert prov.mention_score("BFS", "breadth first search") == 0.0  # short labels are not fuzzy-matched


def test_stable_ids_are_deterministic_and_case_insensitive():
    assert prov.stable_node_id(COURSE, "Merge Sort") == prov.stable_node_id(COURSE, "  merge   sort ")
    assert prov.stable_node_id(COURSE, "Merge Sort") != prov.stable_node_id(str(uuid.uuid4()), "Merge Sort")


def test_attach_provenance_verifies_quotes_and_flags_unsupported_edges():
    chunks = _chunks()
    concepts = [
        {"name": "Recursion", "description": "Self-calls", "evidence": [{"ref": "E1", "quote": "a function calls itself"}]},
        {"name": "Merge Sort", "description": "Divide and conquer", "evidence": [{"ref": "E1", "quote": "a quote that is not there at all"}]},
        {"name": "Hash Table", "description": "Key-value store"},
        {"name": "Quantum Tunnelling", "description": "Not in the course"},
    ]
    rels = [
        {"from": "Merge Sort", "to": "Recursion", "relation": "uses", "evidence": [{"ref": "E2", "quote": "Merge sort uses recursion"}]},
        {"from": "Recursion", "to": "Merge Sort", "relation": "enables"},  # no quote, but co-mentioned in E2
        {"from": "Hash Table", "to": "Recursion", "relation": "relates_to"},  # never discussed together
        {"from": "Merge Sort", "to": "Unknown Thing", "relation": "uses"},  # dangling: dropped
    ]
    nodes, edges = prov.attach_provenance(COURSE, concepts, rels, chunks)
    by_label = {n["label"]: n for n in nodes}

    recursion = by_label["Recursion"]
    assert recursion["supported"] and recursion["provenance"][0]["method"] == "quote"
    assert recursion["provenance"][0]["page"] == 2
    assert any(e["method"] == "lecture_moment" and e["t_start"] == 120.0 for e in recursion["provenance"])
    # A bad quote is discarded, but the concept is still found by mention
    assert by_label["Merge Sort"]["supported"] and by_label["Merge Sort"]["provenance"][0]["method"] == "mention"
    assert by_label["Quantum Tunnelling"]["supported"] is False and by_label["Quantum Tunnelling"]["provenance"] == []
    assert by_label["Hash Table"]["source_docs"] == ["hash.pdf"]

    assert len(edges) == 3
    uses, enables, unrelated = edges
    assert uses["supported"] and uses["provenance"][0]["method"] == "quote"
    assert enables["supported"] and enables["provenance"][0]["method"] == "co_mention"
    assert unrelated["supported"] is False and unrelated["provenance"] == []
    assert uses["from"] == prov.stable_node_id(COURSE, "Merge Sort")


#   Generator end to end

EXTRACTION = {
    "concepts": [
        {"name": "Recursion", "description": "A function calling itself.", "evidence": [{"ref": "E1", "quote": "function calls itself"}]},
        {"name": "Base Case", "description": "Stops recursion.", "evidence": [{"ref": "E1", "quote": "A base case stops the recursion"}]},
        {"name": "Merge Sort", "description": "Sorts halves recursively.", "evidence": [{"ref": "E2", "quote": "Merge sort uses recursion"}]},
    ],
    "relationships": [
        {"from": "Base Case", "to": "Recursion", "relation": "is_part_of", "evidence": [{"ref": "E1", "quote": "A base case stops the recursion"}]},
        {"from": "Merge Sort", "to": "Recursion", "relation": "depends_on", "evidence": [{"ref": "E2", "quote": "Merge sort uses recursion"}]},
    ],
}


def _index_course(course_id):
    segments = [
        Segment(text="Recursion is when a function calls itself. A base case stops the recursion.", source_type="pdf_page", page=2),
        Segment(text="Merge sort uses recursion to sort each half of the list.", source_type="pdf_page", page=5),
    ]
    chunks, summaries = chunk_segments(segments, doc_id="notes", min_chunk=1, chunk_size=15)
    index_chunks(chunks, course_id, "notes", "notes.pdf", summaries=summaries)


async def test_generator_builds_provenance_graph_with_stable_ids(qdrant_memory, fake_llm):
    from app.services.advanced_graph_generator import AdvancedGraphGenerator
    course_id = str(uuid.uuid4())
    _index_course(course_id)

    enrichment = {"difficulty": {"Recursion": "beginner", "Merge Sort": "advanced"},
                  "new_relationships": [{"from": "Merge Sort", "to": "Base Case", "relation": "uses"},
                                        {"from": "Merge Sort", "to": "Invented Concept", "relation": "uses"}]}
    fake_llm.queue(json.dumps(EXTRACTION), json.dumps(enrichment))
    first = await AdvancedGraphGenerator().generate_from_course(course_id)

    labels = {n["label"]: n for n in first["nodes"]}
    assert set(labels) == {"Recursion", "Base Case", "Merge Sort"}
    assert labels["Recursion"]["difficulty"] == "beginner" and labels["Merge Sort"]["difficulty"] == "advanced"
    assert all(n["supported"] for n in first["nodes"])
    added = [e for e in first["edges"] if e["relation"] == "uses"]
    assert len(added) == 1  # the invented concept was ignored
    assert first["_source_docs"] == ["notes.pdf"]

    # The stored graph accepts the LLM's unknown relation name (coerced to relates_to)
    graph = KnowledgeGraph(topic="t", course_id=uuid.UUID(course_id), created_by=uuid.uuid4(),
                           nodes=first["nodes"], edges=first["edges"])
    assert {e.relation.value for e in graph.edges} >= {"is_part_of", "relates_to"}

    # Regenerating yields the same node ids, even when enrichment returns junk
    fake_llm.queue(json.dumps(EXTRACTION), "not json at all")
    second = await AdvancedGraphGenerator().generate_from_course(course_id)
    assert {n["id"] for n in second["nodes"]} == {n["id"] for n in first["nodes"]}
    assert len(second["nodes"]) == 3  # enrichment can never drop concepts


#   Edge audit API

async def test_edge_audit_sample_verdicts_and_report(make_user, api_client):
    professor = await make_user("professor")
    course = Course(professor_id=professor.id, title="Algo", code="A")
    await course.insert()
    nodes = [{"id": f"n{i}", "label": f"Concept {i}"} for i in range(4)]
    edges = [
        {"id": "e0", "from": "n0", "to": "n1", "relation": "uses", "supported": True},
        {"id": "e1", "from": "n1", "to": "n2", "relation": "uses", "supported": True},
        {"id": "e2", "from": "n2", "to": "n3", "relation": "builds_on", "supported": False},
        {"id": "e3", "from": "n0", "to": "n3", "relation": "builds_on", "supported": True},
    ]
    graph = KnowledgeGraph(topic="t", course_id=course.id, created_by=professor.id, nodes=nodes, edges=edges)
    await graph.insert()

    async with api_client(professor) as client:
        res = await client.post(f"/api/professor/graph/{graph.id}/audit-sample", params={"n": 3})
        sample = res.json()["items"]
        assert len(sample) == 3 and {s["relation"] for s in sample} == {"uses", "builds_on"}
        assert sample[0]["from_label"].startswith("Concept")
        for item in sample:
            verdict = "incorrect" if item["supported"] is False else "correct"
            res = await client.patch(f"/api/professor/graph/{graph.id}/edges/{item['id']}/audit", json={"status": verdict})
            assert res.json()["audit"]["status"] == verdict
        bad = await client.patch(f"/api/professor/graph/{graph.id}/edges/e0/audit", json={"status": "maybe"})
        assert bad.status_code == 400
        report = (await client.get(f"/api/professor/graph/{graph.id}/audit-report")).json()

    assert report["judged"] == 3 and report["edges_unsupported"] == 1
    assert report["precision_supported"]["value"] == 1.0
    if report["precision_unsupported"]["n"]:
        assert report["precision_unsupported"]["value"] == 0.0
    assert 0 <= report["precision"]["ci_low"] <= report["precision"]["value"] <= report["precision"]["ci_high"] <= 1
    est = report["precision_estimate"]
    assert 0 <= est["ci_low"] <= est["value"] <= est["ci_high"] <= 1 and 0 < est["coverage"] <= 1


async def test_student_cannot_audit(make_user, api_client):
    professor = await make_user("professor")
    student = await make_user("student")
    graph = KnowledgeGraph(topic="t", created_by=professor.id, nodes=[], edges=[])
    await graph.insert()
    async with api_client(student) as client:
        res = await client.get(f"/api/professor/graph/{graph.id}/audit-report")
    assert res.status_code == 403



def test_stratified_precision_weights_strata_by_size():
    # 9 supported edges (sample: 1 judged, correct) and 1 unsupported edge (judged, incorrect).
    # The pooled sample says 50%; weighted by stratum size the graph estimate is 90%.
    from app.models.graph import EdgeAudit, GraphEdge, GraphNode, KnowledgeGraph
    from app.services.graph_audit import stratified_precision
    nodes = [GraphNode(id=f"n{i}", label=f"N{i}") for i in range(11)]
    edges = [GraphEdge(id=f"e{i}", source="n0", target=f"n{i + 1}", relation="relates_to", supported=i < 9) for i in range(10)]
    edges[0].audit = EdgeAudit(status="correct")
    edges[9].audit = EdgeAudit(status="incorrect")
    graph = KnowledgeGraph(topic="t", created_by=uuid.uuid4(), nodes=nodes, edges=edges)
    est = stratified_precision(graph, [edges[0], edges[9]])
    assert est["value"] == pytest.approx(0.9) and est["coverage"] == 1.0
