import pytest
import uuid
from httpx import AsyncClient
from app.models.course import Course, Enrolment
from app.models.document import DocumentModel

@pytest.mark.asyncio
async def test_student_material_access(
    async_client: AsyncClient,
    student_user,
    student_token,
    professor_user
):
    course_id = uuid.uuid4()
    course = Course(
        id=course_id,
        title="Test Course",
        code="TC101",
        professor_id=professor_user.id
    )
    await course.insert()

    # Enrol student
    enrolment = Enrolment(
        id=uuid.uuid4(),
        student_id=student_user.id,
        course_id=course_id
    )
    await enrolment.insert()

    # Create one ready doc, one pending doc
    ready_doc = DocumentModel(
        id=uuid.uuid4(),
        course_id=course_id,
        filename="ready.pdf",
        s3_path="test/ready.pdf",
        status="ready"
    )
    await ready_doc.insert()

    pending_doc = DocumentModel(
        id=uuid.uuid4(),
        course_id=course_id,
        filename="pending.pdf",
        s3_path="test/pending.pdf",
        status="pending"
    )
    await pending_doc.insert()

    headers = {"Authorization": f"Bearer {student_token}"}
    response = await async_client.get(
        f"/api/student/documents/list/{course_id}",
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    
    assert len(data) == 1
    assert data[0]["filename"] == "ready.pdf"
    assert data[0]["status"] == "ready"
