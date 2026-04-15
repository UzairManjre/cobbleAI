"""
Celery scheduled tasks for analytics aggregation.

These tasks run on a schedule to roll up raw analytics_events into
pre-computed aggregates, update user profiles, and detect dropout risk.

Activation:
    celery -A app.core.celery_app.celery_app worker --beat --loglevel=info

Or start beat separately:
    celery -A app.core.celery_app.celery_app beat --loglevel=info
"""

import asyncio
from datetime import datetime, date, timedelta, timezone
from typing import Optional
from celery import shared_task
from pymongo import MongoClient
from app.core.config import settings


# ── Helpers ──────────────────────────────────────────────────────────────

def _get_motor_db():
    """Get Motor database client for async operations."""
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
    return client[settings.DATABASE_NAME]


def _get_sync_db():
    """Get sync PyMongo client for Celery tasks."""
    return MongoClient(settings.MONGO_URI, uuidRepresentation="standard")[settings.DATABASE_NAME]


def _uuid_to_bytes(uuid_obj):
    """Convert UUID to MongoDB Binary representation."""
    import uuid as _uuid
    if isinstance(uuid_obj, _uuid.UUID):
        from bson.binary import Binary
        return Binary.from_uuid(uuid_obj)
    return uuid_obj


# ── Task 1: Compute Daily Aggregates ─────────────────────────────────────

