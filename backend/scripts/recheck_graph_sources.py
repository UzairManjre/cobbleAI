"""Recheck the links of existing concept maps that were flagged as having no source.

Maps built before the shared-passage check flagged a link unsupported when the AI's concept
names were worded differently from the slides, even if both concepts were verified in the same
passage. This applies that check to each course's latest map. No AI call is made, and links
that are already supported are left alone, so it is safe to re-run.

Usage (from backend/):
    python -m scripts.recheck_graph_sources              # every course
    python -m scripts.recheck_graph_sources --course <course_id>
    python -m scripts.recheck_graph_sources --dry-run
"""

import argparse
import asyncio
import uuid

from app.core.db import connect_to_mongo
from app.models.graph import GraphEdge, KnowledgeGraph
from app.services import graph_provenance as prov


async def recheck(course_id: str | None, dry_run: bool) -> None:
    await connect_to_mongo()
    query = KnowledgeGraph.find(KnowledgeGraph.course_id == uuid.UUID(course_id)) if course_id \
        else KnowledgeGraph.find(KnowledgeGraph.course_id != None)  # noqa: E711 (Beanie query syntax)
    latest = {}
    for graph in await query.sort(-KnowledgeGraph.created_at).to_list():
        latest.setdefault(graph.course_id, graph)  # the map students see is the newest one

    for cid, graph in latest.items():
        chunks = prov.load_course_chunks(str(cid))
        nodes, edges = graph.nodes_as_dicts(), graph.edges_as_dicts()
        before = sum(1 for e in edges if e["supported"] is False)
        fixed = prov.recheck_unsupported_edges(nodes, edges, chunks)
        print(f"course {cid}: {before} links without a source, {fixed} now supported by a shared passage")
        if fixed and not dry_run:
            graph.edges = [GraphEdge.model_validate(e) for e in edges]
            await graph.save()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--course", help="only this course id")
    parser.add_argument("--dry-run", action="store_true", help="report without saving")
    args = parser.parse_args()
    asyncio.run(recheck(args.course, args.dry_run))
