import asyncio
import os
import json
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from qdrant_client import AsyncQdrantClient

MONGO_URI = "mongodb://localhost:27017/cobbleai"
REDIS_URL_DB2 = "redis://localhost:6379/2"
REDIS_URL_DB3 = "redis://localhost:6379/3"
QDRANT_URL = "http://localhost:6333"

async def fetch_data():
    print("Connecting to databases...")
    
    # MongoDB
    mongo_client = AsyncIOMotorClient(MONGO_URI)
    db = mongo_client["cobbleai"]
    
    # Fetch Data
    print("Fetching Users...")
    users_cursor = db.users.find()
    users_data = await users_cursor.to_list(length=None)
    df_users = pd.DataFrame(users_data) if users_data else pd.DataFrame(columns=["_id", "role", "created_at"])
    
    print("Fetching Courses...")
    courses_cursor = db.courses.find()
    courses_data = await courses_cursor.to_list(length=None)
    df_courses = pd.DataFrame(courses_data) if courses_data else pd.DataFrame(columns=["_id", "is_archived", "created_at"])
    
    print("Fetching Documents...")
    docs_cursor = db.documents.find()
    docs_data = await docs_cursor.to_list(length=None)
    df_docs = pd.DataFrame(docs_data) if docs_data else pd.DataFrame(columns=["_id", "file_type", "file_size_bytes", "chunk_count", "processing_status"])

    print("Fetching Chat Sessions...")
    chats_cursor = db.chat_sessions.find()
    chats_data = await chats_cursor.to_list(length=None)
    df_chats = pd.DataFrame(chats_data) if chats_data else pd.DataFrame(columns=["_id", "mode", "token_count", "turn_count", "created_at"])

    print("Fetching Quiz Attempts...")
    quizzes_cursor = db.quiz_attempts.find()
    quizzes_data = await quizzes_cursor.to_list(length=None)
    df_quizzes = pd.DataFrame(quizzes_data) if quizzes_data else pd.DataFrame(columns=["_id", "score", "time_taken_sec", "started_at"])

    # Redis Stats
    print("Fetching Redis Stats...")
    try:
        r2 = redis.from_url(REDIS_URL_DB2)
        r3 = redis.from_url(REDIS_URL_DB3)
        cache_keys_db2 = len(await r2.keys('*'))
        cache_keys_db3 = len(await r3.keys('*'))
        await r2.close()
        await r3.close()
    except Exception as e:
        print(f"Redis connection failed: {e}")
        cache_keys_db2, cache_keys_db3 = 0, 0

    # Qdrant Stats
    print("Fetching Qdrant Stats...")
    qdrant_collections = []
    total_vectors = 0
    try:
        qdrant_client = AsyncQdrantClient(url=QDRANT_URL)
        collections_resp = await qdrant_client.get_collections()
        for coll in collections_resp.collections:
            info = await qdrant_client.get_collection(coll.name)
            qdrant_collections.append({
                "name": coll.name,
                "vectors": info.vectors_count
            })
            total_vectors += (info.vectors_count or 0)
    except Exception as e:
        print(f"Qdrant connection failed: {e}")
    
    df_qdrant = pd.DataFrame(qdrant_collections) if qdrant_collections else pd.DataFrame(columns=["name", "vectors"])

    for df in [df_users, df_courses, df_docs, df_chats, df_quizzes]:
        if "_id" in df.columns:
            df.drop(columns=["_id"], inplace=True)

    return {
        "users": df_users,
        "courses": df_courses,
        "docs": df_docs,
        "chats": df_chats,
        "quizzes": df_quizzes,
        "redis_db2": cache_keys_db2,
        "redis_db3": cache_keys_db3,
        "qdrant": df_qdrant,
        "total_vectors": total_vectors
    }

