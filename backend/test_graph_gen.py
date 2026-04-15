"""Test the advanced interconnected graph generation using urllib"""
import sys
import os
import urllib.request
import urllib.error
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Login first
print("🔐 Logging in...")
email = input("Email: ")
password = input("Password: ")

login_data = json.dumps({"username": email, "password": password}).encode('utf-8')
req = urllib.request.Request(
    "http://127.0.0.1:8000/auth/jwt/login",
    data=login_data,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req) as response:
        token = json.loads(response.read())["access_token"]
        print("✅ Logged in\n")
except urllib.error.HTTPError as e:
    print(f"❌ Login failed: {e.read().decode()}")
    sys.exit(1)

# Generate graph from documents
course_id = "81004487-94b2-4f3f-9de8-5a79a42365ef"

print("🚀 Generating interconnected knowledge graph...")
print(f"   Course ID: {course_id}\n")
print("⏳ This may take 30-60 seconds (LLM processing)...")

graph_data = json.dumps({"course_id": course_id}).encode('utf-8')
req = urllib.request.Request(
    f"http://127.0.0.1:8000/graph/generate-from-docs",
    data=graph_data,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=120) as response:
        data = json.loads(response.read())
        
        print("\n✅ SUCCESS!")
        print(f"   Graph ID: {data['graph_id']}")
        print(f"   Session ID: {data['session_id']}")
        print(f"   Nodes: {data['nodes_count']}")
        print(f"   Edges: {data['edges_count']}")
        print(f"   Source: {data['source']}")
        
        # Show some sample nodes
        print(f"\n📊 Sample nodes (first 5):")
        for i, node in enumerate(data['nodes'][:5], 1):
            category = node.get('category', 'concept')
            difficulty = node.get('difficulty', 'N/A')
            print(f"   {i}. {node['label']} [{category}] - {difficulty}")
            print(f"      {node.get('description', '')[:80]}...")
        
        # Show some sample edges
        print(f"\n🔗 Sample relationships (first 5):")
        for i, edge in enumerate(data['edges'][:5], 1):
            from_node = next((n['label'] for n in data['nodes'] if n['id'] == edge['from']), edge['from'][:15])
            to_node = next((n['label'] for n in data['nodes'] if n['id'] == edge['to']), edge['to'][:15])
            strength = edge.get('strength', 0.8)
            print(f"   {i}. {from_node} --[{edge['relation']}]--> {to_node} (strength: {strength})")
        
        print(f"\n💡 You can now use this graph in study mode!")
        print(f"   Session ID: {data['session_id']}")

except urllib.error.HTTPError as e:
    error_body = e.read().decode()
    print(f"\n❌ Failed (HTTP {e.code}):")
    print(f"   {error_body}")
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
