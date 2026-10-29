"""One-click course reports (weekly or whole term) as CSV and PDF.

Every figure is computed from logged data for the period; a figure with no data is
reported as "not measured" rather than as zero.
"""

import io
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from beanie.operators import In

from app.models.analytics.event import AnalyticsEvent
from app.models.course import Course, Enrolment
from app.models.test import TestAttempt
from app.models.user import User
from app.services.insights.common import is_gap, node_labels, student_runs
from app.services.insights.coverage import coverage_gaps
from app.services.insights.questions import build_clusters

MASTERED = 0.95  # BKT convention: a concept counts as mastered above this probability
LOW_MASTERY = 0.4
INACTIVE_DAYS = 7
LOW_SCORE_PCT = 50.0
VIDEO_HEARTBEAT_S = 15  # useVideoTelemetry samples the playing position this often


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def report_period(course: Course, kind: str, until: Optional[datetime] = None) -> tuple:
    end = until or datetime.now(timezone.utc)
    if kind == "weekly":
        return end - timedelta(days=7), end
    if kind == "term":
        return min(_aware(course.created_at), end - timedelta(days=1)), end
    raise ValueError("report must be 'weekly' or 'term'")


async def build_report(course: Course, kind: str, until: Optional[datetime] = None) -> dict:
    since, end = report_period(course, kind, until)
    enrolled = [e.student_id for e in await Enrolment.find(Enrolment.course_id == course.id).to_list()]
    students = {u.id: u for u in await User.find(In(User.id, enrolled)).to_list()} if enrolled else {}
    labels = await node_labels(course.id)

    events = await AnalyticsEvent.find(
        AnalyticsEvent.course_id == course.id, AnalyticsEvent.user_role == "student",
        AnalyticsEvent.timestamp >= since, AnalyticsEvent.timestamp <= end,
    ).to_list()
    runs = [r for r in await student_runs(course.id, since, end) if r.decision != "error"]
    attempts = await TestAttempt.find(TestAttempt.course_id == course.id, TestAttempt.status == "graded").to_list()
    attempts = [a for a in attempts if a.submitted_at and since <= _aware(a.submitted_at) <= end]

    from app.models.learner import ConceptMastery
    mastery = await ConceptMastery.find(ConceptMastery.course_id == course.id).to_list()

    # Engagement
    active = {e.user_id for e in events} | {r.user_id for r in runs if r.user_id}
    heartbeats = sum(1 for e in events if e.event_type == "video_heartbeat")
    engagement = {
        "enrolled_students": len(enrolled),
        "active_students": len(active & set(enrolled)) if enrolled else len(active),
        "tracked_events": len(events),
        "tutor_questions": len(runs),
        "tutor_answered": sum(1 for r in runs if r.decision == "answered"),
        "tutor_declined": sum(1 for r in runs if r.decision == "declined"),
        "weak_or_no_support": sum(1 for r in runs if is_gap(r) and r.decision != "declined"),
        "lecture_minutes_watched": round(heartbeats * VIDEO_HEARTBEAT_S / 60, 1) if heartbeats else None,
        "tests_graded": len(attempts),
        "mean_test_percentage": round(sum(a.percentage for a in attempts) / len(attempts), 1) if attempts else None,
    }

    # Mastery by concept
    by_node: Dict[str, List[float]] = defaultdict(list)
    for m in mastery:
        if m.n_obs > 0:
            by_node[m.node_id].append(m.p_mastery)
    mastery_rows = sorted((
        {"node_id": node_id, "concept": labels.get(node_id, node_id), "students": len(ps),
         "mean_p_mastery": round(sum(ps) / len(ps), 3), "share_mastered": round(sum(p >= MASTERED for p in ps) / len(ps), 3)}
        for node_id, ps in by_node.items()
    ), key=lambda r: r["mean_p_mastery"])

    # Students to check on, each with the measured reasons
    last_seen: Dict[uuid.UUID, datetime] = {}
    history = await AnalyticsEvent.find(
        AnalyticsEvent.course_id == course.id, In(AnalyticsEvent.user_id, enrolled), AnalyticsEvent.timestamp <= end,
    ).to_list() if enrolled else []
    for e in history:
        ts = _aware(e.timestamp)
        if e.user_id not in last_seen or ts > last_seen[e.user_id]:
            last_seen[e.user_id] = ts
    weak_concepts: Dict[uuid.UUID, List[str]] = defaultdict(list)
    for m in mastery:
        if m.n_obs >= 2 and m.p_mastery < LOW_MASTERY:
            weak_concepts[m.student_id].append(labels.get(m.node_id, m.node_id))
    scores: Dict[uuid.UUID, List[float]] = defaultdict(list)
    for a in attempts:
        scores[a.student_id].append(a.percentage)

    flagged = []
    for sid in enrolled:
        reasons = []
        seen = last_seen.get(sid)
        if seen is None:
            reasons.append("No recorded activity in this course")
        elif (end - seen).days >= INACTIVE_DAYS:
            reasons.append(f"No activity in {(end - seen).days} days")
        if len(weak_concepts[sid]) >= 2:
            reasons.append(f"Low mastery on {len(weak_concepts[sid])} concepts: {', '.join(sorted(weak_concepts[sid])[:4])}")
        if scores[sid] and sum(scores[sid]) / len(scores[sid]) < LOW_SCORE_PCT:
            reasons.append(f"Average test score {sum(scores[sid]) / len(scores[sid]):.0f}%")
        if reasons:
            user = students.get(sid)
            flagged.append({"student_id": str(sid), "name": user.name if user else "Unknown", "reasons": reasons})
    flagged.sort(key=lambda f: len(f["reasons"]), reverse=True)

    # What students asked about (keyword-labelled so the report needs no LLM call)
    clusters = await build_clusters(runs, labels, max_clusters=8, use_llm=False) if runs else []
    top_questions = [{"topic": c.topic, "questions": c.size, "concepts": ", ".join(c.node_labels), "declined": c.declined}
                     for c in clusters]
    gaps = await coverage_gaps(course.id, days=max(1, (end - since).days), until=end)

    return {
        "course": {"id": str(course.id), "title": course.title, "code": getattr(course, "code", "")},
        "kind": kind, "period_start": since.isoformat(), "period_end": end.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engagement": engagement,
        "mastery_by_concept": mastery_rows,
        "flagged_students": flagged,
        "top_questions": top_questions,
        "coverage_gaps": [{"area": g["label"], "questions": g["total"], "declined": g["declined"],
                           "not_in_notes": g["not_in_notes"]} for g in gaps["groups"][:10]],
        "thresholds": {"mastered": MASTERED, "low_mastery": LOW_MASTERY, "inactive_days": INACTIVE_DAYS,
                       "low_score_pct": LOW_SCORE_PCT},
    }