def generate_dashboard(data):
    print("Generating Dashboard HTML...")
    
    figures = []
    
    # 1. Users Breakdown
    df_users = data["users"]
    if not df_users.empty and "role" in df_users.columns:
        role_counts = df_users["role"].value_counts().reset_index()
        role_counts.columns = ["Role", "Count"]
        fig1 = px.pie(role_counts, values="Count", names="Role", title="User Role Distribution", hole=0.4, color_discrete_sequence=px.colors.sequential.Teal)
        figures.append(fig1.to_html(full_html=False, include_plotlyjs='cdn'))
    else:
        figures.append("<div><h3>User Role Distribution</h3><p>No user data available.</p></div>")

    # 2. Documents Processing & Types
    df_docs = data["docs"]
    if not df_docs.empty and "file_type" in df_docs.columns:
        doc_counts = df_docs["file_type"].value_counts().reset_index()
        doc_counts.columns = ["File Type", "Count"]
        fig2 = px.bar(doc_counts, x="File Type", y="Count", title="Uploaded Document Types", color="File Type", color_discrete_sequence=px.colors.qualitative.Pastel)
        figures.append(fig2.to_html(full_html=False, include_plotlyjs=False))
        
        # Scatter for file size vs chunks
        if "file_size_bytes" in df_docs.columns and "chunk_count" in df_docs.columns:
            # Drop nulls
            df_docs_clean = df_docs.dropna(subset=["file_size_bytes", "chunk_count"])
            if not df_docs_clean.empty:
                fig3 = px.scatter(df_docs_clean, x="file_size_bytes", y="chunk_count", color="file_type", title="File Size vs Vector Chunks", size="chunk_count")
                figures.append(fig3.to_html(full_html=False, include_plotlyjs=False))
    else:
        figures.append("<div><h3>Document Metrics</h3><p>No document data available.</p></div>")

    # 3. Chat Session Engagement
    df_chats = data["chats"]
    if not df_chats.empty and "mode" in df_chats.columns:
        chat_counts = df_chats["mode"].value_counts().reset_index()
        chat_counts.columns = ["Study Mode", "Session Count"]
        fig4 = px.bar(chat_counts, x="Study Mode", y="Session Count", title="Chat Sessions by Mode", color="Study Mode", color_discrete_sequence=px.colors.qualitative.Set2)
        figures.append(fig4.to_html(full_html=False, include_plotlyjs=False))
    else:
        figures.append("<div><h3>Chat Sessions</h3><p>No chat data available.</p></div>")
        
    # 4. Quiz Performance
    df_quizzes = data["quizzes"]
    if not df_quizzes.empty and "score" in df_quizzes.columns:
        df_quizzes_clean = df_quizzes.dropna(subset=["score"])
        if not df_quizzes_clean.empty:
            fig5 = px.histogram(df_quizzes_clean, x="score", nbins=20, title="Distribution of Quiz Scores", color_discrete_sequence=['#836AF9'])
            figures.append(fig5.to_html(full_html=False, include_plotlyjs=False))
    else:
        figures.append("<div><h3>Quiz Performance</h3><p>No quiz score data available.</p></div>")

    # 5. Qdrant Collections
    df_qdrant = data["qdrant"]
    if not df_qdrant.empty:
        fig6 = px.bar(df_qdrant, x="name", y="vectors", title="Qdrant Vectors by Collection", text="vectors", color_discrete_sequence=['#28C76F'])
        figures.append(fig6.to_html(full_html=False, include_plotlyjs=False))
    else:
        figures.append("<div><h3>Qdrant Vectors</h3><p>No Qdrant vector data available.</p></div>")

    # Infrastructure Stats
    infra_html = f"""
    <div style='display:flex; justify-content:space-around; background:#f4f4f4; padding:20px; border-radius:10px; margin-bottom:20px;'>
        <div style='text-align:center;'>
            <h2>{len(df_users)}</h2>
            <p>Total Users</p>
        </div>
        <div style='text-align:center;'>
            <h2>{len(data["courses"])}</h2>
            <p>Total Courses</p>
        </div>
        <div style='text-align:center;'>
            <h2>{data["redis_db2"] + data["redis_db3"]}</h2>
            <p>Redis Keys Cached</p>
        </div>
        <div style='text-align:center;'>
            <h2>{data["total_vectors"]}</h2>
            <p>Total Qdrant Vectors</p>
        </div>
    </div>
    """

    # Assemble full HTML
    html_template = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CobbleAI Analytics Dashboard</title>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #FAFAFA; color: #333; }}
            .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            h1 {{ color: #2C3E50; }}
            .chart-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 20px; }}
            .chart-card {{ background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 20px; overflow: hidden; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>CobbleAI Analytics Dashboard</h1>
                <p>Live Data Insights from MongoDB, Redis & Qdrant</p>
            </div>
            {infra_html}
            <div class="chart-grid">
                {''.join([f'<div class="chart-card">{fig}</div>' for fig in figures])}
            </div>
        </div>
    </body>
    </html>
    """
    
    with open("dashboard.html", "w", encoding="utf-8") as f:
        f.write(html_template)
    
    print("Dashboard saved to backend/dashboard.html")

async def main():
    data = await fetch_data()
    generate_dashboard(data)

if __name__ == "__main__":
    asyncio.run(main())
