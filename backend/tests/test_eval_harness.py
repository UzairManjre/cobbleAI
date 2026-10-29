"""Evaluation harness: metrics, gold validation, reproducible runs, simulation and rating import."""

import csv
import json
import uuid

import pytest

from app.models.course import Course
from app.services.chunking import chunk_segments, index_chunks
from app.services.ingestion.segments import Segment
from eval.experiment import ExperimentConfig
from eval.gold import GoldSource, load_gold
from eval.metrics.generation import decision_metrics
from eval.metrics.retrieval import ndcg_at_k, reciprocal_rank, recall_at_k, retrieval_metrics, source_matches
from eval.metrics.stats import bootstrap_ci, quadratic_weighted_kappa, wilson_interval
from eval.metrics.wer import word_error_rate
from eval.runner import aggregate, read_jsonl, report, run_experiment
from eval.simulate import SimulationConfig, import_ratings, run_simulation


#   Metrics

def test_source_matching_by_page_slide_and_timestamp():
    page = {"filename": "notes.pdf", "page_start": 3, "page_end": 5}
    assert source_matches(page, GoldSource(filename="NOTES.pdf", page=4))
    assert not source_matches(page, GoldSource(filename="notes.pdf", page=6))
    assert source_matches({"doc_id": "d", "slide_start": 2, "slide_end": 2}, GoldSource(doc_id="d", slide=2))
    clip = {"doc_id": "lec", "t_start": 100.0, "t_end": 140.0}
    assert source_matches(clip, GoldSource(doc_id="lec", t_start=160, t_end=200))  # within 30 s
    assert not source_matches(clip, GoldSource(doc_id="lec", t_start=175, t_end=200))


def test_ranking_metrics_by_hand():
    gold = [GoldSource(filename="a.pdf", page=1)]
    ranked = [{"filename": "b.pdf", "page_start": 1}, {"filename": "a.pdf", "page_start": 1}]
    assert reciprocal_rank(ranked, gold) == 0.5
    assert recall_at_k(ranked, gold, k=1) == 0.0 and recall_at_k(ranked, gold, k=2) == 1.0
    assert ndcg_at_k(ranked, gold, k=2) == pytest.approx(1 / 1.5849625, rel=1e-6)
    lecture = retrieval_metrics([{"doc_id": "lec", "t_start": 10, "t_end": 20}], [GoldSource(doc_id="lec", t_start=300)])
    assert lecture["video_hit"] == 1.0 and lecture["timestamp_hit@30s"] == 0.0


def test_stats_helpers():
    from sklearn.metrics import cohen_kappa_score
    a, b = [0, 1, 2, 3, 3, 2], [0, 1, 1, 3, 2, 2]
    assert quadratic_weighted_kappa(a, b) == pytest.approx(cohen_kappa_score(a, b, weights="quadratic"))
    ci = bootstrap_ci([1, 0, 1, 1, 0, 1, 1, 1])
    assert ci["ci_low"] <= ci["value"] <= ci["ci_high"] and ci["n"] == 8
    assert bootstrap_ci([1, 0, 1]) == bootstrap_ci([1, 0, 1])  # seeded, reproducible
    w = wilson_interval(7, 9)
    assert w["value"] == pytest.approx(7 / 9) and 0.4 < w["ci_low"] < 0.5


def test_word_error_rate_normalises_case_and_punctuation():
    out = word_error_rate("Merge sort splits the list.", "merge sort split the list [inaudible]")
    assert out["wer"] == pytest.approx(1 / 5)


def test_decision_metrics():
    m = decision_metrics([
        {"answerable": False, "decision": "declined"},
        {"answerable": False, "decision": "answered"},
        {"answerable": True, "decision": "answered"},
        {"answerable": True, "decision": "declined"},
    ])
    assert m["correct_decline_rate"] == 0.5 and m["false_decline_rate"] == 0.5 and m["decision_accuracy"] == 0.5


