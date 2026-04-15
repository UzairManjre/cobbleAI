from fastapi import APIRouter, HTTPException, Depends, Query
from app.api.auth import current_active_user
from app.models.user import User
from app.models.study_plan import StudyPlan, StudyProgress, TopicPlan, Exercise, TopicStudyPlan
from app.models.graph import KnowledgeGraph
from app.models.course import Course
from app.services.study_plan_generator import StudyPlanGenerator
from typing import Optional
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel

router = APIRouter(prefix="/api/study-plans", tags=["study-plans"])

# Schemas
class GeneratePlanRequest(BaseModel):
    course_id: str
    graph_id: str

class CompleteTopicRequest(BaseModel):
    node_id: str

class CompleteExerciseRequest(BaseModel):
    exercise_id: str

@router.post("/generate")
async def generate_study_plan(
    req: GeneratePlanRequest,
    user: User = Depends(current_active_user)
):
    """Generate a study plan for a course based on its knowledge graph."""
    try:
        course_uuid = uuid.UUID(req.course_id)
        graph_uuid = uuid.UUID(req.graph_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    # Get course
    course = await Course.get(course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Get graph
    graph = await KnowledgeGraph.get(graph_uuid)
    if not graph:
        raise HTTPException(status_code=404, detail="Knowledge graph not found")
    
    if str(graph.course_id) != str(course_uuid):
        raise HTTPException(status_code=400, detail="Graph does not belong to this course")
    
    # Check if plan already exists
    existing_plan = await StudyPlan.find_one(
        StudyPlan.course_id == course_uuid,
        StudyPlan.student_id == user.id,
        StudyPlan.status == "active"
    )
    
    if existing_plan:
        return {
            "study_plan": existing_plan,
            "message": "Study plan already exists"
        }
    
    # Get document filenames for references
    from app.models.document import DocumentModel
    documents = await DocumentModel.find(
        DocumentModel.course_id == course_uuid,
        DocumentModel.status == "ready"
    ).to_list()
    document_filenames = [doc.filename for doc in documents]
    
    # Generate plan using LLM
    generator = StudyPlanGenerator()
    
    try:
        plan_data = await generator.generate_plan(
            course_title=course.title,
            course_description="",
            graph_nodes=graph.nodes,
            graph_edges=graph.edges,
            document_filenames=document_filenames
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate plan: {str(e)}")
    
    # Create StudyPlan document
    study_plan = StudyPlan(
        course_id=course_uuid,
        graph_id=graph_uuid,
        student_id=user.id,
        title=plan_data.get("title", f"Study Plan: {course.title}"),
        description=plan_data.get("description", ""),
        total_topics=len(plan_data.get("topics", [])),
        estimated_duration_hours=plan_data.get("estimated_duration_hours", 0),
        topics=[],  # Will be populated from plan_data
        status="active"
    )
    
    # Convert topics to TopicPlan documents
    topic_plans = []
    for topic_data in plan_data.get("topics", []):
        # Convert exercises
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
    
    # Save plan
    await study_plan.insert()
    
    # Create initial progress
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

@router.delete("/active")
async def delete_active_plan(user: User = Depends(current_active_user)):
    """Delete the user's active study plan."""
    plan = await StudyPlan.find_one(
        StudyPlan.student_id == user.id,
        StudyPlan.status == "active"
    )
    
    if not plan:
        return {"message": "No active plan found"}
    
    if str(plan.student_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your study plan")
    
    # Delete progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    if progress:
        await progress.delete()
    
    # Delete topic-level plans for this course
    topic_plans = await TopicStudyPlan.find(
        TopicStudyPlan.course_id == plan.course_id,
        TopicStudyPlan.student_id == user.id
    ).to_list()
    for tp in topic_plans:
        await tp.delete()
    
    # Delete plan
    await plan.delete()
    
    return {"message": "Study plan deleted"}

@router.post("/regenerate")
async def regenerate_study_plan(
    req: GeneratePlanRequest,
    user: User = Depends(current_active_user)
):
    """Delete existing plan and generate a new one."""
    try:
        course_uuid = uuid.UUID(req.course_id)
        graph_uuid = uuid.UUID(req.graph_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    # Delete existing plan and progress
    existing_plan = await StudyPlan.find_one(
        StudyPlan.course_id == course_uuid,
        StudyPlan.student_id == user.id
    )
    
    if existing_plan:
        # Delete progress
        progress = await StudyProgress.find_one(
            StudyProgress.study_plan_id == existing_plan.id,
            StudyProgress.student_id == user.id
        )
        if progress:
            await progress.delete()
        
        # Delete topic plans
        topic_plans = await TopicStudyPlan.find(
            TopicStudyPlan.course_id == course_uuid,
            TopicStudyPlan.student_id == user.id
        ).to_list()
        for tp in topic_plans:
            await tp.delete()
        
        # Delete old plan
        await existing_plan.delete()
    
    # Now generate new plan (same logic as /generate)
    course = await Course.get(course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    graph = await KnowledgeGraph.get(graph_uuid)
    if not graph:
        raise HTTPException(status_code=404, detail="Knowledge graph not found")
    
    from app.models.document import DocumentModel
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
            graph_nodes=graph.nodes,
            graph_edges=graph.edges,
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
        "message": "Study plan regenerated successfully"
    }

@router.get("/active")
async def get_active_plan(user: User = Depends(current_active_user)):
    """Get the user's active study plan."""
    plan = await StudyPlan.find_one(
        StudyPlan.student_id == user.id,
        StudyPlan.status == "active"
    )
    
    if not plan:
        return {"study_plan": None, "progress": None}
    
    # Get progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    
    return {
        "study_plan": plan,
        "progress": progress
    }

@router.get("/{plan_id}")
async def get_study_plan(plan_id: str, user: User = Depends(current_active_user)):
    """Get a specific study plan."""
    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    plan = await StudyPlan.get(plan_uuid)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")
    
    if plan.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your study plan")
    
    # Get progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    
    return {
        "study_plan": plan,
        "progress": progress
    }

@router.post("/{plan_id}/start")
async def start_plan(plan_id: str, user: User = Depends(current_active_user)):
    """Mark a study plan as active and start progress."""
    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    plan = await StudyPlan.get(plan_uuid)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")
    
    if plan.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your study plan")
    
    plan.status = "active"
    plan.updated_at = datetime.now(timezone.utc)
    await plan.save()
    
    # Get or create progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    
    if not progress:
        progress = StudyProgress(
            study_plan_id=plan.id,
            student_id=user.id,
            completed_topics=[],
            completed_exercises=[],
            time_spent_minutes=0,
            current_topic_index=0
        )
        await progress.insert()
    
    return {
        "study_plan": plan,
        "progress": progress,
        "message": "Study plan started"
    }

@router.post("/{plan_id}/topics/{node_id}/complete")
async def complete_topic(
    plan_id: str,
    node_id: str,
    user: User = Depends(current_active_user)
):
    """Mark a topic as completed."""
    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    plan = await StudyPlan.get(plan_uuid)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")
    
    if plan.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your study plan")
    
    # Get progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")
    
    # Mark topic as complete
    if node_id not in progress.completed_topics:
        progress.completed_topics.append(node_id)
    
    # Find topic index and update current
    for idx, topic in enumerate(plan.topics):
        if topic.node_id == node_id:
            progress.current_topic_index = idx + 1
            # Add estimated time to total
            progress.time_spent_minutes += topic.estimated_time_minutes
            break
    
    progress.last_accessed_at = datetime.now(timezone.utc)

    # Check if all topics are complete
    if len(progress.completed_topics) >= len(plan.topics):
        progress.completed_at = datetime.now(timezone.utc)
        plan.status = "completed"
        plan.completed_at = datetime.now(timezone.utc)
        await plan.save()
    
    await progress.save()
    
    return {
        "progress": progress,
        "completed": len(progress.completed_topics),
        "total": len(plan.topics),
        "percentage": round(len(progress.completed_topics) / len(plan.topics) * 100, 1)
    }

@router.post("/{plan_id}/exercises/{exercise_id}/complete")
async def complete_exercise(
    plan_id: str,
    exercise_id: str,
    user: User = Depends(current_active_user)
):
    """Mark an exercise as completed."""
    try:
        plan_uuid = uuid.UUID(plan_id)
        ex_uuid = uuid.UUID(exercise_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    plan = await StudyPlan.get(plan_uuid)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")
    
    if plan.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your study plan")
    
    # Get progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")
    
    # Mark exercise as complete
    if ex_uuid not in progress.completed_exercises:
        progress.completed_exercises.append(ex_uuid)
        progress.last_accessed_at = datetime.now(timezone.utc)
        await progress.save()

    # Count total exercises
    total_exercises = sum(len(t.exercises) for t in plan.topics)
    
    return {
        "progress": progress,
        "completed_exercises": len(progress.completed_exercises),
        "total_exercises": total_exercises
    }

@router.delete("/{plan_id}")
async def delete_study_plan(plan_id: str, user: User = Depends(current_active_user)):
    """Delete a study plan."""
    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
    
    plan = await StudyPlan.get(plan_uuid)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")
    
    if plan.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your study plan")
    
    # Delete progress
    progress = await StudyProgress.find_one(
        StudyProgress.study_plan_id == plan.id,
        StudyProgress.student_id == user.id
    )
    if progress:
        await progress.delete()
    
    # Delete plan
    await plan.delete()
    
    return {"message": "Study plan deleted"}

# ── Topic-Level Study Plans ─────────────────────────────────────────────────

@router.post("/topics/generate")
async def generate_topic_study_plan(
    node_id: str = Query(...),
    course_id: str = Query(...),
    user: User = Depends(current_active_user)
):
    """Generate a deep-dive study plan for a specific topic."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    # Get course and graph
    course = await Course.get(course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    graph = await KnowledgeGraph.find_one(KnowledgeGraph.course_id == course_uuid)
    if not graph:
        raise HTTPException(status_code=404, detail="Knowledge graph not found")

    # Find the topic node
    topic_node = None
    connected_topics = []
    for node in graph.nodes:
        if node.get("id") == node_id:
            topic_node = node

    if not topic_node:
        raise HTTPException(status_code=404, detail="Topic not found in graph")

    # Find connected topics
    for edge in graph.edges:
        if edge.get("from") == node_id:
            connected_label = next((n["label"] for n in graph.nodes if n["id"] == edge.get("to")), "")
            connected_topics.append({
                "node_id": edge.get("to"),
                "label": connected_label,
                "relation": edge.get("relation", "leads to")
            })
        elif edge.get("to") == node_id:
            connected_label = next((n["label"] for n in graph.nodes if n["id"] == edge.get("from")), "")
            connected_topics.append({
                "node_id": edge.get("from"),
                "label": connected_label,
                "relation": edge.get("relation", "leads to")
            })

    # Check if topic plan already exists
    existing = await TopicStudyPlan.find_one(
        TopicStudyPlan.course_id == course_uuid,
        TopicStudyPlan.student_id == user.id,
        TopicStudyPlan.node_id == node_id
    )

    if existing:
        return {"topic_plan": existing, "message": "Topic plan already exists"}

    # Get documents
    from app.models.document import DocumentModel
    documents = await DocumentModel.find(
        DocumentModel.course_id == course_uuid,
        DocumentModel.status == "ready"
    ).to_list()
    document_filenames = [doc.filename for doc in documents]

    # Generate topic plan
    generator = StudyPlanGenerator()
    try:
        plan_data = await generator.generate_topic_plan(
            topic_label=topic_node.get("label", "Unknown"),
            topic_description=topic_node.get("description", ""),
            course_title=course.title,
            connected_topics=connected_topics,
            document_filenames=document_filenames
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate topic plan: {str(e)}")

    # Create TopicStudyPlan
    topic_plan = TopicStudyPlan(
        course_id=course_uuid,
        student_id=user.id,
        node_id=node_id,
        title=plan_data.get("title", f"Deep Dive: {topic_node.get('label')}"),
        description=plan_data.get("description", ""),
        estimated_time_minutes=plan_data.get("estimated_time_minutes", 60),
        learning_path=plan_data.get("learning_path", []),
        exercises=plan_data.get("exercises", []),
        related_documents=plan_data.get("document_references", []),
        related_topics=connected_topics,
        self_check_questions=plan_data.get("self_check_questions", []),
        status="pending"
    )

    await topic_plan.insert()

    return {"topic_plan": topic_plan, "message": "Topic study plan generated"}

@router.get("/topics")
async def get_topic_study_plan(
    node_id: str = Query(...),
    course_id: str = Query(...),
    user: User = Depends(current_active_user)
):
    """Get a topic-level study plan."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    topic_plan = await TopicStudyPlan.find_one(
        TopicStudyPlan.course_id == course_uuid,
        TopicStudyPlan.student_id == user.id,
        TopicStudyPlan.node_id == node_id
    )

    if not topic_plan:
        return {"topic_plan": None}

    return {"topic_plan": topic_plan}

class UpdateTopicProgressRequest(BaseModel):
    progress: float

@router.post("/topics/progress")
async def update_topic_progress(
    req: UpdateTopicProgressRequest,
    node_id: str = Query(...),
    course_id: str = Query(...),
    user: User = Depends(current_active_user)
):
    """Update progress on a topic study plan."""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    topic_plan = await TopicStudyPlan.find_one(
        TopicStudyPlan.course_id == course_uuid,
        TopicStudyPlan.student_id == user.id,
        TopicStudyPlan.node_id == node_id
    )

    if not topic_plan:
        raise HTTPException(status_code=404, detail="Topic plan not found")

    topic_plan.progress = req.progress
    topic_plan.status = "in_progress" if req.progress < 100 else "completed"
    if req.progress >= 100:
        topic_plan.completed_at = datetime.now(timezone.utc)
    topic_plan.last_accessed_at = datetime.now(timezone.utc)

    await topic_plan.save()

    return {"topic_plan": topic_plan}
