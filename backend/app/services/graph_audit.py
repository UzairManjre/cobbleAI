"""Edge-quality audit for the provenance graph (O4): sample, judge, report precision."""

import random
from collections import defaultdict
from datetime import datetime, timezone
from typing import List

from fastapi import HTTPException

from app.models.graph import EdgeAudit, KnowledgeGraph
from app.utils.stats import wilson_interval


def stratified_sample(graph: KnowledgeGraph, n: int, seed: int = 13) -> List:
    """Up to n edges, spread across (relation, supported) strata so rare relations and
    unsupported edges are represented. Already-sampled edges are kept in the sample."""
    already = [e for e in graph.edges if e.audit is not None]
    remaining = max(0, n - len(already))
    strata = defaultdict(list)
    for edge in graph.edges:
        if edge.audit is None:
            strata[(edge.relation.value, bool(edge.supported))].append(edge)
    rng = random.Random(seed)
    for edges in strata.values():
        rng.shuffle(edges)
    picked = []
    keys = sorted(strata)
    while remaining > 0 and any(strata[k] for k in keys):
        for key in keys:
            if remaining == 0:
                break
            if strata[key]:
                picked.append(strata[key].pop())
                remaining -= 1
    for edge in picked:
        edge.audit = EdgeAudit()
    return already + picked


def record_verdict(graph: KnowledgeGraph, edge_id: str, status: str, note, reviewer_id) -> None:
    if status not in ("correct", "incorrect", "unreviewed"):
        raise HTTPException(status_code=400, detail="status must be correct, incorrect or unreviewed")
    edge = next((e for e in graph.edges if e.id == edge_id), None)
    if edge is None:
        raise HTTPException(status_code=404, detail="Edge not found")
    edge.audit = EdgeAudit(status=status, note=note, reviewer_id=reviewer_id,
                           reviewed_at=datetime.now(timezone.utc) if status != "unreviewed" else None)


def _stratum(edge) -> tuple:
    return (edge.relation.value, bool(edge.supported))


def stratified_precision(graph: KnowledgeGraph, judged: List) -> dict:
    """Precision of the whole graph, estimated from the stratified sample: each (relation, supported)
    stratum's precision weighted by its share of all edges. The sample over-represents rare strata,
    so the pooled sample precision is biased. Strata with no judged edge are left out and reported."""
    import math
    population = defaultdict(int)
    for edge in graph.edges:
        population[_stratum(edge)] += 1
    by_stratum = defaultdict(list)
    for edge in judged:
        by_stratum[_stratum(edge)].append(edge)
    covered = sum(population[k] for k in by_stratum)
    if not covered:
        return {"value": float("nan"), "ci_low": float("nan"), "ci_high": float("nan"), "n": 0, "coverage": 0.0}
    value, variance = 0.0, 0.0
    for key, edges in by_stratum.items():
        weight = population[key] / covered
        n, big_n = len(edges), population[key]
        p = sum(1 for e in edges if e.audit.status == "correct") / n
        value += weight * p
        fpc = (big_n - n) / (big_n - 1) if big_n > 1 else 0.0  # finite population correction
        variance += weight * weight * fpc * p * (1 - p) / n
    half = 1.96 * math.sqrt(variance)
    return {"value": value, "ci_low": max(0.0, value - half), "ci_high": min(1.0, value + half), "n": len(judged),
            "coverage": covered / len(graph.edges)}


def audit_report(graph: KnowledgeGraph) -> dict:
    judged = [e for e in graph.edges if e.audit and e.audit.status in ("correct", "incorrect")]

    def precision(edges):
        return wilson_interval(sum(1 for e in edges if e.audit.status == "correct"), len(edges))

    by_relation = defaultdict(list)
    for edge in judged:
        by_relation[edge.relation.value].append(edge)
    return {
        "graph_id": str(graph.id),
        "edges_total": len(graph.edges),
        "edges_unsupported": sum(1 for e in graph.edges if e.supported is False),
        "sampled": sum(1 for e in graph.edges if e.audit is not None),
        "judged": len(judged),
        "precision": precision(judged),
        "precision_estimate": stratified_precision(graph, judged),
        "precision_supported": precision([e for e in judged if e.supported]),
        "precision_unsupported": precision([e for e in judged if e.supported is False]),
        "by_relation": {rel: precision(edges) for rel, edges in sorted(by_relation.items())},
        "note": ("precision: on the instructor-judged sample (95% Wilson interval). precision_estimate: for the "
                 "whole graph, each sampled (relation, supported) stratum weighted by its share of edges "
                 "(95% normal interval); coverage is the share of edges in strata that were judged."),
    }