def test_gold_validation(tmp_path):
    bad = tmp_path / "bad.jsonl"
    bad.write_text(json.dumps({"qid": "x", "course_id": "c", "question": "q", "answerable": True}) + "\n")
    with pytest.raises(ValueError, match="gold source"):
        load_gold([bad])
    items = load_gold(["eval/gold/example.jsonl"])
    assert {i.qtype for i in items} == {"procedural", "lecture", "factual"}


#   End-to-end runs

class FakeJudge:
    def describe(self):
        return {"model": "fake-judge"}

    async def complete(self, system, user, max_tokens=1024):
        return "So merge sort divides the list into two halves first?"

    async def decompose_claims(self, answer):
        return [s for s in answer.split(".") if s.strip()][:2]

    async def verify_claims(self, claims, context):
        return [any(w in context.lower() for w in c.lower().split() if len(w) > 4) for c in claims]

    async def chunk_relevant(self, question, reference, chunk):
        return "merge" in chunk.lower()

    async def answer_correctness(self, question, reference, answer):
        return 1.0 if "halves" in answer else 0.0

    async def questions_from_answer(self, answer, n=3):
        return ["How does merge sort work?"]

    async def pedagogy_rubric(self, question, reference, reply, hint_level):
        return {"scaffolding": 4, "correctness": 5, "leaked": False, "rationale": "ok"}


@pytest.fixture
def eval_course(qdrant_memory, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RETRIEVAL_PRESET", "no_expansion")

    async def _setup(tmp_path):
        course = Course(professor_id=uuid.uuid4(), title="Algo", code="A1")
        await course.insert()
        segments = [
            Segment(text="Merge sort divides the list into two halves and merges the sorted halves.", source_type="pdf_page", page=12),
            Segment(text="Binary search halves the search interval each step.", source_type="pdf_page", page=20),
        ]
        chunks, summaries = chunk_segments(segments, doc_id="notes", min_chunk=1, chunk_size=14)
        index_chunks(chunks, str(course.id), "notes", "week3-sorting.pdf", summaries=summaries)
        gold = tmp_path / "gold.jsonl"
        rows = [
            {"qid": "g1", "course_id": str(course.id), "question": "How does merge sort divide the list into halves?",
             "qtype": "procedural", "expected_answer": "It splits it into two halves.",
             "gold_sources": [{"filename": "week3-sorting.pdf", "page": 12}], "split": "test"},
            {"qid": "g2", "course_id": str(course.id), "question": "How does binary search halve the interval?",
             "qtype": "factual", "gold_sources": [{"filename": "week3-sorting.pdf", "page": 20}], "split": "test"},
            {"qid": "g3", "course_id": str(course.id), "question": "Who painted the Mona Lisa?", "qtype": "factual",
             "answerable": False, "split": "test"},
        ]
        gold.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
        return course, gold
    return _setup


async def test_run_experiment_logs_everything_and_report_reproduces_it(eval_course, tmp_path, fake_llm):
    course, gold = await eval_course(tmp_path)
    fake_llm.default = "Merge sort splits the list into halves [S1]."
    config = ExperimentConfig(name="t_hybrid", gold=[str(gold)], retrieval={"preset": "no_expansion"})
    folders = await run_experiment(config, judge=FakeJudge(), runs_dir=tmp_path / "runs", init_db=False)
    folder = folders[0]

    for name in ("config.json", "env.json", "inputs.jsonl", "outputs.jsonl", "metrics.json"):
        assert (folder / name).exists()
    config_logged = json.loads((folder / "config.json").read_text())
    assert config_logged["retrieval"]["name"] == "no_expansion" and config_logged["retrieval_config_hash"]

    outputs = {o["qid"]: o for o in read_jsonl(folder / "outputs.jsonl")}
    assert outputs["g1"]["metrics"]["hit@5"] == 1.0 and outputs["g1"]["metrics"]["mrr"] == 1.0
    assert outputs["g1"]["decision"] == "answered" and outputs["g1"]["cited_sids"] == ["S1"]
    assert outputs["g1"]["metrics"]["correctness"] == 1.0 and "faithfulness" in outputs["g1"]["metrics"]
    assert outputs["g3"]["decision"] == "declined"
    assert outputs["g1"]["sources"][0]["signals"]["bm25"] > 0

    metrics = json.loads((folder / "metrics.json").read_text())
    assert metrics["decisions"]["correct_decline_rate"] == 1.0
    assert metrics["metrics"]["hit@5"]["value"] == 1.0
    rebuilt = report(folder)
    assert rebuilt["metrics"] == json.loads(json.dumps(metrics["metrics"]))


async def test_sweep_writes_one_run_per_combination(eval_course, tmp_path):
    course, gold = await eval_course(tmp_path)
    config = ExperimentConfig(
        name="t_sweep", gold=[str(gold)], retrieval={"preset": "no_expansion"},
        generation={"enabled": False}, judge={"enabled": False}, sweep={"w_bm25": [0.0, 0.5]},
    )
    folders = await run_experiment(config, runs_dir=tmp_path / "runs", init_db=False)
    assert len(folders) == 2
    weights = sorted(json.loads((f / "config.json").read_text())["retrieval"]["w_bm25"] for f in folders)
    assert weights == [0.0, 0.5]
    # Retrieval-only runs still log decisions? No: nothing was generated
    assert all(json.loads((f / "metrics.json").read_text())["decisions"] is None for f in folders)


async def test_simulation_and_rating_import(eval_course, tmp_path, fake_llm):
    course, gold = await eval_course(tmp_path)
    fake_llm.default = "What happens when you split the list in half? [S1]"
    config = SimulationConfig(name="t_s2", gold=[str(gold)], split="test", limit=1, turns=2,
                              personas=[{"id": "confused", "description": "unsure"}])
    folder = await run_simulation(config, judge=FakeJudge(), runs_dir=tmp_path / "runs", init_db=False)

    turns = read_jsonl(folder / "turns.jsonl")
    assert [t["turn"] for t in turns] == [1, 2]
    assert turns[1]["student"] == "So merge sort divides the list into two halves first?"
    metrics = json.loads((folder / "metrics.json").read_text())
    assert metrics["scaffolding"]["value"] == 4 and metrics["answer_leakage_rate"]["value"] == 0.0

    with (folder / "ratings_template.csv").open() as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 2
    rated = tmp_path / "rated.csv"
    with rated.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "human_scaffolding_1to5": "4", "human_correctness_1to5": "5", "human_leaked_yes_no": "no"})
    agreement = import_ratings(folder, rated)
    assert agreement["scaffolding"]["exact_agreement"] == 1.0 and agreement["leaked"]["n"] == 2