@shared_task(
    name="analytics.compute_daily_aggregates",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def compute_daily_aggregates(self, target_date_str: Optional[str] = None):
    """
    Roll up yesterday's analytics_events into AnalyticsAggregate documents.

    Creates four aggregate types:
    - user_daily: Per-user daily stats
    - course_daily: Per-course daily stats
    - node_daily: Per-node daily stats
    - global_daily: Platform-wide daily stats

    Idempotent: safe to re-run for the same date.
    """
    target_date = date.fromisoformat(target_date_str) if target_date_str else date.today() - timedelta(days=1)
    day_start = datetime(target_date.year, target_date.month, target_date.day)
    day_end = day_start + timedelta(days=1)

    db = _get_sync_db()
    events = db["analytics_events"]
    aggregates = db["analytics_aggregates"]

    print(f"📊 Computing daily aggregates for {target_date}...")

    try:
        # ── User Daily Aggregates ──────────────────────────────────────
        user_pipeline = [
            {"$match": {
                "timestamp": {"$gte": day_start, "$lt": day_end},
                "user_id": {"$ne": None},
            }},
            {"$group": {
                "_id": {
                    "user_id": "$user_id",
                    "user_role": "$user_role",
                },
                "sessions_count": {"$sum": {"$cond": [{"$eq": ["$event_type", "session_started"]}, 1, 0]}},
                "questions_asked": {"$sum": {"$cond": [{"$eq": ["$event_type", "question_asked"]}, 1, 0]}},
                "nodes_visited": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_visited"]}, 1, 0]}},
                "unique_nodes": {"$addToSet": "$node_id"},
                "course_ids": {"$addToSet": "$course_id"},
                "graph_ids": {"$addToSet": "$graph_id"},
                "hours_active": {"$addToSet": {"$hour": "$timestamp"}},
            }},
            {"$project": {
                "user_id": "$_id.user_id",
                "user_role": "$_id.user_role",
                "sessions_count": 1,
                "questions_asked": 1,
                "nodes_visited": 1,
                "unique_nodes_count": {"$size": {"$setUnion": ["$unique_nodes"]}},
                "courses_active": {"$size": {"$setUnion": ["$course_ids"]}},
                "graphs_explored": {"$size": {"$setUnion": ["$graph_ids"]}},
                "active_hours": {"$size": "$hours_active"},
            }}
        ]

        user_stats = list(events.aggregate(user_pipeline))
        for stat in user_stats:
            aggregates.update_one(
                {
                    "aggregate_type": "user_daily",
                    "user_id": stat["user_id"],
                    "date": target_date,
                },
                {
                    "$setOnInsert": {"aggregate_type": "user_daily", "user_id": stat["user_id"], "date": target_date},
                    "$set": {
                        "metrics": {
                            "sessions_count": stat["sessions_count"],
                            "questions_asked": stat["questions_asked"],
                            "nodes_visited": stat["nodes_visited"],
                            "unique_nodes_visited": stat["unique_nodes_count"],
                            "courses_active": stat["courses_active"],
                            "graphs_explored": stat["graphs_explored"],
                            "active_hours": stat["active_hours"],
                        },
                        "updated_at": datetime.now(timezone.utc),
                    },
                },
                upsert=True,
            )

        print(f"   ✅ {len(user_stats)} user daily aggregates")

        # ── Course Daily Aggregates ────────────────────────────────────
        course_pipeline = [
            {"$match": {
                "timestamp": {"$gte": day_start, "$lt": day_end},
                "course_id": {"$ne": None},
            }},
            {"$group": {
                "_id": {"course_id": "$course_id"},
                "unique_students": {"$addToSet": "$user_id"},
                "sessions_count": {"$sum": {"$cond": [{"$eq": ["$event_type", "session_started"]}, 1, 0]}},
                "questions_asked": {"$sum": {"$cond": [{"$eq": ["$event_type", "question_asked"]}, 1, 0]}},
                "nodes_visited": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_visited"]}, 1, 0]}},
                "documents_uploaded": {"$sum": {"$cond": [{"$eq": ["$event_type", "document_uploaded"]}, 1, 0]}},
                "graphs_generated": {"$sum": {"$cond": [{"$eq": ["$event_type", "graph_generated"]}, 1, 0]}},
            }},
        ]

        course_stats = list(events.aggregate(course_pipeline))
        for stat in course_stats:
            aggregates.update_one(
                {
                    "aggregate_type": "course_daily",
                    "course_id": stat["_id"]["course_id"],
                    "date": target_date,
                },
                {
                    "$setOnInsert": {"aggregate_type": "course_daily", "course_id": stat["_id"]["course_id"], "date": target_date},
                    "$set": {
                        "metrics": {
                            "unique_students": len(stat["unique_students"]),
                            "sessions_count": stat["sessions_count"],
                            "questions_asked": stat["questions_asked"],
                            "nodes_visited": stat["nodes_visited"],
                            "documents_uploaded": stat["documents_uploaded"],
                            "graphs_generated": stat["graphs_generated"],
                        },
                        "updated_at": datetime.now(timezone.utc),
                    },
                },
                upsert=True,
            )

        print(f"   ✅ {len(course_stats)} course daily aggregates")

        # ── Node Daily Aggregates ──────────────────────────────────────
        node_pipeline = [
            {"$match": {
                "timestamp": {"$gte": day_start, "$lt": day_end},
                "node_id": {"$ne": None},
                "graph_id": {"$ne": None},
            }},
            {"$group": {
                "_id": {"graph_id": "$graph_id", "node_id": "$node_id"},
                "total_visits": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_visited"]}, 1, 0]}},
                "total_revisits": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_revisited"]}, 1, 0]}},
                "questions_asked": {"$sum": {"$cond": [{"$eq": ["$event_type", "question_asked"]}, 1, 0]}},
                "unique_students": {"$addToSet": "$user_id"},
                "node_label": {"$first": "$payload.node_label"},
                "hour": {"$hour": "$timestamp"},
            }},
        ]

        node_stats = list(events.aggregate(node_pipeline))
        for stat in node_stats:
            hour_dist_key = f"hour_{stat.get('hour', 0)}"
            aggregates.update_one(
                {
                    "aggregate_type": "node_daily",
                    "graph_id": stat["_id"]["graph_id"],
                    "node_id": stat["_id"]["node_id"],
                    "date": target_date,
                },
                {
                    "$setOnInsert": {
                        "aggregate_type": "node_daily",
                        "graph_id": stat["_id"]["graph_id"],
                        "node_id": stat["_id"]["node_id"],
                        "date": target_date,
                    },
                    "$set": {
                        "metrics": {
                            "total_visits": stat["total_visits"],
                            "total_revisits": stat["total_revisits"],
                            "questions_asked": stat["questions_asked"],
                            "unique_students": len(stat["unique_students"]),
                            "node_label": stat.get("node_label", ""),
                        },
                        "updated_at": datetime.now(timezone.utc),
                    },
                },
                upsert=True,
            )

        print(f"   ✅ {len(node_stats)} node daily aggregates")

        # ── Global Daily Aggregate ─────────────────────────────────────
        global_pipeline = [
            {"$match": {"timestamp": {"$gte": day_start, "$lt": day_end}}},
            {"$group": {
                "_id": None,
                "total_events": {"$sum": 1},
                "unique_users": {"$addToSet": "$user_id"},
                "total_sessions": {"$sum": {"$cond": [{"$eq": ["$event_type", "session_started"]}, 1, 0]}},
                "total_questions": {"$sum": {"$cond": [{"$eq": ["$event_type", "question_asked"]}, 1, 0]}},
                "total_nodes_visited": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_visited"]}, 1, 0]}},
                "total_documents": {"$sum": {"$cond": [{"$eq": ["$event_type", "document_uploaded"]}, 1, 0]}},
                "total_graphs": {"$sum": {"$cond": [{"$eq": ["$event_type", "graph_generated"]}, 1, 0]}},
                "total_llm_calls": {"$sum": {"$cond": [{"$eq": ["$event_type", "llm_call"]}, 1, 0]}},
                "total_rag_queries": {"$sum": {"$cond": [{"$eq": ["$event_type", "rag_query"]}, 1, 0]}},
                "total_errors": {"$sum": {"$cond": [{"$eq": ["$event_type", "api_error"]}, 1, 0]}},
            }},
        ]

        global_stats = list(events.aggregate(global_pipeline))
        if global_stats:
            stat = global_stats[0]
            aggregates.update_one(
                {"aggregate_type": "global_daily", "date": target_date},
                {
                    "$setOnInsert": {"aggregate_type": "global_daily", "date": target_date},
                    "$set": {
                        "metrics": {
                            "total_events": stat["total_events"],
                            "unique_users": len(stat["unique_users"]),
                            "total_sessions": stat["total_sessions"],
                            "total_questions": stat["total_questions"],
                            "total_nodes_visited": stat["total_nodes_visited"],
                            "total_documents": stat["total_documents"],
                            "total_graphs": stat["total_graphs"],
                            "total_llm_calls": stat["total_llm_calls"],
                            "total_rag_queries": stat["total_rag_queries"],
                            "total_errors": stat["total_errors"],
                        },
                        "updated_at": datetime.now(timezone.utc),
                    },
                },
                upsert=True,
            )
            print(f"   ✅ 1 global daily aggregate")

        print(f"✅ Daily aggregation complete for {target_date}")
        return {
            "date": str(target_date),
            "user_count": len(user_stats),
            "course_count": len(course_stats),
            "node_count": len(node_stats),
        }

    except Exception as exc:
        print(f"❌ Daily aggregation failed: {exc}")
        raise self.retry(exc=exc)


# ── Task 2: Update User Profiles ─────────────────────────────────────────

@shared_task(
    name="analytics.update_user_profiles",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
)
def update_user_profiles(self):
    """
    Recompute per-user analytics profiles from all historical events.

    Updates:
    - lifetime_stats: total sessions, study time, questions, nodes, streak
    - topic_interests: ranked list of topics the student engages with
    - performance_indicators: engagement level, dropout risk
    """
    db = _get_sync_db()
    events = db["analytics_events"]
    profiles = db["analytics_user_profiles"]

    print("👤 Updating user profiles...")

    try:
        # Get all unique users with events
        user_ids = events.distinct("user_id", {"user_id": {"$ne": None}})
        print(f"   Found {len(user_ids)} users with analytics events")

        updated_count = 0
        for user_id in user_ids:
            if not user_id:
                continue

            # Get user role from most recent event
            latest_event = events.find_one(
                {"user_id": user_id},
                sort=[("timestamp", -1)],
                projection={"user_role": 1}
            )
            user_role = latest_event.get("user_role", "student") if latest_event else "student"

            # Compute lifetime stats
            lifetime_pipeline = [
                {"$match": {"user_id": user_id}},
                {"$group": {
                    "_id": None,
                    "total_sessions": {"$sum": {"$cond": [{"$eq": ["$event_type", "session_started"]}, 1, 0]}},
                    "total_questions": {"$sum": {"$cond": [{"$eq": ["$event_type", "question_asked"]}, 1, 0]}},
                    "total_nodes_visited": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_visited"]}, 1, 0]}},
                    "unique_nodes": {"$addToSet": "$node_id"},
                    "unique_graphs": {"$addToSet": "$graph_id"},
                    "unique_courses": {"$addToSet": "$course_id"},
                    "first_session": {"$min": {"$cond": [{"$eq": ["$event_type", "session_started"]}, "$timestamp", None]}},
                    "last_active": {"$max": "$timestamp"},
                    "active_dates": {"$addToSet": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}},
                }}
            ]

            stats_list = list(events.aggregate(lifetime_pipeline))
            if not stats_list:
                continue

            stats = stats_list[0]

            # Compute study streak
            active_dates = sorted([date.fromisoformat(d) for d in stats.get("active_dates", []) if d])
            streak = 0
            if active_dates:
                today = date.today()
                check_date = today
                while check_date in active_dates:
                    streak += 1
                    check_date -= timedelta(days=1)

            # Average session duration estimate (from session events)
            session_events = list(events.find(
                {"user_id": user_id, "event_type": "session_ended"},
                projection={"payload.durationMs": 1}
            ))
            avg_session_sec = 0
            if session_events:
                durations = [
                    e.get("payload", {}).get("durationMs", 0) / 1000
                    for e in session_events
                    if e.get("payload", {}).get("durationMs")
                ]
                avg_session_sec = sum(durations) / len(durations) if durations else 0

            # Preferred study time
            hour_events = list(events.find(
                {"user_id": user_id, "event_type": {"$in": ["session_started", "question_asked"]}},
                projection={"hour": {"$hour": "$timestamp"}}
            ))
            hour_counts = {}
            for e in hour_events:
                h = e.get("hour", 12)
                hour_counts[h] = hour_counts.get(h, 0) + 1

            preferred_hour = max(hour_counts, key=hour_counts.get) if hour_counts else 12
            if 6 <= preferred_hour < 12:
                preferred_time = "morning"
            elif 12 <= preferred_hour < 17:
                preferred_time = "afternoon"
            elif 17 <= preferred_hour < 21:
                preferred_time = "evening"
            else:
                preferred_time = "night"

            # Learning style (from navigation patterns)
            nav_events_list = list(events.find(
                {"user_id": user_id, "event_type": {"$in": ["node_visited", "node_revisited"]}},
                sort=[("timestamp", 1)],
                projection={"node_id": 1, "event_type": 1}
            ))
            revisit_ratio = 0
            if nav_events_list:
                revisits = sum(1 for e in nav_events_list if e["event_type"] == "node_revisited")
                revisit_ratio = revisits / len(nav_events_list)

            learning_style = "exploratory" if revisit_ratio > 0.3 else "linear"

            # Engagement level
            total_sessions = stats.get("total_sessions", 0) or 0
            if total_sessions >= 10:
                engagement = "high"
            elif total_sessions >= 3:
                engagement = "medium"
            else:
                engagement = "low"

            # Dropout risk
            last_active_dt = stats.get("last_active")
            days_inactive = 999
            if last_active_dt:
                days_inactive = (datetime.now(timezone.utc) - last_active_dt).days

            if days_inactive > 14:
                dropout_risk = "high"
            elif days_inactive > 7:
                dropout_risk = "medium"
            else:
                dropout_risk = "low"

            # Knowledge coverage (% of unique nodes visited vs total available)
            unique_nodes = len([n for n in stats.get("unique_nodes", []) if n])
            # Rough estimate — assume 20 nodes per graph on average
            total_estimated_nodes = len(stats.get("unique_graphs", []) or []) * 20
            knowledge_coverage = unique_nodes / max(total_estimated_nodes, 1)

            profile_doc = {
                "user_id": user_id,
                "lifetime_stats": {
                    "total_sessions": total_sessions,
                    "total_questions_asked": stats.get("total_questions", 0) or 0,
                    "total_nodes_visited": unique_nodes,
                    "total_graphs_explored": len(stats.get("unique_graphs", []) or []),
                    "total_courses_enrolled": len(stats.get("unique_courses", []) or []),
                    "first_session_date": stats.get("first_session"),
                    "last_active_date": stats.get("last_active"),
                    "study_streak_days": streak,
                    "avg_session_duration_sec": round(avg_session_sec, 1),
                    "preferred_study_time": preferred_time,
                    "learning_style": learning_style,
                },
                "performance_indicators": {
                    "engagement_level": engagement,
                    "risk_of_dropout": dropout_risk,
                    "knowledge_coverage_pct": round(min(knowledge_coverage, 1.0), 2),
                    "days_inactive": days_inactive,
                },
                "updated_at": datetime.now(timezone.utc),
            }

            profiles.update_one(
                {"user_id": user_id},
                {"$set": profile_doc},
                upsert=True,
            )
            updated_count += 1

        print(f"✅ Updated {updated_count} user profiles")
        return {"updated_count": updated_count}

    except Exception as exc:
        print(f"❌ User profile update failed: {exc}")
        raise self.retry(exc=exc)


