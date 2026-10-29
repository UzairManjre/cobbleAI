"""Statistics shared by the app (agreement and audit reports) and the evaluation harness:
bootstrap CIs, chance-corrected agreement, classification metrics, proportion intervals."""

import math
import random
from typing import Callable, Dict, List, Optional, Sequence


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else float("nan")


def bootstrap_ci(values: Sequence[float], stat: Callable[[Sequence[float]], float] = mean,
                 n_resamples: int = 2000, alpha: float = 0.05, seed: int = 13) -> Dict[str, float]:
    """Percentile bootstrap confidence interval for `stat` over items."""
    values = [v for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]
    if not values:
        return {"value": float("nan"), "ci_low": float("nan"), "ci_high": float("nan"), "n": 0}
    rng = random.Random(seed)
    # A statistic can be undefined on some resamples (kappa when one rater has no spread): drop those,
    # and give no interval when most resamples are undefined
    estimates = sorted(e for e in (stat([rng.choice(values) for _ in values]) for _ in range(n_resamples))
                       if e is not None and not math.isnan(e))
    if len(estimates) < n_resamples / 2:
        return {"value": stat(values), "ci_low": float("nan"), "ci_high": float("nan"), "n": len(values)}
    lo = estimates[int((alpha / 2) * len(estimates))]
    hi = estimates[min(len(estimates) - 1, int((1 - alpha / 2) * len(estimates)))]
    return {"value": stat(values), "ci_low": lo, "ci_high": hi, "n": len(values)}


def paired_bootstrap_diff(a: Sequence[float], b: Sequence[float], n_resamples: int = 2000, seed: int = 13) -> Dict[str, float]:
    """Mean difference (a - b) over paired items with a bootstrap CI — for comparing two configs."""
    pairs = [(x, y) for x, y in zip(a, b) if x is not None and y is not None]
    diffs = [x - y for x, y in pairs]
    return bootstrap_ci(diffs, mean, n_resamples=n_resamples, seed=seed)


def _kappa_defined(rater_a: Sequence, rater_b: Sequence) -> bool:
    """Chance-corrected agreement says nothing when a rater gave every item the same score (it is
    then 0 by construction, or 0/0): report it as not measured (NaN -> null) instead."""
    return len(set(rater_a)) > 1 and len(set(rater_b)) > 1


def quadratic_weighted_kappa(rater_a: Sequence[int], rater_b: Sequence[int], labels: Optional[List[int]] = None) -> float:
    from sklearn.metrics import cohen_kappa_score
    if not _kappa_defined(rater_a, rater_b):
        return float("nan")
    return float(cohen_kappa_score(rater_a, rater_b, weights="quadratic", labels=labels))


def cohen_kappa(rater_a: Sequence, rater_b: Sequence) -> float:
    from sklearn.metrics import cohen_kappa_score
    if not _kappa_defined(rater_a, rater_b):
        return float("nan")
    return float(cohen_kappa_score(rater_a, rater_b))


def mae(a: Sequence[float], b: Sequence[float]) -> float:
    return mean([abs(x - y) for x, y in zip(a, b)])


def exact_agreement(a: Sequence, b: Sequence) -> float:
    return mean([1.0 if x == y else 0.0 for x, y in zip(a, b)])


def precision_recall_f1(y_true: Sequence[int], y_pred: Sequence[int]) -> Dict[str, float]:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t and p)
    fp = sum(1 for t, p in zip(y_true, y_pred) if not t and p)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t and not p)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def roc_auc(y_true: Sequence[int], scores: Sequence[float]) -> float:
    from sklearn.metrics import roc_auc_score
    if len(set(y_true)) < 2:
        return float("nan")
    return float(roc_auc_score(y_true, scores))


def wilson_interval(successes: int, n: int, z: float = 1.96) -> Dict[str, float]:
    """95% confidence interval for a proportion (e.g. edge precision on an audited sample)."""
    if n == 0:
        return {"value": float("nan"), "ci_low": float("nan"), "ci_high": float("nan"), "n": 0}
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return {"value": p, "ci_low": max(0.0, centre - half), "ci_high": min(1.0, centre + half), "n": n}
