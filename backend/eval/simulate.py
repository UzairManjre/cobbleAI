"""S2 pedagogy study: multi-turn dialogues between the tutor and simulated students.

A student-persona LLM (the judge endpoint) plays a learner with a seeded
misconception; the tutor answers through the real engine at the configured help
level; the judge rates every tutor turn (scaffolding, correctness, answer leakage).
A CSV template is written for human raters, and `import_ratings` reports
judge-human agreement so judge scores are only reported once calibrated.
"""

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import BaseModel, Field

from eval.gold import load_gold
from eval.judge import Judge
from eval.metrics.stats import bootstrap_ci, cohen_kappa, exact_agreement, quadratic_weighted_kappa
from eval.runner import RUNS_DIR, environment, _write_jsonl, read_jsonl

DEFAULT_PERSONAS = [
    {"id": "overconfident", "description": "confident but holds one plausible misconception about the topic and defends it once"},
    {"id": "confused", "description": "unsure where to start, gives short vague replies and asks for the answer directly"},
    {"id": "diligent", "description": "tries to reason step by step and makes a small mistake along the way"},
]


class SimulationConfig(BaseModel):
    name: str
    gold: List[str]
    split: Optional[str] = "dev"
    limit: Optional[int] = 20
    turns: int = 3  # tutor turns per dialogue
    hint_level: str = "guiding_question"
    mode: str = "teach"
    personas: List[dict] = Field(default_factory=lambda: list(DEFAULT_PERSONAS))
    judge_base_url: Optional[str] = None
    judge_model: Optional[str] = None
    seed: int = 13

    @classmethod
    def load(cls, path) -> "SimulationConfig":
        return cls.model_validate(yaml.safe_load(Path(path).read_text(encoding="utf-8")))


async def _student_turn(judge: Judge, persona: dict, question: str, transcript: List[dict]) -> str:
    convo = "\n".join(f"{t['role'].upper()}: {t['content']}" for t in transcript)
    return (await judge.complete(
        f"You are role-playing a university student who is {persona['description']}. "
        "Reply to the tutor in one or two sentences, in character. Do not mention that you are role-playing.",
        f"Your original question: {question}\n\nConversation so far:\n{convo}\n\nYour next message:",
        max_tokens=200,
    )).strip()


async def run_simulation(config: SimulationConfig, *, engine=None, judge: Optional[Judge] = None,
                         runs_dir: Path = RUNS_DIR, init_db: bool = True) -> Path:
    if init_db:
        from app.core.db import connect_to_mongo
        await connect_to_mongo()
    from app.services.tutor_engine import TutorEngine, TutorRequest
    from app.services.tutor_policy import EffectivePolicy
    engine = engine or TutorEngine()
    judge = judge or Judge(base_url=config.judge_base_url, model=config.judge_model, seed=config.seed)
    items = [i for i in load_gold(config.gold, split=config.split) if i.answerable][: config.limit]

    folder = runs_dir / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}_{config.name}"
    folder.mkdir(parents=True)
    (folder / "config.json").write_text(json.dumps({"simulation": config.model_dump()}, indent=2), encoding="utf-8")
    (folder / "env.json").write_text(json.dumps(environment(judge), indent=2), encoding="utf-8")

    dialogues, turns = [], []
    for item in items:
        for persona in config.personas:
            transcript: List[dict] = []
            student_msg = item.question
            for turn_no in range(1, config.turns + 1):
                prepared, outcome, _ = await engine.answer_once(TutorRequest(
                    question=student_msg, course_id=item.course_id, mode=config.mode,
                    hint_level=config.hint_level, history=list(transcript), policy=EffectivePolicy(),
                ))
                transcript += [{"role": "user", "content": student_msg}, {"role": "assistant", "content": outcome.answer}]
                rating = await judge.pedagogy_rubric(item.question, item.expected_answer or "", outcome.answer, prepared.hint_level) \
                    if outcome.decision == "answered" else {"scaffolding": None, "correctness": None, "leaked": False, "rationale": "declined"}
                turn_id = f"{item.qid}:{persona['id']}:{turn_no}"
                turns.append({
                    "turn_id": turn_id, "qid": item.qid, "persona": persona["id"], "turn": turn_no,
                    "student": student_msg, "tutor": outcome.answer, "decision": outcome.decision,
                    "hint_level": prepared.hint_level, "cited_sids": outcome.cited_sids, "judge": rating,
                })
                if turn_no < config.turns:
                    student_msg = await _student_turn(judge, persona, item.question, transcript)
            dialogues.append({"qid": item.qid, "persona": persona["id"], "transcript": transcript})

    _write_jsonl(folder / "dialogues.jsonl", dialogues)
    _write_jsonl(folder / "turns.jsonl", turns)
    (folder / "metrics.json").write_text(json.dumps(summarize_turns(turns, config.seed), indent=2), encoding="utf-8")
    write_rating_template(turns, folder / "ratings_template.csv")
    print(f"  wrote {folder}")
    return folder