# ── Task 3: Update Node Metrics ──────────────────────────────────────────

@shared_task(
    name="analytics.update_node_metrics",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
)
def update_node_metrics(self):
    """
    Aggregate navigation + chat events per node and update AnalyticsNodeMetrics.

    Runs every 6 hours. Updates visit counts, question counts, confusion scores,
    and time distributions.
    """
    db = _get_sync_db()
    events = db["analytics_events"]
    node_metrics = db["analytics_node_metrics"]

    print("📐 Updating node metrics...")

    try:
        # Aggregate per (graph, node) pair
        pipeline = [
            {"$match": {
                "node_id": {"$ne": None},
                "graph_id": {"$ne": None},
                "event_type": {"$in": [
                    "node_visited", "node_revisited", "node_dwell",
                    "question_asked", "answer_received",
                ]},
            }},
            {"$group": {
                "_id": {"graph_id": "$graph_id", "node_id": "$node_id"},
                "total_visits": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_visited"]}, 1, 0]}},
                "total_revisits": {"$sum": {"$cond": [{"$eq": ["$event_type", "node_revisited"]}, 1, 0]}},
                "total_questions": {"$sum": {"$cond": [{"$eq": ["$event_type", "question_asked"]}, 1, 0]}},
                "unique_students": {"$addToSet": "$user_id"},
                "node_label": {"$first": "$payload.node_label"},
                "course_id": {"$first": "$course_id"},
                "dwell_times": {"$push": {
                    "$cond": [
                        {"$eq": ["$event_type", "node_dwell"]},
                        "$payload.dwellTimeMs",
                        None
                    ]
                }},
                "hours": {"$push": {"$hour": "$timestamp"}},
                "days_of_week": {"$push": {"$dayOfWeek": "$timestamp"}},
            }},
        ]

        node_stats = list(events.aggregate(pipeline))

        updated_count = 0
        for stat in node_stats:
            graph_id = stat["_id"]["graph_id"]
            node_id = stat["_id"]["node_id"]
            if not graph_id or not node_id:
                continue

            total_visits = stat["total_visits"] + stat["total_revisits"]
            unique_students = len(stat["unique_students"])

            # Average dwell time
            dwell_times = [d for d in stat["dwell_times"] if d is not None]
            avg_dwell_sec = (sum(dwell_times) / len(dwell_times) / 1000) if dwell_times else 0

            # Hour distribution
            hour_dist = {}
            for h in stat["hours"]:
                if h is not None:
                    hour_dist[str(h)] = hour_dist.get(str(h), 0) + 1

            # Day of week distribution
            dow_dist = {}
            for d in stat["days_of_week"]:
                if d is not None:
                    dow_dist[str(d)] = dow_dist.get(str(d), 0) + 1

            # Confusion score (same formula as in AnalyticsService)
            revisit_rate = stat["total_revisits"] / max(total_visits, 1)
            time_norm = min(avg_dwell_sec / 300.0, 1.0)
            question_norm = min((stat["total_questions"] / max(unique_students, 1)) / 5.0, 1.0)
            confusion_score = 0.4 * min(revisit_rate, 1.0) + 0.3 * time_norm + 0.3 * question_norm

            node_metrics.update_one(
                {"graph_id": graph_id, "node_id": node_id},
                {
                    "$setOnInsert": {"graph_id": graph_id, "node_id": node_id},
                    "$set": {
                        "node_label": stat.get("node_label", ""),
                        "course_id": stat.get("course_id"),
                        "total_visits": total_visits,
                        "unique_students": unique_students,
                        "total_questions_asked": stat["total_questions"],
                        "avg_dwell_time_sec": round(avg_dwell_sec, 1),
                        "revisit_rate": round(revisit_rate, 3),
                        "confusion_score": round(confusion_score, 3),
                        "hour_distribution": hour_dist,
                        "day_of_week_distribution": dow_dist,
                        "updated_at": datetime.now(timezone.utc),
                    },
                },
                upsert=True,
            )
            updated_count += 1

        print(f"✅ Updated {updated_count} node metrics")
        return {"updated_count": updated_count}

    except Exception as exc:
        print(f"❌ Node metrics update failed: {exc}")
        raise self.retry(exc=exc)