def test_aggregate_skips_judge_errors_and_non_numeric_values():
    from eval.runner import aggregate
    outputs = [
        {"qid": "a", "qtype": "factual", "answerable": True, "decision": "answered", "metrics": {"faithfulness": 1.0}},
        {"qid": "b", "qtype": "factual", "answerable": True, "decision": "answered", "metrics": {"faithfulness": 0.5},
         "judge_error": "judge timed out"},
        # A run log written before the fix kept the error inside the metrics
        {"qid": "c", "qtype": "factual", "answerable": True, "decision": "answered", "metrics": {"judge_error": "boom"}},
    ]
    report = aggregate(outputs)
    assert "judge_error" not in report["metrics"]
    assert report["metrics"]["faithfulness"]["n"] == 2


def test_kappa_is_not_reported_when_a_rater_has_no_spread():
    import math
    from app.utils.stats import cohen_kappa
    # The instructor gave every answer full marks: kappa would be 0 by construction, which says nothing
    assert math.isnan(quadratic_weighted_kappa([10, 10, 9], [10, 10, 10]))
    assert math.isnan(cohen_kappa([1, 1], [1, 1]))
    ci = bootstrap_ci(list(range(6)), lambda s: quadratic_weighted_kappa([[1, 2, 3, 1, 2, 3][i] for i in s], [[1, 2, 3, 1, 2, 2][i] for i in s]), n_resamples=200)
    assert 0 <= ci["ci_low"] <= ci["ci_high"] <= 1
