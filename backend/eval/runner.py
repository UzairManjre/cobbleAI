"""Run an experiment over a gold set and log everything needed to reproduce its numbers.

Each run writes eval/runs/<timestamp>_<name>_<hash>/ with:
    config.json    experiment + fully resolved retrieval config
    env.json       git commit, models, feature flags, judge, Python/platform
    inputs.jsonl   the gold items used
    outputs.jsonl  per item: retrieved sources with signals, answer, decision, citations, metrics
    metrics.json   aggregates with bootstrap 95% CIs (rebuildable with `eval.cli report`)
"""

import json
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from app.core.config import settings
from app.services.retrieval.config import RetrievalConfig
from app.services.retrieval.hybrid import chunk_to_source, format_context, retrieve
from eval.experiment import ExperimentConfig
from eval.gold import GoldItem, load_gold
from eval.judge import Judge
from eval.metrics import generation as gen_metrics
from eval.metrics.retrieval import retrieval_metrics
from eval.metrics.stats import bootstrap_ci

RUNS_DIR = Path(__file__).parent / "runs"

BASELINE_PROMPT = (
    "You are a tutor for a university course. Answer the student's question clearly and concisely."
)


def _git_commit() -> Optional[str]:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=Path(__file__).parent,
                                       stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return None


def environment(judge: Optional[Judge]) -> dict:
    return {
        "git_commit": _git_commit(),
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "llm_model": settings.LLM_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
        "reranker_model": settings.RERANKER_MODEL,
        "flags": {f: getattr(settings, f) for f in ("HYBRID_RETRIEVAL", "RETRIEVAL_PRESET", "CITE_OR_DECLINE")},
        "judge": judge.describe() if judge else None,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


def _write_jsonl(path: Path, rows: List[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, default=str) + "\n")


def read_jsonl(path: Path) -> List[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


#   Aggregation (also used by `report`, so numbers always come from the logged outputs)

def aggregate(outputs: List[dict], seed: int = 13) -> dict:
    metrics: Dict[str, dict] = {}
    answerable = [o for o in outputs if o["answerable"]]

    def collect(rows, key):
        # Numbers only: older run logs stored judge errors as strings inside `metrics`
        return [r["metrics"][key] for r in rows
                if isinstance(r["metrics"].get(key), (int, float)) and not isinstance(r["metrics"].get(key), bool)]

    keys = sorted({k for o in outputs for k in o["metrics"]})
    for key in keys:
        rows = answerable if key not in ("latency_ms",) else outputs
        values = collect(rows, key)
        if values:
            metrics[key] = bootstrap_ci(values, seed=seed)

    by_qtype = {}
    for qtype in sorted({o["qtype"] for o in answerable}):
        rows = [o for o in answerable if o["qtype"] == qtype]
        by_qtype[qtype] = {k: bootstrap_ci(collect(rows, k), seed=seed) for k in keys if collect(rows, k)}

    decisions = [o for o in outputs if o.get("decision")]
    return {
        "n_items": len(outputs),
        "n_answerable": len(answerable),
        "metrics": metrics,
        "by_qtype": by_qtype,
        "decisions": gen_metrics.decision_metrics(decisions) if decisions else None,
    }


#   Running

async def _judge_metrics(judge: Judge, spec, item: GoldItem, answer: str, contexts: List[str]) -> dict:
    out = {}
    context = "\n\n".join(contexts)
    try:
        if "faithfulness" in spec.metrics and contexts:
            out["faithfulness"] = await gen_metrics.faithfulness(judge, answer, context)
        if "context_precision" in spec.metrics and contexts:
            out["context_precision"] = await gen_metrics.context_precision(judge, item.question, item.expected_answer or "", contexts)
        if "answer_relevancy" in spec.metrics:
            out["answer_relevancy"] = await gen_metrics.answer_relevancy(judge, item.question, answer)
        if "correctness" in spec.metrics and item.expected_answer:
            out["correctness"] = await judge.answer_correctness(item.question, item.expected_answer, answer)
    except Exception as e:
        return {k: v for k, v in out.items() if v is not None}, str(e)[:300]
    return {k: v for k, v in out.items() if v is not None}, None


async def run_item(item: GoldItem, config: ExperimentConfig, retrieval_config: RetrievalConfig,
                   engine=None, judge: Optional[Judge] = None, run_name: str = "") -> dict:
    started = time.perf_counter()
    row = {"qid": item.qid, "qtype": item.qtype, "answerable": item.answerable, "question": item.question,
           "metrics": {}, "decision": None, "answer": None}
    gen = config.generation
    contexts: List[str] = []

    if gen.enabled and gen.rag:
        from app.services.tutor_engine import TutorRequest
        from app.services.tutor_policy import EffectivePolicy
        prepared, outcome, timings = await engine.answer_once(TutorRequest(
            question=item.question, course_id=item.course_id, mode=gen.mode,
            hint_level=gen.hint_level, retrieval_config=retrieval_config,
            policy=EffectivePolicy(),  # the experiment config, not the course's live policy, decides
        ))
        sources = prepared.sources
        contexts = [c.text for c in prepared.retrieval.chunks]
        row["policy"] = prepared.policy.to_dict()
        row.update(decision=outcome.decision, decline_reason=outcome.decline_reason, answer=outcome.answer,
                   cited_sids=outcome.cited_sids, support=outcome.support, hint_level=prepared.hint_level,
                   top_support=prepared.retrieval.top_support, timings_ms=timings)
        row["metrics"]["citation_rate"] = 1.0 if outcome.cited_sids else 0.0
        if outcome.cited_sids:
            cited = [s for s in sources if s["sid"] in outcome.cited_sids]
            row["metrics"]["citation_precision"] = (
                sum(1 for s in cited if retrieval_metrics([s], item.gold_sources, 1)["hit@1"]) / len(cited)
            ) if item.gold_sources else None
    else:
        result = await retrieve(item.question, item.course_id, retrieval_config)
        sources = [chunk_to_source(c) for c in result.chunks]
        contexts = [c.text for c in result.chunks]
        row["top_support"] = result.top_support
        row["timings_ms"] = result.timings_ms
        if gen.enabled:  # no-RAG baseline
            from app.services.llm import LLMAdapter
            answer = await LLMAdapter().generate_full_response(
                system=BASELINE_PROMPT, messages=[{"role": "user", "content": item.question}], max_tokens=1024)
            from app.utils.llm_text import split_thinking
            row.update(decision="answered", answer=split_thinking(answer)[0])
            contexts = []  # the baseline saw no context

    row["sources"] = sources
    if item.answerable and item.gold_sources:
        row["metrics"].update(retrieval_metrics(sources, item.gold_sources, retrieval_config.top_k))
    if judge and config.judge.enabled and row.get("answer") and row.get("decision") == "answered" and item.answerable:
        judged, judge_error = await _judge_metrics(judge, config.judge, item, row["answer"], contexts)
        row["metrics"].update(judged)
        if judge_error:  # kept beside the metrics: a string inside them would break aggregation
            row["judge_error"] = judge_error
    row["metrics"] = {k: v for k, v in row["metrics"].items() if v is not None}
    row["metrics"]["latency_ms"] = int((time.perf_counter() - started) * 1000)
    return row


async def run_experiment(config: ExperimentConfig, *, engine=None, judge: Optional[Judge] = None,
                         runs_dir: Path = RUNS_DIR, init_db: bool = True, log_runs: bool = True) -> List[Path]:
    """Run every variant of an experiment; returns the run folders."""
    if init_db:
        from app.core.db import connect_to_mongo
        await connect_to_mongo()
    items = load_gold(config.gold, split=config.split, qtypes=config.qtypes)
    if config.limit:
        items = items[: config.limit]
    if not items:
        raise ValueError("no gold items selected (check gold paths, split and qtypes)")

    if engine is None and config.generation.enabled and config.generation.rag:
        from app.services.tutor_engine import TutorEngine
        engine = TutorEngine()
    if judge is None and config.judge.enabled and config.generation.enabled:
        judge = Judge(base_url=config.judge.base_url, model=config.judge.model, seed=config.seed)

    folders = []
    for variant, retrieval_config in config.variants():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        folder = runs_dir / f"{stamp}_{variant}_{config.run_hash(retrieval_config)}"
        folder.mkdir(parents=True, exist_ok=False)
        (folder / "config.json").write_text(json.dumps({
            "experiment": config.model_dump(), "variant": variant,
            "retrieval": retrieval_config.model_dump(), "retrieval_config_hash": retrieval_config.config_hash(),
        }, indent=2, default=str), encoding="utf-8")
        (folder / "env.json").write_text(json.dumps(environment(judge), indent=2), encoding="utf-8")
        _write_jsonl(folder / "inputs.jsonl", [i.model_dump() for i in items])

        outputs = []
        for n, item in enumerate(items, start=1):
            row = await run_item(item, config, retrieval_config, engine, judge, folder.name)
            outputs.append(row)
            print(f"  [{variant}] {n}/{len(items)} {item.qid}: "
                  + ", ".join(f"{k}={v:.3f}" for k, v in row["metrics"].items() if isinstance(v, float)))
            if log_runs and init_db and row.get("answer") is not None:
                await _log_eval_run(row, item, folder.name, retrieval_config)
        _write_jsonl(folder / "outputs.jsonl", outputs)
        summary = aggregate(outputs, seed=config.seed)
        (folder / "metrics.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
        folders.append(folder)
        print(f"  wrote {folder}")
    return folders


async def _log_eval_run(row: dict, item: GoldItem, run_name: str, retrieval_config: RetrievalConfig) -> None:
    import uuid
    from app.services.run_log import log_tutor_run
    try:
        course_id = uuid.UUID(item.course_id)
    except ValueError:
        course_id = None
    await log_tutor_run(
        None, endpoint="eval", eval_run=run_name, course_id=course_id, question=item.question,
        decision=row.get("decision") or "answered", answer=row.get("answer") or "",
        sources=row.get("sources", []), top_support=row.get("top_support", 0.0),
        retrieval_config=retrieval_config.model_dump(), config_hash=retrieval_config.config_hash(),
        hint_level=row.get("hint_level"), cited_sids=row.get("cited_sids", []), latency_ms=row.get("timings_ms", {}),
    )


def report(folder: Path) -> dict:
    """Recompute aggregates from the logged outputs alone."""
    outputs = read_jsonl(folder / "outputs.jsonl")
    config = json.loads((folder / "config.json").read_text(encoding="utf-8"))
    return {"run": folder.name, "variant": config.get("variant"), **aggregate(outputs, seed=config["experiment"].get("seed", 13))}


def format_report(summaries: List[dict]) -> str:
    """Markdown table: one row per run, value [95% CI] per metric."""
    keys = sorted({k for s in summaries for k in s["metrics"]})
    lines = ["| run | n | " + " | ".join(keys) + " |", "|---|---|" + "---|" * len(keys)]
    for s in summaries:
        cells = []
        for k in keys:
            m = s["metrics"].get(k)
            cells.append("—" if not m else f"{m['value']:.3f} [{m['ci_low']:.3f}, {m['ci_high']:.3f}]")
        lines.append(f"| {s['variant'] or s['run']} | {s['n_answerable']} | " + " | ".join(cells) + " |")
    decisions = [s for s in summaries if s.get("decisions")]
    if decisions:
        lines += ["", "| run | correct decline | false decline | decision accuracy |", "|---|---|---|---|"]
        for s in decisions:
            d = s["decisions"]
            fmt = lambda v: "—" if v is None else f"{v:.3f}"
            lines.append(f"| {s['variant'] or s['run']} | {fmt(d['correct_decline_rate'])} | {fmt(d['false_decline_rate'])} | {fmt(d['decision_accuracy'])} |")
    return "\n".join(lines)
