# CobbleAI - Setup & Run Guide

## Prerequisites
- **Docker Desktop** (running)
- **Python 3.11+**
- **Node.js 18+**
- **Ollama** with `qwen3.5:2b` model

## 1. Start Infrastructure (Docker)
```bash
docker-compose up -d
```
This starts:
| Service | Port | Purpose |
|---------|------|---------|
| MongoDB | 27017 | Primary database (users, courses, graphs, sessions) |
| Redis | 6379 | Cache + Celery broker |
| Qdrant | 6333 | Vector store for document embeddings |
| MinIO | 9000 / 9001 | S3-compatible object storage (file uploads) |

## 2. View the Database

### MongoDB (Mongo Shell)
```bash
docker exec -it cobble-mongo mongosh
use cobbleai
show collections
db.users.find()          # View users
db.knowledge_graphs.find()  # View generated graphs
db.study_sessions.find()    # View active sessions
db.chat_messages.find()     # View chat history
db.documents.find()         # View uploaded documents
db.courses.find()           # View courses
```

### MongoDB (Compass GUI)
1. Install [MongoDB Compass](https://www.mongodb.com/products/tools/compass)
2. Connect to `mongodb://localhost:27017`
3. Select `cobbleai` database
4. Browse collections visually

### MinIO (File Storage UI)
1. Open http://localhost:9001
2. Login: `minioadmin` / `minioadmin`
3. Browse `cobble-documents` bucket to see uploaded files

### Qdrant (Vector Store UI)
1. Open http://localhost:6333/dashboard
2. View vector collections for document chunks

## 3. Start Ollama (LLM)
```bash
# Make sure Ollama is running, then pull the model
ollama pull qwen3.5:2b

# Verify it works
ollama run qwen3.5:2b "Hello"
```
The API is available at `http://localhost:11434/v1` (OpenAI-compatible).

## 4. Start Backend
```bash
cd C:\CLG\cobbleAI\backend
venv\Scripts\activate
pip install -r requirements.txt  # First time only
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
API docs: http://127.0.0.1:8000/docs

## 5. Start Frontend
```bash
cd C:\CLG\cobbleAI\frontend
npm install  # First time only
npm run dev
```
App: http://localhost:5173

## 6. First-Time Setup Flow
1. Go to http://localhost:5173/signup
2. Create a **professor** account
3. Create a course from the dashboard
4. Click "Enter Study Mode" on the course
5. Enter a topic (e.g., "Machine Learning")
6. Wait for graph generation (Qwen 3.5 2B processes it)
7. Click nodes to navigate, ask questions in the chat panel

## Architecture Overview
```
Frontend (React + React Flow + Zustand)
    ↓ HTTP
Backend (FastAPI)
    ↓
    ├── MongoDB (users, courses, graphs, sessions, chat)
    ├── Ollama/Qwen3.5:2b (graph generation + tutoring)
    ├── MinIO/S3 (document file storage)
    ├── Qdrant (vector embeddings for RAG)
    └── Redis + Celery (async document processing)
```

## Troubleshooting
- **"Connection refused" on MongoDB**: Run `docker-compose up -d`
- **Graph generation fails**: Check `ollama run qwen3.5:2b` works
- **Upload fails**: Check MinIO is running at http://localhost:9000
- **CORS errors**: Backend CORS allows `localhost:5173` by default