def summarize_turns(turns: List[dict], seed: int = 13) -> dict:
    rated = [t for t in turns if t["decision"] == "answered" and t["judge"].get("scaffolding")]
    return {
        "n_turns": len(turns),
        "n_rated": len(rated),
        "scaffolding": bootstrap_ci([t["judge"]["scaffolding"] for t in rated], seed=seed),
        "correctness": bootstrap_ci([t["judge"]["correctness"] for t in rated], seed=seed),
        "answer_leakage_rate": bootstrap_ci([1.0 if t["judge"]["leaked"] else 0.0 for t in rated], seed=seed),
        "citation_rate": bootstrap_ci([1.0 if t["cited_sids"] else 0.0 for t in rated], seed=seed),
        "decline_rate": sum(1 for t in turns if t["decision"] == "declined") / len(turns) if turns else None,
        "note": "Judge scores; report only alongside judge-human agreement (eval.cli import-ratings).",
    }


RATING_COLUMNS = ["turn_id", "student", "tutor", "human_scaffolding_1to5", "human_correctness_1to5", "human_leaked_yes_no"]


def write_rating_template(turns: List[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RATING_COLUMNS)
        writer.writeheader()
        for t in turns:
            if t["decision"] == "answered":
                writer.writerow({"turn_id": t["turn_id"], "student": t["student"], "tutor": t["tutor"],
                                 "human_scaffolding_1to5": "", "human_correctness_1to5": "", "human_leaked_yes_no": ""})


def import_ratings(folder: Path, csv_path: Path) -> dict:
    """Judge-human agreement on the turns a person rated."""
    turns = {t["turn_id"]: t for t in read_jsonl(folder / "turns.jsonl")}
    pairs = {"scaffolding": ([], []), "correctness": ([], []), "leaked": ([], [])}
    with Path(csv_path).open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            turn = turns.get(row["turn_id"])
            if not turn:
                continue
            judge = turn["judge"]
            if row.get("human_scaffolding_1to5", "").strip():
                pairs["scaffolding"][0].append(int(row["human_scaffolding_1to5"]))
                pairs["scaffolding"][1].append(int(judge["scaffolding"]))
            if row.get("human_correctness_1to5", "").strip():
                pairs["correctness"][0].append(int(row["human_correctness_1to5"]))
                pairs["correctness"][1].append(int(judge["correctness"]))
            if row.get("human_leaked_yes_no", "").strip():
                pairs["leaked"][0].append(row["human_leaked_yes_no"].strip().lower() in ("yes", "y", "1", "true"))
                pairs["leaked"][1].append(bool(judge["leaked"]))

    result = {}
    for key in ("scaffolding", "correctness"):
        human, model = pairs[key]
        if human:
            result[key] = {"n": len(human), "qwk": quadratic_weighted_kappa(human, model, labels=[1, 2, 3, 4, 5]),
                           "exact_agreement": exact_agreement(human, model)}
    human, model = pairs["leaked"]
    if human:
        result["leaked"] = {"n": len(human), "cohen_kappa": cohen_kappa(human, model), "exact_agreement": exact_agreement(human, model)}
    (folder / "judge_agreement.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
