"""Weekly question-insight digest for every course that had student tutor questions."""

import asyncio
from datetime import datetime, timedelta, timezone

from app.core.celery_app import celery_app


async def run_weekly_insights(days: int = 7) -> dict:
    from app.core.db import connect_to_mongo
    from app.models.tutor import TutorRun
    from app.services.insights.questions import generate_question_insights

    await connect_to_mongo()
    since = datetime.now(timezone.utc) - timedelta(days=days)
    course_ids = await TutorRun.get_motor_collection().distinct(
        "course_id", {"user_role": "student", "eval_run": None, "created_at": {"$gte": since}})
    done = 0
    for course_id in course_ids:
        if course_id is None:
            continue
        try:
            await generate_question_insights(course_id, days=days, generated_by="weekly_task")
            done += 1
        except Exception as e:
            print(f"  Question insights failed for course {course_id}: {e}")
    return {"courses": done}


@celery_app.task(name="insights.weekly_question_insights", bind=True, soft_time_limit=1800, time_limit=2100)
def weekly_question_insights(self):
    return asyncio.run(run_weekly_insights())
