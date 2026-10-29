"""S3 knowledge tracing (RQ2): BKT vs a PFA-style logistic baseline on ASSISTments.

Students are split 80/20 with a fixed seed (never by row), parameters are fitted
on the training students only, and next-attempt prediction is scored on the
held-out students. `--save` stores the fitted BKT parameters as the global
learner model used when a course has no fit of its own.
"""

import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

from app.services.learner import bkt
from eval.datasets import assistments_sequences


def split_students(sequences: Dict[str, List[tuple]], test_fraction: float = 0.2, seed: int = 13):
    students = sorted(sequences)
    random.Random(seed).shuffle(students)
    cut = int(len(students) * (1 - test_fraction))
    return {s: sequences[s] for s in students[:cut]}, {s: sequences[s] for s in students[cut:]}


def per_skill(sequences: Dict[str, List[tuple]]) -> Dict[str, List[List[int]]]:
    """{skill: [one correctness sequence per student]}"""
    out = defaultdict(list)
    for attempts in sequences.values():
        by_skill = defaultdict(list)
        for skill, correct in attempts:
            by_skill[skill].append(correct)
        for skill, seq in by_skill.items():
            out[skill].append(seq)
    return out


def pfa_rows(sequences: Dict[str, List[tuple]]) -> Tuple[List[List[float]], List[int]]:
    """Performance Factors Analysis features: prior successes and failures on the skill."""
    X, y = [], []
    for attempts in sequences.values():
        succ, fail = defaultdict(int), defaultdict(int)
        for skill, correct in attempts:
            X.append([succ[skill], fail[skill], 1.0])
            y.append(correct)
            succ[skill] += correct
            fail[skill] += 1 - correct
    return X, y


def run_kt_study(data_path: Path = None, seed: int = 13, min_skill_attempts: int = 200) -> dict:
    sequences = assistments_sequences(data_path)
    train, test = split_students(sequences, seed=seed)
    train_skills, test_skills = per_skill(train), per_skill(test)

    pooled = bkt.fit([s for seqs in train_skills.values() for s in seqs])
    pooled_eval = bkt.evaluate([s for seqs in test_skills.values() for s in seqs], pooled)

    # Per-skill parameters where there is enough data, pooled parameters otherwise
    ys, ps = [], []
    fitted_skills = 0
    for skill, seqs in test_skills.items():
        train_seqs = train_skills.get(skill, [])
        params = pooled
        if sum(len(s) for s in train_seqs) >= min_skill_attempts:
            params = bkt.fit(train_seqs)
            fitted_skills += 1
        for seq in seqs:
            preds, _ = bkt.trace(seq, params)
            ys += seq
            ps += preds
    from sklearn.metrics import roc_auc_score
    per_skill_eval = {
        "auc": float(roc_auc_score(ys, ps)) if len(set(ys)) > 1 else float("nan"),
        "accuracy": sum(1 for y, p in zip(ys, ps) if (p >= 0.5) == bool(y)) / len(ys),
        "n_attempts": len(ys),
        "skills_with_own_fit": fitted_skills,
    }

    from sklearn.linear_model import LogisticRegression
    Xtr, ytr = pfa_rows(train)
    Xte, yte = pfa_rows(test)
    pfa = LogisticRegression(max_iter=1000).fit(Xtr, ytr)
    pfa_probs = pfa.predict_proba(Xte)[:, 1]
    pfa_eval = {
        "auc": float(roc_auc_score(yte, pfa_probs)),
        "accuracy": float(sum(1 for y, p in zip(yte, pfa_probs) if (p >= 0.5) == bool(y)) / len(yte)),
        "n_attempts": len(yte),
    }
    return {
        "dataset": "ASSISTments skill builder",
        "split": {"train_students": len(train), "test_students": len(test), "seed": seed, "by": "student"},
        "bkt_pooled": {"params": pooled.as_dict(), **pooled_eval},
        "bkt_per_skill": per_skill_eval,
        "pfa_logistic": pfa_eval,
    }


async def save_global_bkt(params: dict, metrics: dict) -> str:
    from app.core.db import connect_to_mongo
    from app.models.learner import LearnerModelVersion
    await connect_to_mongo()
    await LearnerModelVersion.find(LearnerModelVersion.kind == "bkt", LearnerModelVersion.course_id == None).update(  # noqa: E711
        {"$set": {"active": False}})
    version = LearnerModelVersion(kind="bkt", course_id=None, params=params, metrics=metrics,
                                  trained_on="ASSISTments (student-level split)")
    await version.insert()
    return str(version.id)


def write_report(result: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