def _fmt(value) -> str:
    return "not measured" if value is None else str(value)


def report_rows(report: dict) -> List[dict]:
    """Long format: one row per (section, item, metric)."""
    rows = [{"section": "engagement", "item": "", "metric": k, "value": _fmt(v)} for k, v in report["engagement"].items()]
    for r in report["mastery_by_concept"]:
        for metric in ("students", "mean_p_mastery", "share_mastered"):
            rows.append({"section": "mastery_by_concept", "item": r["concept"], "metric": metric, "value": r[metric]})
    for f in report["flagged_students"]:
        rows.append({"section": "flagged_students", "item": f["name"], "metric": "reasons", "value": "; ".join(f["reasons"])})
    for q in report["top_questions"]:
        for metric in ("questions", "declined", "concepts"):
            rows.append({"section": "top_questions", "item": q["topic"], "metric": metric, "value": q[metric]})
    for g in report["coverage_gaps"]:
        for metric in ("questions", "declined", "not_in_notes"):
            rows.append({"section": "coverage_gaps", "item": g["area"], "metric": metric, "value": g[metric]})
    return rows


def to_csv(report: dict) -> str:
    import pandas as pd
    header = [{"section": "report", "item": report["course"]["title"], "metric": k, "value": report[k]}
              for k in ("kind", "period_start", "period_end", "generated_at")]
    return pd.DataFrame(header + report_rows(report), columns=["section", "item", "metric", "value"]).to_csv(index=False)


def to_pdf(report: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.8 * cm, rightMargin=1.8 * cm, topMargin=1.6 * cm,
                            bottomMargin=1.6 * cm, title=f"{report['course']['title']} report")
    cell = styles["BodyText"]

    def table(header: List[str], rows: List[List]) -> Table:
        data = [header] + [[Paragraph(str(v), cell) for v in row] for row in rows]
        t = Table(data, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#BBBBBB")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return t

    def section(title: str, header: List[str], rows: List[List], empty: str):
        story.append(Paragraph(title, styles["Heading2"]))
        story.append(table(header, rows) if rows else Paragraph(empty, cell))
        story.append(Spacer(1, 0.4 * cm))

    kind = "Weekly report" if report["kind"] == "weekly" else "End-of-term report"
    story = [
        Paragraph(f"{report['course']['title']} — {kind}", styles["Title"]),
        Paragraph(f"{report['period_start'][:10]} to {report['period_end'][:10]} · generated {report['generated_at'][:16].replace('T', ' ')} UTC", cell),
        Spacer(1, 0.5 * cm),
    ]
    section("Engagement", ["Metric", "Value"],
            [[k.replace("_", " ").capitalize(), _fmt(v)] for k, v in report["engagement"].items()], "No data.")
    section("Mastery by concept (lowest first)", ["Concept", "Students", "Mean P(mastery)", "Share mastered"],
            [[r["concept"], r["students"], f"{r['mean_p_mastery']:.2f}", f"{r['share_mastered']:.0%}"] for r in report["mastery_by_concept"]],
            "Not measured: no graded answers are linked to concepts yet.")
    section("Students to check on", ["Student", "Reasons"],
            [[f["name"], "; ".join(f["reasons"])] for f in report["flagged_students"]], "No students flagged.")
    section("What students asked about", ["Topic", "Questions", "Concepts", "Declined"],
            [[q["topic"], q["questions"], q["concepts"] or "—", q["declined"]] for q in report["top_questions"]],
            "No tutor questions in this period.")
    section("Coverage gaps", ["Area", "Questions", "Declined", "Not in notes"],
            [[g["area"], g["questions"], g["declined"], g["not_in_notes"]] for g in report["coverage_gaps"]],
            "No coverage gaps in this period.")
    t = report["thresholds"]
    story.append(Paragraph(
        f"Mastered means P(mastery) ≥ {t['mastered']}. Students are flagged for no activity in {t['inactive_days']}+ days, "
        f"P(mastery) below {t['low_mastery']} on two or more concepts, or an average test score below {t['low_score_pct']:.0f}%.",
        styles["Italic"]))
    doc.build(story)
    return buf.getvalue()
