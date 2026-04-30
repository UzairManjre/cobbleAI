# CobbleAI - Project Context

## Project Overview

**CobbleAI** is an AI-powered educational technology platform that enables professors to upload course materials and students to study through Socratic dialogue, auto-generated quizzes, and interactive concept maps. The platform uses AI (gemma4:e2b model via Ollama) to generate knowledge graphs from topics or documents and provides context-aware tutoring.

### Core Features
- **Knowledge Graph Generation** from topics or uploaded documents (PDF, DOCX, PPTX)
- **Interactive Study Mode** with visual graph navigation (React Flow) and node-specific chat
- **Socratic AI Tutor** that guides students rather than giving direct answers
- **Document Processing Pipeline** with text extraction, chunking, embedding, and RAG
- **Multi-Modal Learning**: Teach Mode (Socratic Q&A), Test Mode (auto-generated quizzes), Review Mode (concept maps)

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: MongoDB 6.0 (via Beanie ODM, async)
- **Vector DB**: Qdrant (document embeddings)
- **Cache/Queue**: Redis 7 (Celery broker)
- **Object Storage**: MinIO (dev) / S3 (prod)
- **LLM**: Ollama serving `gemma4:e2b` model (configured in `.env`)
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384-dim)
- **Reranker**: `cross-encoder/ms-marco-MiniLM-L-6-v2`
- **Task Queue**: Celery 5.x
- **Auth**: JWT (RS256 with RSA keys)

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **State Management**: Zustand
- **Graph Visualization**: React Flow (2D), react-force-graph-3d (3D)
- **Styling**: Tailwind CSS 4.x
- **API Client**: axios
- **Routing**: React Router 7.x
- **Icons**: lucide-react

### Infrastructure (Docker Compose)
| Service | Port | Purpose |
|---------|------|---------|
| MongoDB | 27017 | Primary database |
| Redis | 6379 | Cache + Celery broker |
| Qdrant | 6333 | Vector store |
| MinIO | 9002 (API), 9001 (Console) | File storage |

## Building and Running

### Prerequisites
- Docker Desktop (running)
- Python 3.11+
- Node.js 18+
- Ollama with model `gemma4:e2b`

### 1. Start Infrastructure (Docker)
```bash
docker-compose up -d
```

### 2. Start Ollama (LLM)
```bash
ollama pull gemma4:e2b
ollama run gemma4:e2b "Hello"  # verify
```

### 3. Start Backend
```bash
cd C:\CLG\cobbleAI\backend
venv\Scripts\activate
pip install -r requirements.txt  # First time only
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
API docs: http://127.0.0.1:8000/docs

### 4. Start Frontend
```bash
cd C:\CLG\cobbleAI\frontend
npm install  # First time only
npm run dev
```
App: http://localhost:5173

### 5. First-Time Setup Flow
1. Go to http://localhost:5173/signup
2. Create a **professor** account
3. Create a course from the dashboard
4. Click "Enter Study Mode" on the course
5. Enter a topic (e.g., "Machine Learning")
6. Wait for graph generation
7. Click nodes to navigate, ask questions in the chat panel

## Architecture

```
Frontend (React + React Flow + Zustand) [Port 5173]
    ↓ HTTP
Backend (FastAPI) [Port 8000]
    ↓
    ├── MongoDB (users, courses, graphs, sessions, chat) [27017]
    ├── Ollama/gemma4:e2b (graph generation + tutoring) [11434]
    ├── MinIO/S3 (document file storage) [9002]
    ├── Qdrant (vector embeddings for RAG) [6333]
    └── Redis + Celery (async document processing) [6379]
```

## Key Directories

### Backend (`backend/`)
```
backend/
├── app/
│   ├── main.py               # FastAPI app entry point
│   ├── worker.py             # Celery worker entry point
│   ├── api/                  # Route handlers (auth, courses, documents, graphs, sessions, chat)
│   ├── core/                 # Config, db, qdrant, storage, celery, prompts
│   ├── models/               # Beanie document models (user, course, document, graph)
│   ├── schemas/              # Pydantic request/response schemas
│   └── services/             # Business logic (llm, tutor, graph_generator, doc_extractor, chunking, reranker)
├── .env                      # Environment variables
├── requirements.txt          # Python dependencies
└── *.py                      # Utility scripts (check_docs, reprocess, test, etc.)
```

### Frontend (`frontend/`)
```
frontend/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root component + routing
│   ├── components/graph/           # KnowledgeGraph, NodeInfo, TutorChat
│   ├── pages/                      # Chat, StudyMode, Dashboard, Login, Signup, CourseDetail, MindMap
│   └── store/                      # authStore.ts, graphStore.ts (Zustand)
├── package.json
└── tailwind.config.js
```

## Known Issues & Technical Notes

1. **Streaming Mismatch**: The frontend `Chat.tsx` attempts to stream responses via `fetch` + `ReadableStream`, but the backend `/api/chat/` endpoint returns plain JSON `{ reply: "..." }` (no streaming). This causes silent failures or empty content.

2. **Duplicate Chat Implementations**: There are two separate chat implementations:
   - `pages/Chat.tsx` - Standalone chat page (uses hardcoded session ID `00000000-0000-0000-0000-000000000000`)
   - `components/graph/TutorChat.tsx` - Node-scoped chat within StudyMode
   These don't share code and use different API patterns.

3. **No Centralized API Client**: The `src/api/` directory is empty. Each component makes its own API calls with inconsistent base URLs (`http://127.0.0.1:8000` vs `http://localhost:8000`).

4. **Mode Parameter Unused**: The `mode` parameter (`teach`/`test`/`review`) is sent by the frontend but not used by the backend.

5. **JWT Keys**: RSA keys are embedded in `backend/.env` (for RS256). The `private.pem`/`public.pem` files exist but the `.env` values are used instead.

## Development Conventions

- **Backend**: Python with FastAPI, async patterns throughout, Beanie ODM for MongoDB, Pydantic for schema validation
- **Frontend**: TypeScript with React functional components, Zustand for state, Tailwind CSS for styling
- **API**: RESTful endpoints under `/api/` prefix, JWT bearer token authentication
- **Database**: MongoDB collections: `users`, `courses`, `documents`, `knowledge_graphs`, `chat_messages`, `study_sessions`

## Useful Commands

```bash
# View MongoDB data
docker exec -it cobble-mongo mongosh
use cobbleai
show collections

# View MinIO files
# Open http://localhost:9001, login: minioadmin / minioadmin

# View Qdrant vectors
# Open http://localhost:6333/dashboard

# Check backend logs
# Check the uvicorn terminal output

# Run tests (if available)
# pytest  (in backend/)
# npm run lint  (in frontend/)
```

## Environment Variables (backend/.env)

| Variable | Value | Description |
|----------|-------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017/cobbleai` | MongoDB connection |
| `DATABASE_NAME` | `cobbleai` | Database name |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `LLM_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `LLM_MODEL` | `gemma4:e2b` | LLM model name |
| `S3_ENDPOINT_URL` | `http://localhost:9002` | MinIO/S3 endpoint |
| `S3_BUCKET` | `cobble-documents` | File storage bucket |
