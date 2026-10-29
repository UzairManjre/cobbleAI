"""Calibrated, interpretable concept-struggle model (RQ2 / S4).

A logistic regression on standardised behaviour signals, fitted to the
instructor's difficulty labels. Every flag reports its probability and the
signed contribution of each signal (coefficient x standardised value), so a
professor can see *why* a concept was flagged. Until a model is fitted the v1
heuristic is used and labelled as such.
"""

import math
import uuid
from typing import Dict, List, Optional

from app.core.config import settings
from app.models.learner import ConceptDifficultyLabel, LearnerModelVersion
from app.services.learner.features import FEATURES, concept_features, feature_matrix

HEURISTIC_THRESHOLD = 0.6  # v1 flagged concepts with CS > 0.6
MIN_LABELS = 6
SIGNAL_NAMES = {
    "revisit_rate": "Students keep coming back to it",
    "dwell_norm": "Long time spent on it",
    "questions_per_student": "Many tutor questions",
    "video_replays_per_student": "Lecture moments rewatched",
    "wrong_answer_rate": "Quiz answers often wrong",
    "decline_rate": "Tutor often couldn't find support",
    "negative_feedback_rate": "Answers rated wrong / not in notes",
    "low_mastery": "Low estimated mastery",
}


def _prf(y_true: List[int], y_pred: List[int]) -> dict:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t and p)
    fp = sum(1 for t, p in zip(y_true, y_pred) if not t and p)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t and not p)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4), "tp": tp, "fp": fp, "fn": fn}


def _cv_predictions(X, y, features: List[str], seed: int = 13) -> Optional[List[int]]:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    minority = min(sum(y), len(y) - sum(y))
    if minority < 2:
        return None
    pipe = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000))
    cv = StratifiedKFold(n_splits=min(5, minority), shuffle=True, random_state=seed)
    probs = cross_val_predict(pipe, X, y, cv=cv, method="predict_proba")[:, 1]
    return [int(p >= 0.5) for p in probs]


async def labels_for(course_id: uuid.UUID, slot: str = "primary") -> Dict[str, bool]:
    labels = await ConceptDifficultyLabel.find(
        ConceptDifficultyLabel.course_id == course_id, ConceptDifficultyLabel.rater_slot == slot,
    ).to_list()
    return {l.node_id: l.struggling for l in labels}


async def fit_course_model(course_id: uuid.UUID, seed: int = 13) -> LearnerModelVersion:
    from sklearn.linear_model import LogisticRegression

    rows = await concept_features(course_id)
    labels = await labels_for(course_id)
    labelled = [rows[n] for n in labels if n in rows]
    y = [int(labels[r["node_id"]]) for r in labelled]
    if len(labelled) < MIN_LABELS or len(set(y)) < 2:
        raise ValueError(f"Need at least {MIN_LABELS} labelled concepts including both struggling and not-struggling ones "
                         f"(have {len(labelled)}, {sum(y)} struggling).")

    X = feature_matrix(labelled)
    means = [sum(col) / len(col) for col in zip(*X)]
    stds = [math.sqrt(sum((v - m) ** 2 for v in col) / len(col)) or 1.0 for col, m in zip(zip(*X), means)]
    Z = [[(v - m) / s for v, m, s in zip(row, means, stds)] for row in X]
    model = LogisticRegression(class_weight="balanced", max_iter=1000).fit(Z, y)

    metrics = {"n_labelled": len(labelled), "n_struggling": sum(y)}
    cv_pred = _cv_predictions(X, y, FEATURES, seed)
    if cv_pred is not None:
        metrics["calibrated_cv"] = _prf(y, cv_pred)
        # Does the video signal add value? (S4 ablation)
        no_video = [f for f in FEATURES if f != "video_replays_per_student"]
        cv_nv = _cv_predictions(feature_matrix(labelled, no_video), y, no_video, seed)
        if cv_nv is not None:
            metrics["calibrated_cv_without_video"] = _prf(y, cv_nv)
    metrics["heuristic_v1"] = _prf(y, [int(r["heuristic_v1"] > HEURISTIC_THRESHOLD) for r in labelled])

    secondary = await labels_for(course_id, "secondary")
    overlap = [n for n in secondary if n in labels]
    if overlap:
        from app.utils.stats import cohen_kappa, exact_agreement
        a, b = [int(labels[n]) for n in overlap], [int(secondary[n]) for n in overlap]
        kappa = cohen_kappa(a, b)
        metrics["inter_rater"] = {"n": len(overlap), "cohen_kappa": None if math.isnan(kappa) else kappa,
                                  "exact_agreement": exact_agreement(a, b)}

    await LearnerModelVersion.find(LearnerModelVersion.kind == "confusion", LearnerModelVersion.course_id == course_id).update(
        {"$set": {"active": False}})
    version = LearnerModelVersion(
        kind="confusion", course_id=course_id, features=list(FEATURES),
        coefficients=[float(c) for c in model.coef_[0]], intercept=float(model.intercept_[0]),
        feature_means=means, feature_stds=stds, threshold=0.5, metrics=metrics, n_labels=len(labelled),
        trained_on="instructor difficulty labels",
    )
    await version.insert()
    return version


