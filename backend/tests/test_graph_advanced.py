import requests
import uuid
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_graph_generation():
    # 1. Login
    print("🔐 Logging in...")
    login_res = requests.post(f"{BASE_URL}/auth/jwt/login", data={
        "username": "student_success@test.com",
        "password": "Password123!"
    })
    if login_res.status_code != 200:
        print(f"❌ Login failed: {login_res.text}")
        return
    
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("✅ Logged in successfully")

    # 2. Get Courses
    print("\n📚 Fetching courses...")
    courses_res = requests.get(f"{BASE_URL}/courses/", headers=headers)
    courses = courses_res.json()
    if not courses:
        print("❌ No courses found for user")
        return
    
    course = courses[0]
    course_id = course["id"]
    print(f"✅ Using course: {course['title']} ({course_id})")

    # 3. Check for Documents
    print("\n📄 Checking for documents...")
    docs_res = requests.get(f"{BASE_URL}/documents/?course_id={course_id}", headers=headers)
    docs = docs_res.json()
    ready_docs = [d for d in docs if d["status"] == "ready"]
    print(f"✅ Found {len(ready_docs)} ready documents")
    
    if not ready_docs:
        print("❌ No ready documents to generate graph from. Please upload and wait for processing.")
        return

    # 4. Trigger Graph Generation
    print("\n🚀 Triggering advanced graph generation (this may take 30-60s)...")
    start_time = time.time()
    graph_res = requests.post(
        f"{BASE_URL}/graph/generate-from-docs",
        json={"course_id": course_id},
        headers=headers,
        timeout=180
    )
    duration = time.time() - start_time
    
    if graph_res.status_code != 200:
        print(f"❌ Graph generation failed ({duration:.1f}s): {graph_res.text}")
        return

    graph_data = graph_res.json()
    print(f"✅ Graph generated successfully in {duration:.1f}s!")
    print(f"📊 Nodes: {len(graph_data['nodes'])}")
    print(f"🔗 Edges: {len(graph_data['edges'])}")
    
    # Print a few nodes as sample
    print("\n📍 Sample Nodes:")
    for node in graph_data["nodes"][:3]:
        print(f" - {node['label']}: {node.get('description', 'No description')[:100]}...")

if __name__ == "__main__":
    test_graph_generation()
