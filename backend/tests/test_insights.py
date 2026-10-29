"""Professor insights: question clusters, coverage gaps, source counts, FAQ, reports, dashboard funnel."""

import csv
import io
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.analytics.event import AnalyticsEvent
from app.models.course import Course, Enrolment
from app.models.insights import FAQEntry
from app.models.lecture import LectureChapter
from app.models.learner import ConceptMastery
from app.models.test import Test, TestAttempt
from app.models.tutor import AnswerFeedback, TutorRun
from app.services.insights.common import cluster_texts
from app.services.insights.counts import source_question_counts
from app.services.insights.coverage import coverage_gaps
from app.services.insights.questions import generate_question_insights, label_cluster


@pytest.fixture(autouse=True)
def _no_expansion(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RETRIEVAL_PRESET", "no_expansion")


@pytest.fixture
def course(make_user):
    async def _make(n_students: int = 1):
        professor = await make_user("professor")
        students = [await make_user("student", name=f"Student {i}") for i in range(n_students)]
        course = Course(professor_id=professor.id, title="Algorithms", code="CS2")
        await course.insert()
        for s in students:
            await Enrolment(course_id=course.id, student_id=s.id).insert()
        return professor, students, course
    return _make


async def add_run(course, student, question, **kw):
    run = TutorRun(course_id=course.id, user_id=student.id, user_role="student", question=question,
                   **{"decision": "answered", "support_level": "strong", "top_support": 0.9, **kw})
    await run.insert()
    return run


def label(topic, representative=None, misconception=None):
    return json.dumps({"topic": topic, "misconception": misconception, "representative_question": representative})


def test_similar_questions_cluster_together():
    groups = cluster_texts([
        "How does merge sort split the list", "Why does merge sort split into halves", "merge sort split step explained",
        "What is a binary search tree insert", "binary search tree insert order", "compilers lexing tokens",
    ])
    assert groups[0] == [0, 1, 2] and groups[1] == [3, 4] and groups[2] == [5]


async def test_question_insights_label_clusters_and_skip_non_student_runs(course, fake_llm):
    professor, (a, b), c = await course(2)
    await add_run(c, a, "How does merge sort split the list", node_id="n_merge")
    await add_run(c, b, "Why does merge sort split into halves", node_id="n_merge", decision="declined", support_level="none")
    await add_run(c, a, "merge sort split step explained", node_id="n_merge", support_level="weak")
    await add_run(c, a, "What is a binary search tree insert")
    await add_run(c, b, "binary search tree insert order")
    await add_run(c, a, "Merge sort splits lists in half", mode="teach_back")  # an explanation, not a question
    await TutorRun(course_id=c.id, user_id=professor.id, user_role="professor", question="merge sort split preview").insert()
    old = await add_run(c, a, "merge sort split long ago")
    old.created_at = datetime.now(timezone.utc) - timedelta(days=30)
    await old.save()

    fake_llm.queue(label("Merge sort splitting", "How does merge sort divide its input?", "Thinks the split sorts the list"),
                   "not json at all")
    insight = await generate_question_insights(c.id, days=7)
    assert insight.n_questions == 5 and insight.n_students == 2
    first, second = insight.clusters
    assert first.size == 3 and first.topic == "Merge sort splitting" and first.labelled_by == "llm"
    assert first.declined == 1 and first.weak_support == 1 and first.node_ids == ["n_merge"]
    assert second.labelled_by == "keywords" and "binary" in second.topic and second.representative_question is None
    assert insight.method["distance_threshold"] > 0


async def test_label_rejects_a_verbatim_student_question(fake_llm):
    fake_llm.queue(label("Trees", "binary search tree insert order"))
    result = await label_cluster(["binary search tree insert order", "What is a binary search tree insert"], [])
    assert result["topic"] == "Trees" and result["representative_question"] is None


async def test_coverage_gaps_group_declines_weak_answers_and_not_in_notes(course):
    _, (s,), c = await course()
    page3 = {"sid": "S1", "doc_id": "d1", "filename": "notes.pdf", "location": "p. 3", "page_start": 3, "support": 0.3}
    await add_run(c, s, "merge sort stability", node_id="n1", decision="declined", support_level="none", top_support=0.1)
    await add_run(c, s, "merge sort memory use", node_id="n1", support_level="weak", top_support=0.3, sources=[page3])
    flagged = await add_run(c, s, "quicksort pivot choice", node_id="n2")
    await add_run(c, s, "quicksort worst case", node_id="n2")  # answered with strong support: not a gap
    await add_run(c, s, "fourier transform basics", decision="declined", support_level="none")
    await add_run(c, s, "fourier transform examples", decision="declined", support_level="none")
    await AnswerFeedback(message_id=uuid.uuid4(), run_id=flagged.id, student_id=s.id, course_id=c.id, node_id="n2",
                         rating="not_in_notes").insert()
    await AnswerFeedback(message_id=uuid.uuid4(), student_id=s.id, course_id=c.id, node_id="n3", rating="not_in_notes").insert()

    report = await coverage_gaps(c.id, days=7)
    assert report["n_questions"] == 6 and report["n_gaps"] == 5 and report["not_in_notes"] == 2
    groups = {g["key"]: g for g in report["groups"]}
    assert groups["node:n1"]["declined"] == 1 and groups["node:n1"]["weak_support"] == 1
    assert groups["node:n1"]["searched"][0]["location"] == "p. 3"
    assert groups["node:n2"]["not_in_notes"] == 1 and groups["node:n2"]["total"] == 1
    fourier = next(g for g in report["groups"] if g["key"].startswith("cluster:"))
    assert fourier["total"] == 2 and "fourier" in fourier["label"]
    assert groups["feedback:n3"]["not_in_notes"] == 1 and groups["feedback:n3"]["total"] == 0


async def test_source_counts_rank_pages_slides_and_lecture_moments(course):
    _, (s,), c = await course()
    lecture_id = uuid.uuid4()
    await LectureChapter(doc_id=lecture_id, course_id=c.id, index=0, start=0, end=300, title="Intro to sorting").insert()
    page = {"doc_id": "d1", "filename": "notes.pdf", "page_start": 3}
    await add_run(c, s, "q1", cited_sids=["S1"], sources=[{**page, "sid": "S1"}, {**page, "sid": "S2"},
                                                         {"sid": "S3", "doc_id": "d2", "filename": "deck.pptx", "slide_start": 5}])
    await add_run(c, s, "q2", cited_sids=["S1"], sources=[{**page, "sid": "S1"}])
    await add_run(c, s, "q3", cited_sids=["S1", "S2"], sources=[
        {"sid": "S1", "doc_id": str(lecture_id), "filename": "lec.mp4", "media_type": "lecture", "t_start": 120.0},
        {"sid": "S2", "doc_id": str(lecture_id), "filename": "lec.mp4", "media_type": "lecture", "t_start": 400.0}])
    await add_run(c, s, "q4", decision="declined", sources=[{**page, "sid": "S1"}])

    counts = await source_question_counts(c.id, days=7)
    top = counts["locations"][0]
    assert counts["n_questions"] == 3
    assert top["kind"] == "page" and top["page"] == 3 and top["cited"] == 2 and top["retrieved"] == 2
    by_kind = {r["kind"]: r for r in counts["locations"]}
    assert by_kind["chapter"]["chapter_title"] == "Intro to sorting" and by_kind["chapter"]["cited"] == 1
    assert by_kind["time"]["t_start"] == 390 and by_kind["time"]["location"] == "6:30-7:00"
    assert by_kind["slide"]["slide"] == 5 and by_kind["slide"]["cited"] == 0
    assert counts["documents"][0]["doc_id"] == "d1" and counts["documents"][0]["questions"] == 2


async def test_faq_draft_edit_publish_flow(course, api_client, fake_llm, qdrant_memory):
    from tests.test_tutor_engine import index_notes
    professor, (s,), c = await course()
    index_notes(c.id)
    await add_run(c, s, "How does merge sort split the list")
    await add_run(c, s, "Why does merge sort split into halves")

    async with api_client(s) as client:
        assert (await client.post(f"/api/insights/courses/{c.id}/questions/generate")).status_code == 403
        assert (await client.post(f"/api/faq/courses/{c.id}/draft")).status_code == 403

    fake_llm.queue(label("Merge sort splitting", "How does merge sort divide the list into halves?"),
                   "Merge sort divides the list into halves, then sorts and merges them [S1].")
    async with api_client(professor) as client:
        assert (await client.post(f"/api/faq/courses/{c.id}/draft")).status_code == 404  # no insight yet
        insight = (await client.post(f"/api/insights/courses/{c.id}/questions/generate")).json()["insight"]
        assert insight["clusters"][0]["topic"] == "Merge sort splitting"
        assert (await client.get(f"/api/insights/courses/{c.id}/questions")).json()["insight"]["id"] == insight["id"]

        drafted = (await client.post(f"/api/faq/courses/{c.id}/draft")).json()
        assert len(drafted["created"]) == 1, drafted
        entry = drafted["created"][0]
        assert entry["status"] == "draft" and entry["question"] == "How does merge sort divide the list into halves?"
        assert entry["citations"] and entry["citations"][0]["filename"] == "sorting.pdf"
        assert (await client.post(f"/api/faq/courses/{c.id}/draft")).json()["created"] == []  # already drafted

        empty = (await client.post(f"/api/faq/courses/{c.id}", json={"question": "Is the exam open book?"})).json()
        assert (await client.patch(f"/api/faq/{empty['id']}", json={"status": "published"})).status_code == 400

    async with api_client(s) as client:
        assert (await client.get(f"/api/faq/courses/{c.id}")).json()["entries"] == []

    async with api_client(professor) as client:
        res = await client.patch(f"/api/faq/{entry['id']}", json={"answer": "Edited answer [S1].", "status": "published"})
        assert res.status_code == 200 and res.json()["edited"] is True and res.json()["published_at"]
        assert len((await client.get(f"/api/faq/courses/{c.id}")).json()["entries"]) == 2  # drafts included

    async with api_client(s) as client:
        entries = (await client.get(f"/api/faq/courses/{c.id}")).json()["entries"]
        assert [e["answer"] for e in entries] == ["Edited answer [S1]."] and "cluster_topic" not in entries[0]

    # The drafting run is logged, but as a professor run, so it never counts as a student question
    assert await TutorRun.find(TutorRun.endpoint == "faq_draft", TutorRun.user_role == "professor").count() == 1
    assert (await generate_question_insights(c.id, use_llm=False)).n_questions == 2


async def test_reports_flag_students_with_reasons_and_export(course, api_client):
    professor, (active, idle), c = await course(2)
    now = datetime.now(timezone.utc)
    await AnalyticsEvent(user_id=active.id, user_role="student", event_type="node_visited", event_category="navigation",
                         course_id=c.id, timestamp=now - timedelta(days=1)).insert()
    for node in ("n1", "n2"):
        await ConceptMastery(student_id=active.id, course_id=c.id, node_id=node, p_mastery=0.2, n_obs=3).insert()
    test = Test(course_id=c.id, professor_id=professor.id, title="Quiz", description="d", questions=[], total_marks=10)
    await test.insert()
    await TestAttempt(test_id=test.id, course_id=c.id, student_id=active.id, status="graded", percentage=40.0, submitted_at=now).insert()
    await add_run(c, active, "merge sort split")

    from app.services.insights.reports import build_report
    report = await build_report(c, "weekly")
    eng = report["engagement"]
    assert eng["enrolled_students"] == 2 and eng["active_students"] == 1 and eng["tutor_questions"] == 1
    assert eng["lecture_minutes_watched"] is None and eng["mean_test_percentage"] == 40.0
    flags = {f["name"]: f["reasons"] for f in report["flagged_students"]}
    assert flags["Student 1"] == ["No recorded activity in this course"]
    assert any("Low mastery on 2 concepts" in r for r in flags["Student 0"]) and "Average test score 40%" in flags["Student 0"]
    assert report["mastery_by_concept"][0]["students"] == 1

    async with api_client(professor) as client:
        res = await client.get(f"/api/insights/courses/{c.id}/reports/weekly.csv")
        assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
        rows = list(csv.DictReader(io.StringIO(res.text)))
        assert set(rows[0]) == {"section", "item", "metric", "value"}
        assert {"engagement", "mastery_by_concept", "flagged_students"} <= {r["section"] for r in rows}
        assert next(r for r in rows if r["metric"] == "lecture_minutes_watched")["value"] == "not measured"
        pdf = await client.get(f"/api/insights/courses/{c.id}/reports/term.pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        assert (await client.get(f"/api/insights/courses/{c.id}/reports/monthly.csv")).status_code == 404
    async with api_client(active) as client:
        assert (await client.get(f"/api/insights/courses/{c.id}/reports/weekly.csv")).status_code == 403


async def test_dashboard_answer_funnel_counts_live_student_runs(course):
    from app.services.analytics_service import answer_funnel
    _, (s,), c = await course()
    for support in ("strong", "strong", "weak"):
        await add_run(c, s, "q", support_level=support)
    await add_run(c, s, "q", decision="declined", support_level="none")
    await TutorRun(course_id=c.id, question="q", eval_run="eval-1", decision="answered").insert()
    funnel = await answer_funnel([c.id])
    links = {(link["source"], link["target"]): link["value"] for link in funnel["links"]}
    assert links == {("Questions", "Answered"): 3, ("Questions", "Declined"): 1,
                     ("Answered", "Strong support"): 2, ("Answered", "Weak support"): 1}
    assert {n["id"] for n in funnel["nodes"]} == {"Questions", "Answered", "Declined", "Strong support", "Weak support"}