async def active_model(course_id: uuid.UUID) -> Optional[LearnerModelVersion]:
    return await LearnerModelVersion.find(
        LearnerModelVersion.kind == "confusion", LearnerModelVersion.course_id == course_id,
        LearnerModelVersion.active == True,  # noqa: E712
    ).sort(-LearnerModelVersion.created_at).first_or_none()


def explain(row: dict, model: LearnerModelVersion) -> dict:
    z = [(row["features"][f] - m) / s for f, m, s in zip(model.features, model.feature_means, model.feature_stds)]
    contributions = [c * v for c, v in zip(model.coefficients, z)]
    logit = model.intercept + sum(contributions)
    prob = 1 / (1 + math.exp(-logit))
    signals = sorted(
        ({"signal": f, "label": SIGNAL_NAMES.get(f, f), "value": row["features"][f], "contribution": round(c, 4)}
         for f, c in zip(model.features, contributions)),
        key=lambda s: s["contribution"], reverse=True,
    )
    return {"probability": round(prob, 4), "flagged": prob >= model.threshold, "signals": signals}


async def score_course(course_id: uuid.UUID) -> dict:
    """Flags for every concept, with reasons; calibrated model when fitted, else the v1 heuristic."""
    rows = await concept_features(course_id)
    labels = await labels_for(course_id)
    second = await labels_for(course_id, "secondary")  # a second rater's labels, for inter-rater agreement
    # LEARNER_MODEL_V2 off: the labelled v1 heuristic only (ablation / rollback)
    model = await active_model(course_id) if settings.LEARNER_MODEL_V2 else None
    concepts = []
    for row in rows.values():
        item = {**row, "instructor_label": labels.get(row["node_id"]), "second_rater_label": second.get(row["node_id"])}
        if model:
            item.update(explain(row, model))
        else:
            parts = [
                {"signal": "revisit_rate", "label": SIGNAL_NAMES["revisit_rate"], "value": row["features"]["revisit_rate"],
                 "contribution": round(0.4 * row["features"]["revisit_rate"], 4)},
                {"signal": "dwell_norm", "label": SIGNAL_NAMES["dwell_norm"], "value": row["features"]["dwell_norm"],
                 "contribution": round(0.3 * row["features"]["dwell_norm"], 4)},
                {"signal": "questions_per_student", "label": SIGNAL_NAMES["questions_per_student"],
                 "value": row["features"]["questions_per_student"],
                 "contribution": round(0.3 * min(row["features"]["questions_per_student"] / 5, 1), 4)},
            ]
            item.update(probability=None, flagged=row["heuristic_v1"] > HEURISTIC_THRESHOLD,
                        signals=sorted(parts, key=lambda s: s["contribution"], reverse=True))
        concepts.append(item)
    concepts.sort(key=lambda c: (c["probability"] if c["probability"] is not None else c["heuristic_v1"]), reverse=True)
    return {
        "method": "calibrated" if model else "heuristic_v1",
        "model_id": str(model.id) if model else None,
        "model_metrics": model.metrics if model else None,
        "threshold": model.threshold if model else HEURISTIC_THRESHOLD,
        "labelled": len(labels),
        "concepts": concepts,
    }
