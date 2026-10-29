"""Loaders for public benchmarks. Files are not redistributed: place them under
eval/data/<name>/ after checking each licence (see eval/data/README.md).
Every loader raises FileNotFoundError with the expected location when data is missing."""

import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterator, List

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _need(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"Expected dataset file at {path} — see eval/data/README.md")
    return path


def assistments_sequences(path: Path = None, min_attempts: int = 3) -> Dict[str, List[tuple]]:
    """ASSISTments skill-builder CSV -> {student_id: [(skill_id, correct), ...]} ordered by order_id.
    Rows without a skill are dropped; exact duplicate rows are dropped (standard cleaning)."""
    path = _need(path or DATA_DIR / "assistments" / "skill_builder_data.csv")
    seen, rows = set(), []
    with path.open(encoding="latin-1", newline="") as f:
        for row in csv.DictReader(f):
            if not row.get("skill_id") or row.get("correct") not in ("0", "1"):
                continue
            key = (row["user_id"], row.get("order_id"), row["skill_id"])
            if key in seen:
                continue
            seen.add(key)
            rows.append((row["user_id"], int(row.get("order_id") or 0), row["skill_id"], int(row["correct"])))
    sequences = defaultdict(list)
    for user, order, skill, correct in sorted(rows, key=lambda r: (r[0], r[1])):
        sequences[user].append((skill, correct))
    return {u: s for u, s in sequences.items() if len(s) >= min_attempts}


def mohler_answers(path: Path = None) -> Iterator[dict]:
    """Mohler et al. (2011) short-answer CSV -> {question_id, question, reference, answer, score (0-5)}."""
    path = _need(path or DATA_DIR / "mohler" / "mohler_dataset.csv")
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            yield {
                "question_id": row.get("id", "").split(".")[0],
                "question": row.get("question", ""),
                "reference": row.get("desired_answer", ""),
                "answer": row.get("student_answer", ""),
                "score": float(row.get("score_avg") or 0),
                "max_score": 5.0,
            }


def asap_sas_answers(path: Path = None) -> Iterator[dict]:
    """ASAP short-answer scoring train.tsv -> {question_id (essay set), answer, score, score2}."""
    path = _need(path or DATA_DIR / "asap_sas" / "train.tsv")
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            yield {
                "question_id": row["EssaySet"],
                "answer": row["EssayText"],
                "score": int(row["Score1"]),
                "score2": int(row["Score2"]) if row.get("Score2") not in (None, "") else None,
                "max_score": 3 if row["EssaySet"] in {"1", "2", "5", "6", "10"} else 2,
            }


def eduvidqa_items(path: Path = None) -> Iterator[dict]:
    """EduVidQA converted to JSONL: {qid, video_id, question, answer, t_start, t_end}.
    The format of the official release must be confirmed before converting (see the data card)."""
    path = _need(path or DATA_DIR / "eduvidqa" / "eduvidqa.jsonl")
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)
