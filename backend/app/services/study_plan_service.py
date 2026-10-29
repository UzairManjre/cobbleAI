import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from app.models.user import User
from app.models.study_plan import StudyPlan, StudyProgress, TopicPlan, Exercise, TopicStudyPlan
from app.models.graph import KnowledgeGraph
from app.models.course import Course
from app.models.document import DocumentModel
from app.services.study_plan_generator import StudyPlanGenerator
from app.schemas.study_plan import GeneratePlanRequest

class StudyPlanService:
    @staticmethod
    async def generate_study_plan(user: User, req: GeneratePlanRequest) -> dict:
        try:
            course_uuid = uuid.UUID(req.course_id)
            graph_uuid = uuid.UUID(req.graph_id) if req.graph_id else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")

        from app.services.access import ensure_course_access
        course = await ensure_course_access(user, course_uuid)

        if graph_uuid:
            graph = await KnowledgeGraph.get(graph_uuid)
        else:
            graph = await KnowledgeGraph.find(
                KnowledgeGraph.course_id == course_uuid
            ).sort(-KnowledgeGraph.created_at).first_or_none()
        if not graph:
            raise HTTPException(status_code=404, detail="Knowledge graph not found")
        graph_uuid = graph.id
        if str(graph.course_id) != str(course_uuid):
            raise HTTPException(status_code=400, detail="Graph does not belong to this course")

        existing_plan = await StudyPlan.find_one(
            StudyPlan.course_id == course_uuid,
            StudyPlan.student_id == user.id,
            StudyPlan.status == "active"
        )
        if existing_plan:
            return {"study_plan": existing_plan, "message": "Study plan already exists"}

        documents = await DocumentModel.find(
            DocumentModel.course_id == course_uuid,
            DocumentModel.status == "ready"
        ).to_list()
        document_filenames = [doc.filename for doc in documents]

        generator = StudyPlanGenerator()
        try:
            plan_data = await generator.generate_plan(
                course_title=course.title,
                course_description="",
                graph_nodes=graph.nodes_as_dicts(),
                graph_edges=graph.edges_as_dicts(),
                document_filenames=document_filenames
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate plan: {str(e)}")

        study_plan = StudyPlan(
            course_id=course_uuid,
            graph_id=graph_uuid,
            student_id=user.id,
            title=plan_data.get("title", f"Study Plan: {course.title}"),
            description=plan_data.get("description", ""),
            total_topics=len(plan_data.get("topics", [])),
            estimated_duration_hours=plan_data.get("estimated_duration_hours", 0),
            topics=[],
            status="active"
        )

        topic_plans = []
        for topic_data in plan_data.get("topics", []):
            exercises = []
            for ex_data in topic_data.get("exercises", []):
                ex = Exercise(
                    type=ex_data.get("type", "quiz"),
                    title=ex_data.get("title", ""),
                    description=ex_data.get("description", ""),
                    difficulty=ex_data.get("difficulty", "medium"),
                    solution=ex_data.get("solution"),
                    hints=ex_data.get("hints", []),
                    estimated_time_minutes=ex_data.get("estimated_time_minutes", 15)
                )
                exercises.append(ex)
            
            topic = TopicPlan(
                order=topic_data.get("order", 0),
                node_id=topic_data.get("node_id", ""),
                node_label=topic_data.get("node_label", ""),
                node_description=topic_data.get("node_description"),
                estimated_time_minutes=topic_data.get("estimated_time_minutes", 30),
                difficulty=topic_data.get("difficulty", "medium"),
                prerequisites=topic_data.get("prerequisites", []),
                learning_objectives=topic_data.get("learning_objectives", []),
                key_concepts=topic_data.get("key_concepts", []),
                exercises=exercises,
                document_references=topic_data.get("document_references", []),
                notes=topic_data.get("notes")
            )
            topic_plans.append(topic)
        
        study_plan.topics = topic_plans
        await study_plan.insert()

        progress = StudyProgress(
            study_plan_id=study_plan.id,
            student_id=user.id,
            completed_topics=[],
            completed_exercises=[],
            time_spent_minutes=0,
            current_topic_index=0
        )
        await progress.insert()

        return {
            "study_plan": study_plan,
            "progress": progress,
            "message": "Study plan generated successfully"
        }

    @staticmethod
    async def delete_active_plan(user: User, course_id: str | None = None) -> dict:
        filters = [StudyPlan.student_id == user.id, StudyPlan.status == "active"]
        if course_id:
            try:
                filters.append(StudyPlan.course_id == uuid.UUID(course_id))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid UUID format")
        plan = await StudyPlan.find_one(*filters)
        if not plan:
            return {"message": "No active plan found"}
        if str(plan.student_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Not your study plan")

        progress = await StudyProgress.find_one(
            StudyProgress.study_plan_id == plan.id,
            StudyProgress.student_id == user.id
        )
        if progress:
            await progress.delete()

        topic_plans = await TopicStudyPlan.find(
            TopicStudyPlan.course_id == plan.course_id,
            TopicStudyPlan.student_id == user.id
        ).to_list()
        for tp in topic_plans:
            await tp.delete()

        await plan.delete()
        return {"message": "Study plan deleted"}

    @staticmethod
    async def get_active_plan(user: User, course_id: str) -> dict:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")

        from app.repositories.study_plan_repository import StudyPlanRepository, StudyProgressRepository
        
        plan_repo = StudyPlanRepository()
        plan = await plan_repo.find_active_plan(course_uuid, user.id)
        if not plan:
            return {"study_plan": None, "progress": None}

        progress_repo = StudyProgressRepository()
        progress = await progress_repo.find_by_study_plan_and_student(plan.id, user.id)
        return {"study_plan": plan, "progress": progress}

    @staticmethod
    async def complete_topic(user: User, course_id: str, node_id: str) -> dict:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")

        plan = await StudyPlan.find_one(
            StudyPlan.course_id == course_uuid,
            StudyPlan.student_id == user.id,
            StudyPlan.status == "active"
        )
        if not plan:
            raise HTTPException(status_code=404, detail="No active study plan")

        progress = await StudyProgress.find_one(
            StudyProgress.study_plan_id == plan.id,
            StudyProgress.student_id == user.id
        )
        if not progress:
            raise HTTPException(status_code=404, detail="Progress not found")

        if node_id not in progress.completed_topics:
            progress.completed_topics.append(node_id)
            progress.current_topic_index = len(progress.completed_topics)
            progress.last_accessed_at = datetime.now(timezone.utc)
            if len(progress.completed_topics) >= plan.total_topics:
                plan.status = "completed"
                await plan.save()
            await progress.save()

        return {"progress": progress, "message": "Topic marked as complete"}

    @staticmethod
    async def complete_exercise(user: User, course_id: str, exercise_id: str) -> dict:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID")

        plan = await StudyPlan.find_one(
            StudyPlan.course_id == course_uuid,
            StudyPlan.student_id == user.id,
            StudyPlan.status == "active"
        )
        if not plan:
            raise HTTPException(status_code=404, detail="No active study plan")

        progress = await StudyProgress.find_one(
            StudyProgress.study_plan_id == plan.id,
            StudyProgress.student_id == user.id
        )
        if not progress:
            raise HTTPException(status_code=404, detail="Progress not found")

        if exercise_id not in progress.completed_exercises:
            progress.completed_exercises.append(exercise_id)
            progress.last_accessed_at = datetime.now(timezone.utc)
            await progress.save()

        return {"progress": progress, "message": "Exercise marked as complete"}

    #   Deep-dive plan for one topic (the StudyPlan page's "Deep Dive" button)

    @staticmethod
    def _topic_plan_view(tp: TopicStudyPlan) -> dict:
        from fastapi.encoders import jsonable_encoder
        return jsonable_encoder(tp)

    @staticmethod
    async def get_topic_plan(user: User, course_id: str, node_id: str) -> dict:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")
        from app.services.access import ensure_course_access
        await ensure_course_access(user, course_uuid)
        tp = await TopicStudyPlan.find(
            TopicStudyPlan.course_id == course_uuid, TopicStudyPlan.student_id == user.id, TopicStudyPlan.node_id == node_id,
        ).sort(-TopicStudyPlan.created_at).first_or_none()
        return {"topic_plan": StudyPlanService._topic_plan_view(tp) if tp else None}

    @staticmethod
    async def generate_topic_plan(user: User, course_id: str, node_id: str) -> dict:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")
        from app.services.access import ensure_course_access
        course = await ensure_course_access(user, course_uuid)
        graph = await KnowledgeGraph.find(KnowledgeGraph.course_id == course_uuid).sort(-KnowledgeGraph.created_at).first_or_none()
        node = graph.find_node(node_id) if graph else None
        if not node:
            raise HTTPException(status_code=404, detail="Topic not found in the course graph")
        documents = await DocumentModel.find(DocumentModel.course_id == course_uuid, DocumentModel.status == "ready").to_list()
        neighbors = graph.neighbors(node_id)
        try:
            data = await StudyPlanGenerator().generate_topic_plan(
                topic_label=node.label, topic_description=node.description or "", course_title=course.title,
                connected_topics=neighbors, document_filenames=[d.filename for d in documents],
            )
        except Exception:
            raise HTTPException(status_code=502, detail="The topic plan could not be generated. Try again.")
        exercises = []
        for ex in data.get("exercises") or []:
            if isinstance(ex, dict) and ex.get("title"):
                try:
                    exercises.append(Exercise(
                        type=str(ex.get("type") or "reflection"), title=str(ex["title"]),
                        description=str(ex.get("description") or ""), difficulty=str(ex.get("difficulty") or "medium"),
                        solution=ex.get("solution"), hints=[str(h) for h in ex.get("hints") or []],
                        estimated_time_minutes=int(ex.get("estimated_time_minutes") or 15),
                    ))
                except (TypeError, ValueError):
                    continue
        tp = TopicStudyPlan(
            course_id=course_uuid, student_id=user.id, node_id=node_id,
            title=str(data.get("title") or f"Deep Dive: {node.label}"),
            description=str(data.get("description") or ""),
            estimated_time_minutes=int(data.get("estimated_time_minutes") or 60),
            learning_path=[s for s in data.get("learning_path") or [] if isinstance(s, dict)],
            exercises=exercises,
            related_documents=[str(d) for d in data.get("related_documents") or []][:20],
            related_topics=[{"node_id": n["node_id"], "label": n["label"], "relation": n["relation"]} for n in neighbors],
            self_check_questions=[q for q in data.get("self_check_questions") or [] if isinstance(q, dict)],
        )
        await tp.insert()
        return {"topic_plan": StudyPlanService._topic_plan_view(tp)}
