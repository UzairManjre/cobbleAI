"""Evaluation harness CLI (run from backend/).

    python -m eval.cli run --config eval/configs/s1_hybrid.yaml
    python -m eval.cli report eval/runs/<run_a> eval/runs/<run_b>
    python -m eval.cli simulate --config eval/configs/s2_pedagogy.yaml
    python -m eval.cli import-ratings eval/runs/<sim_run> ratings.csv
    python -m eval.cli wer --reference corrected.txt --hypothesis transcript.txt
    python -m eval.cli draft-gold --course <course_id> --n 30 --out eval/gold/drafts/<course>.jsonl
    python -m eval.cli validate-gold eval/gold/<course>.jsonl
"""

import argparse
import asyncio
import json
from pathlib import Path


def _cmd_run(args):
    from eval.experiment import ExperimentConfig
    from eval.runner import run_experiment
    config = ExperimentConfig.load(args.config)
    if args.limit:
        config.limit = args.limit
    folders = asyncio.run(run_experiment(config))
    _cmd_report(argparse.Namespace(runs=[str(f) for f in folders], json=False))


def _cmd_report(args):
    from eval.runner import format_report, report
    summaries = [report(Path(r)) for r in args.runs]
    print(json.dumps(summaries, indent=2, default=str) if args.json else format_report(summaries))


def _cmd_simulate(args):
    from eval.simulate import SimulationConfig, run_simulation
    folder = asyncio.run(run_simulation(SimulationConfig.load(args.config)))
    print((folder / "metrics.json").read_text(encoding="utf-8"))


def _cmd_import_ratings(args):
    from eval.simulate import import_ratings
    print(json.dumps(import_ratings(Path(args.run), Path(args.csv)), indent=2))


def _cmd_wer(args):
    from eval.metrics.wer import word_error_rate
    ref = Path(args.reference).read_text(encoding="utf-8")
    hyp = Path(args.hypothesis).read_text(encoding="utf-8")
    print(json.dumps(word_error_rate(ref, hyp), indent=2))


def _cmd_validate_gold(args):
    from collections import Counter
    from eval.gold import load_gold
    items = load_gold(args.paths)
    print(f"{len(items)} valid items")
    print("splits:", dict(Counter(i.split for i in items)))
    print("types:", dict(Counter(i.qtype for i in items)))
    print("answerable:", sum(i.answerable for i in items), "unanswerable:", sum(not i.answerable for i in items))
    print("instructor-reviewed:", sum(i.reviewed_by_instructor for i in items))


def _cmd_kt(args):
    from datetime import datetime
    from eval.kt import run_kt_study, save_global_bkt, write_report
    from eval.runner import RUNS_DIR
    result = run_kt_study(Path(args.data) if args.data else None, seed=args.seed)
    out = RUNS_DIR / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}_s3_knowledge_tracing" / "metrics.json"
    write_report(result, out)
    print(json.dumps(result, indent=2))
    print(f"wrote {out}")
    if args.save:
        model_id = asyncio.run(save_global_bkt(result["bkt_pooled"]["params"], result["bkt_pooled"]))
        print(f"saved global BKT parameters as learner model {model_id}")


def _cmd_confusion_study(args):
    import uuid
    from app.core.db import connect_to_mongo
    from app.services.learner.confusion_model import fit_course_model

    async def go():
        await connect_to_mongo()
        return await fit_course_model(uuid.UUID(args.course), seed=args.seed)
    version = asyncio.run(go())
    print(json.dumps({"model_id": str(version.id), "features": version.features,
                      "coefficients": version.coefficients, "metrics": version.metrics}, indent=2))


def _cmd_grading_study(args):
    from eval.grading_study import run_grading_study
    folder = asyncio.run(run_grading_study(args.dataset, Path(args.data) if args.data else None, args.limit, args.seed,
                                           prompts_path=Path(args.prompts) if args.prompts else None))
    print((folder / "metrics.json").read_text(encoding="utf-8"))


def _cmd_draft_gold(args):
    from eval.draft_gold import draft_gold
    asyncio.run(draft_gold(args.course, args.n, Path(args.out), seed=args.seed))


def main(argv=None):
    parser = argparse.ArgumentParser(prog="eval.cli", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("run", help="run an experiment config (all sweep variants)")
    p.add_argument("--config", required=True)
    p.add_argument("--limit", type=int, help="only the first N gold items (smoke test)")
    p.set_defaults(func=_cmd_run)

    p = sub.add_parser("report", help="rebuild metrics tables from logged run folders")
    p.add_argument("runs", nargs="+")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_report)

    p = sub.add_parser("simulate", help="S2 simulated-student dialogues")
    p.add_argument("--config", required=True)
    p.set_defaults(func=_cmd_simulate)

    p = sub.add_parser("import-ratings", help="judge-human agreement from a filled ratings CSV")
    p.add_argument("run")
    p.add_argument("csv")
    p.set_defaults(func=_cmd_import_ratings)

    p = sub.add_parser("wer", help="word error rate of a transcript against a hand-corrected reference")
    p.add_argument("--reference", required=True)
    p.add_argument("--hypothesis", required=True)
    p.set_defaults(func=_cmd_wer)

    p = sub.add_parser("validate-gold", help="check gold files and print their composition")
    p.add_argument("paths", nargs="+")
    p.set_defaults(func=_cmd_validate_gold)

    p = sub.add_parser("kt", help="S3: BKT vs PFA on ASSISTments (student-level split)")
    p.add_argument("--data", help="path to skill_builder_data.csv (default eval/data/assistments/)")
    p.add_argument("--seed", type=int, default=13)
    p.add_argument("--save", action="store_true", help="store the fitted BKT as the global learner model")
    p.set_defaults(func=_cmd_kt)

    p = sub.add_parser("confusion-study", help="S4: fit the calibrated struggle model on instructor labels")
    p.add_argument("--course", required=True)
    p.add_argument("--seed", type=int, default=13)
    p.set_defaults(func=_cmd_confusion_study)

    p = sub.add_parser("grading-study", help="S5: grader v2 agreement with human scores on Mohler or ASAP-SAS")
    p.add_argument("--dataset", choices=["mohler", "asap"], required=True)
    p.add_argument("--data", help="dataset file (default under eval/data/)")
    p.add_argument("--limit", type=int)
    p.add_argument("--seed", type=int, default=13)
    p.add_argument("--prompts", help="ASAP only: prompts.json with each set's question and rubric (default eval/data/asap_sas/prompts.json)")
    p.set_defaults(func=_cmd_grading_study)

    p = sub.add_parser("draft-gold", help="LLM-drafted candidate questions for HUMAN review")
    p.add_argument("--course", required=True)
    p.add_argument("--n", type=int, default=30)
    p.add_argument("--out", required=True)
    p.add_argument("--seed", type=int, default=13)
    p.set_defaults(func=_cmd_draft_gold)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
