"""Bayesian Knowledge Tracing: a small, interpretable mastery estimator.

Each concept has four parameters: P(L0) initial mastery, P(T) learning per
attempt, P(S) slip (wrong despite mastery), P(G) guess (right without mastery).
After each graded attempt the posterior P(mastered) is updated, then learning is
applied. Parameters are fitted by grid search on log-likelihood (S3 fits them
on ASSISTments with a student-level split).
"""

import itertools
import math
from dataclasses import asdict, dataclass
from typing import Dict, Iterable, List, Sequence, Tuple

EPS = 1e-6


@dataclass(frozen=True)
class BKTParams:
    p_init: float = 0.3
    p_learn: float = 0.1
    p_slip: float = 0.1
    p_guess: float = 0.2

    def as_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "BKTParams":
        return cls(**{k: float(v) for k, v in data.items() if k in cls.__dataclass_fields__})


DEFAULT_PARAMS = BKTParams()


def predict_correct(p_mastery: float, params: BKTParams) -> float:
    """P(next answer correct | current mastery estimate)."""
    return p_mastery * (1 - params.p_slip) + (1 - p_mastery) * params.p_guess


def update(p_mastery: float, correct: bool, params: BKTParams) -> float:
    """Posterior after observing one answer, followed by the learning transition."""
    if correct:
        num = p_mastery * (1 - params.p_slip)
        den = num + (1 - p_mastery) * params.p_guess
    else:
        num = p_mastery * params.p_slip
        den = num + (1 - p_mastery) * (1 - params.p_guess)
    posterior = num / den if den > EPS else p_mastery
    return min(1 - EPS, max(EPS, posterior + (1 - posterior) * params.p_learn))


def trace(observations: Iterable[int], params: BKTParams) -> Tuple[List[float], float]:
    """Predictions made *before* each observation, and the final mastery."""
    p = params.p_init
    preds = []
    for correct in observations:
        preds.append(predict_correct(p, params))
        p = update(p, bool(correct), params)
    return preds, p


def log_likelihood(sequences: Sequence[Sequence[int]], params: BKTParams) -> float:
    total = 0.0
    for seq in sequences:
        preds, _ = trace(seq, params)
        for y, p in zip(seq, preds):
            p = min(1 - EPS, max(EPS, p))
            total += math.log(p if y else 1 - p)
    return total


GRID = {
    "p_init": [0.1, 0.3, 0.5, 0.7],
    "p_learn": [0.02, 0.05, 0.1, 0.2, 0.3],
    "p_slip": [0.05, 0.1, 0.2, 0.3],
    "p_guess": [0.1, 0.2, 0.3],
}


def fit(sequences: Sequence[Sequence[int]], grid: Dict[str, List[float]] = None) -> BKTParams:
    """Maximum-likelihood parameters over a grid (degenerate slip+guess >= 1 excluded)."""
    grid = grid or GRID
    best, best_ll = DEFAULT_PARAMS, -math.inf
    for p_init, p_learn, p_slip, p_guess in itertools.product(grid["p_init"], grid["p_learn"], grid["p_slip"], grid["p_guess"]):
        if p_slip + p_guess >= 1:
            continue
        params = BKTParams(p_init, p_learn, p_slip, p_guess)
        ll = log_likelihood(sequences, params)
        if ll > best_ll:
            best, best_ll = params, ll
    return best


def evaluate(sequences: Sequence[Sequence[int]], params: BKTParams) -> dict:
    """Next-step prediction quality: AUC and accuracy at 0.5 over all held-out attempts."""
    ys, ps = [], []
    for seq in sequences:
        preds, _ = trace(seq, params)
        ys += list(seq)
        ps += preds
    accuracy = sum(1 for y, p in zip(ys, ps) if (p >= 0.5) == bool(y)) / len(ys) if ys else float("nan")
    try:
        from sklearn.metrics import roc_auc_score
        auc = float(roc_auc_score(ys, ps)) if len(set(ys)) > 1 else float("nan")
    except Exception:
        auc = float("nan")
    return {"auc": auc, "accuracy": accuracy, "n_attempts": len(ys)}
