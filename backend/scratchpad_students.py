from app.models.study_plan import StudyPlan, StudyProgress
from beanie.operators import In
import hashlib

@router.get("/professor/students")
async def get_professor_students(
    user: User = Depends(current_active_user)
):
    """Get all students enrolled in all courses owned by the professor."""
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # 1. Get all courses owned by this professor
    courses = await Course.find(Course.professor_id == user.id).to_list()
    course_map = {c.id: c.title for c in courses}
    course_ids = list(course_map.keys())

    if not course_ids:
        return []

    # 2. Get all enrolments for these courses
    enrolments = await Enrolment.find(In(Enrolment.course_id, course_ids)).to_list()
    
    # Map student_id -> list of course_ids they are enrolled in
    student_course_map = {}
    for e in enrolments:
        if e.student_id not in student_course_map:
            student_course_map[e.student_id] = []
        student_course_map[e.student_id].append(e.course_id)
        
    student_ids = list(student_course_map.keys())
    if not student_ids:
        return []

    # 3. Get User details for these students
    students = await User.find(In(User.id, student_ids)).to_list()
    student_details = {s.id: s for s in students}

    # 4. Get StudyProgress for these students across these courses
    study_plans = await StudyPlan.find(
        In(StudyPlan.course_id, course_ids),
        In(StudyPlan.student_id, student_ids),
        StudyPlan.status == "active"
    ).to_list()
    
    plan_map = {p.id: p for p in study_plans}
    plan_ids = list(plan_map.keys())
    
    progress_records = await StudyProgress.find(In(StudyProgress.study_plan_id, plan_ids)).to_list()
    
    # Map (student_id, course_id) -> progress_record
    progress_map = {}
    for pr in progress_records:
        plan = plan_map.get(pr.study_plan_id)
        if plan:
            progress_map[(pr.student_id, plan.course_id)] = {
                "progress": pr,
                "total_topics": plan.total_topics
            }

    # 5. Assemble final response
    results = []
    
    for student_id, enrolled_courses in student_course_map.items():
        stu = student_details.get(student_id)
        if not stu:
            continue
            
        hash_val = int(hashlib.md5(str(student_id).encode()).hexdigest(), 16)
        pic_id = (hash_val % 90) + 1
            
        for cid in enrolled_courses:
            course_title = course_map.get(cid, "Unknown Course")
            
            progress_percent = 0
            status = "Not Started"
            
            prog_data = progress_map.get((student_id, cid))
            if prog_data:
                pr = prog_data["progress"]
                total = prog_data["total_topics"]
                
                if total > 0:
                    progress_percent = int((len(pr.completed_topics) / total) * 100)
                else:
                    progress_percent = 100
                    
                if pr.last_accessed_at:
                    days_since_access = (datetime.now(timezone.utc) - pr.last_accessed_at).days
                    if days_since_access > 7:
                        status = "Inactive"
                    else:
                        status = "Learning"
                else:
                    status = "Not Started"

            results.append({
                "id": str(student_id) + "_" + str(cid),
                "name": stu.name,
                "bg": f"{pic_id}.jpg",
                "cls": course_title,
                "progress": progress_percent,
                "status": status,
                "flagIcon": status == "Inactive" or (status == "Learning" and progress_percent < 20)
            })

    return results