# ── Task 4: Detect Dropout Risk ──────────────────────────────────────────

@shared_task(
    name="analytics.detect_dropout_risk",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def detect_dropout_risk(self):
    """
    Scan user profiles for students at risk of dropping out.

    Flags students who:
    - Haven't been active in 7+ days
    - Have declining session counts
    - Have low engagement levels

    Runs weekly.
    """
    db = _get_sync_db()
    profiles = db["analytics_user_profiles"]

    print("🚨 Detecting dropout risk...")

    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=7)
        flagged_count = 0

        # Find all student profiles
        cursor = profiles.find({"performance_indicators": {"$exists": True}})

        for profile in cursor:
            user_id = profile["user_id"]
            perf = profile.get("performance_indicators", {})
            lifetime = profile.get("lifetime_stats", {})

            last_active = lifetime.get("last_active_date")
            streak = lifetime.get("study_streak_days", 0)
            total_sessions = lifetime.get("total_sessions", 0)

            # Calculate days inactive
            days_inactive = 999
            if last_active:
                days_inactive = (datetime.now(timezone.utc) - last_active).days

            # Determine risk level
            if days_inactive > 14:
                new_risk = "high"
            elif days_inactive > 7:
                new_risk = "medium"
            elif total_sessions < 3 and days_inactive > 3:
                new_risk = "medium"
            else:
                new_risk = "low"

            # Determine engagement
            if total_sessions >= 10 and days_inactive <= 3:
                new_engagement = "high"
            elif total_sessions >= 3:
                new_engagement = "medium"
            else:
                new_engagement = "low"

            # Update if changed
            if perf.get("risk_of_dropout") != new_risk or perf.get("engagement_level") != new_engagement:
                profiles.update_one(
                    {"_id": profile["_id"]},
                    {
                        "$set": {
                            "performance_indicators.risk_of_dropout": new_risk,
                            "performance_indicators.engagement_level": new_engagement,
                            "performance_indicators.days_inactive": days_inactive,
                            "performance_indicators.flagged_for_dropout": new_risk == "high",
                            "updated_at": datetime.now(timezone.utc),
                        }
                    }
                )
                if new_risk == "high":
                    flagged_count += 1
                    print(f"   ⚠️ Flagged user {user_id} for dropout risk (inactive {days_inactive} days)")

        print(f"✅ Dropout detection complete. {flagged_count} students flagged.")
        return {"flagged_count": flagged_count}

    except Exception as exc:
        print(f"❌ Dropout detection failed: {exc}")
        raise self.retry(exc=exc)
