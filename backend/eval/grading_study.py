"""S5 grading agreement (RQ3) on public short-answer sets: grader v2 vs human scores.

Reports quadratic weighted kappa (in half-mark units, scores rescaled to the
item's maximum), MAE and exact agreement, overall and per item, plus how many
answers the grader would have routed to instructor review.
"""

import json
import random
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from app.models.test import Question
from app.services.grading_v2 import grade_free_text
from app.utils.stats import bootstrap_ci, exact_agreement, mae, quadratic_weighted_kappa
from eval.datasets import asap_sas_answers, mohler_answers
from eval.runner import RUNS_DIR, environment, _write_jsonl

def asap_prompts(path: Optional[Path] = None) -> dict:
    """ASAP-SAS train.tsv has no questions or rubrics; they are in the per-set descriptions that come
    with the data. Copy them into eval/data/asap_sas/prompts.json:
    {"1": {"question": "...", "rubric": ["...", "..."], "reference": "optional model answer"}, ...}.
    Grading without them would only measure guessing, so the study refuses to run."""
    from eval.datasets import DATA_DIR
    path = path or DATA_DIR / "asap_sas" / "prompts.json"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing: add each essay set's question and rubric from the ASAP-SAS descriptions "
            "(see eval/data/README.md) before running the ASAP grading study.")
    prompts = json.loads(path.read_text(encoding="utf-8"))
    incomplete = [k for k, v in prompts.items() if not v.get("question") or not v.get("rubric")]
    if incomplete:
        raise ValueError(f"ASAP prompts without a question or rubric: sets {', '.join(sorted(incomplete))}")
    return prompts


def _items(dataset: str, path: Optional[Path], prompts_path: Optional[Path] = None):
    if dataset == "mohler":
        return list(mohler_answers(path))
    if dataset == "asap":
        prompts = asap_prompts(prompts_path)
        rows = []
        for r in asap_sas_answers(path):
            p = prompts.get(str(r["question_id"]))
            if p is None:
                raise ValueError(f"No prompt and rubric for ASAP set {r['question_id']} in prompts.json")
            rows.append({**r, "question": p["question"], "rubric": p["rubric"], "reference": p.get("reference", "")})
        return rows
    raise ValueError("dataset must be mohler or asap")


def _agreement(rows: List[dict]) -> dict:
    if not rows:
        return {"n": 0}
    ai = [round(r["ai_score"] * 2) for r in rows]
    human = [round(r["human_score"] * 2) for r in rows]
    idx = list(range(len(rows)))
    return {
        "n": len(rows),
        "qwk": quadratic_weighted_kappa(ai, human),
        "qwk_ci": bootstrap_ci(idx, lambda s: quadratic_weighted_kappa([ai[i] for i in s], [human[i] for i in s]), n_resamples=500)
        if len(rows) >= 5 else None,
        "mae": mae([r["ai_score"] for r in rows], [r["human_score"] for r in rows]),
        "exact_agreement": exact_agreement(ai, human),
    }


async def run_grading_study(dataset: str, path: Optional[Path] = None, limit: Optional[int] = None,
                            seed: int = 13, runs_dir: Path = RUNS_DIR, prompts_path: Optional[Path] = None) -> Path:
    items = _items(dataset, path, prompts_path)
    random.Random(seed).shuffle(items)
    if limit:
        items = items[:limit]
    folder = runs_dir / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}_s5_grading_{dataset}"
    folder.mkdir(parents=True)
    (folder / "env.json").write_text(json.dumps(environment(None), indent=2), encoding="utf-8")

    rows = []
    for item in items:
        question = Question(id=uuid.uuid4(), type="short_answer", question_text=item["question"],
                            marks=item["max_score"], explanation=item.get("reference") or None,
                            rubric=item.get("rubric") or [])
        result = await grade_free_text(question, item["answer"])
        rows.append({
            "question_id": item["question_id"], "human_score": float(item["score"]), "max_score": item["max_score"],
            "ai_score": result.score, "confidence": result.confidence, "needs_review": result.needs_review,
            "samples": result.samples, "error": result.error,
        })
    _write_jsonl(folder / "outputs.jsonl", rows)

    scored = [r for r in rows if r["ai_score"] is not None]
    by_item = defaultdict(list)
    for r in scored:
        by_item[r["question_id"]].append(r)
    confident = [r for r in scored if not r["needs_review"]]
    metrics = {
        "dataset": dataset,
        "n_items": len(rows),
        "n_scored": len(scored),
        "routed_to_review": sum(1 for r in rows if r["needs_review"]),
        "overall": _agreement(scored),
        "auto_accepted_only": _agreement(confident),
        "per_item": {qid: _agreement(rs) for qid, rs in sorted(by_item.items())},
    }
    (folder / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return folder
