# CobbleAI - Complete Project Documentation

**Last Updated:** April 7, 2026  
**Version:** 2.0  
**Status:** Active Development

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Backend Deep Dive](#5-backend-deep-dive)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
7. [API Reference](#7-api-reference)
8. [Development Workflow](#8-development-workflow)
9. [Known Issues & Bugs](#9-known-issues--bugs)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Project Overview

**CobbleAI** is an AI-powered educational technology platform that enables:
- **Professors** to upload course materials (PDF, DOCX, PPTX)
- **Students** to study through Socratic dialogue, auto-generated quizzes, and interactive concept maps
- **AI-powered** knowledge graph generation from topics or documents

### Core Features

1. **Knowledge Graph Generation**
   - From topic: AI generates a concept map for any subject
   - From documents: Extracts triplets from uploaded course materials

2. **Interactive Study Mode**
   - Visual graph navigation using React Flow
   - Node-specific chat with context-aware AI tutor
   - Socratic teaching method (guides students, doesn't give direct answers)

3. **Document Processing Pipeline**
   - Upload → Text Extraction → Chunking → Embedding → Vector Storage
   - RAG (Retrieval-Augmented Generation) for contextual answers

4. **Multi-Modal Learning**
   - Teach Mode: Socratic Q&A
   - Test Mode: Auto-generated quizzes
   - Review Mode: Concept map exploration

---

## 2. Technology Stack

### Backend
| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | FastAPI | Latest | REST API |
| Database | MongoDB | 6.0 | Primary datastore |
| ODM | Beanie | Latest | MongoDB async driver |
| Vector DB | Qdrant | Latest | Document embeddings |
| Cache/Queue | Redis | 7 | Celery broker + cache |
| Object Storage | MinIO (dev) / S3 (prod) | - | File uploads |
| LLM Serving | Ollama (dev) / vLLM (prod) | - | Model inference |
| LLM Model | qwen3.5:2b | 2B params | Core AI model |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 | 384-dim | Text embeddings |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 | - | Semantic reranking |
| Task Queue | Celery | 5.x | Background tasks |
| Auth | JWT (HS256) | - | Authentication |
| Password Hashing | bcrypt | - | Security |
| Rate Limiting | slowapi | - | API protection |

### Frontend
| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | React | 18 | UI library |
| Build Tool | Vite | 5.x | Development server |
| Language | TypeScript | 5.x | Type safety |
| State Management | Zustand | 4.x | Global state |
| Graph Visualization | React Flow | 11.x | Interactive concept maps |
| 3D Visualization | react-force-graph-3d | 1.x | 3D mind maps |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| API Client | axios | 1.x | REST calls |
| Icons | lucide-react | Latest | Icon library |
| Routing | React Router | 6.x | Client-side routing |

### Infrastructure
| Service | Docker Image | Port | Purpose |
|---------|-------------|------|---------|
| MongoDB | mongo:6.0 | 27017 | Database |
| Redis | redis:7-alpine | 6379 | Cache + queue broker |
| Qdrant | qdrant/qdrant:latest | 6333 | Vector database |
| MinIO | minio/minio | 9002 (API), 9001 (Console) | File storage |

---

## 3. Architecture

### High-Level Architecture

```
┌─────────────┐      HTTP/WebSocket      ┌──────────────┐
│  Frontend   │ ───────────────────────► │   Backend    │
│  (React)    │ ◄─────────────────────── │   (FastAPI)  │
│  Port 5173  │      SSE Streaming       │  Port 8000   │
└─────────────┘                          └─────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
            ┌───────────────┐          ┌──────────────┐           ┌──────────────┐
            │   MongoDB     │          │    Qdrant    │           │    MinIO     │
            │   Port 27017  │          │  Port 6333   │           │  Port 9002   │
            │ (Users,       │          │ (Vector      │           │ (File        │
            │  Courses,     │          │  Embeddings) │           │  Storage)    │
            │  Graphs,      │          └──────────────┘           └──────────────┘
            │  Sessions)    │
            └───────────────┘
                    ▲
                    │
            ┌───────────────┐
            │    Redis      │
            │  Port 6379    │
            │ (Celery       │
            │  Broker)      │
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │    Ollama     │
            │  Port 11434   │
            │ (LLM Model:   │
            │  qwen3.5:2b)  │
            └───────────────┘
```

### Data Flow Diagrams

#### Document-to-Graph Pipeline
```
Upload (PDF/DOCX/PPTX)
    ↓
POST /api/documents/upload/{course_id}
    ↓
Save to MinIO/S3
    ↓
POST /api/documents/{doc_id}/process
    ↓
DocumentExtractor.extract_text()
    ↓
chunking.split_into_chunks() [400 tokens, 80 overlap]
    ↓
chunking.embed_and_store() → Qdrant
    ↓
TripletExtractor.extract_triplets() → Ollama
    ↓
GraphBuilder.build()
    ↓
Save KnowledgeGraph to MongoDB
```

#### Topic-to-Graph Pipeline
```
POST /api/graphs/generate { topic: "..." }
    ↓
GraphGenerator.generate_graph(topic)
    ↓
LLM generates JSON graph directly
    ↓
_enforce_cyclic() [ensure connectivity]
    ↓
_add_ids() [assign UUIDs]
    ↓
Save KnowledgeGraph to MongoDB
```

#### Chat/Tutor Flow
```
POST /api/chat/
  { session_id, node_id, message }
    ↓
Fetch StudySession → get graph_id
    ↓
Fetch KnowledgeGraph from MongoDB
    ↓
Find current node + neighbors
    ↓
Retrieve chat history (max 40 turns)
    ↓
TutorService.answer_question()
    ↓
LLM generates Socratic response
    ↓
Save ChatMessage (user + assistant)
    ↓
Return ChatResponse
```

---

## 4. Database Schema

### MongoDB Collections

#### users
Stores professor and student accounts.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Universally unique identifier |
| email | str | UNIQUE, INDEX | Login credential |
| hashed_password | str | NOT NULL | bcrypt hash (cost 12) |
| role | str (enum) | "professor" \| "student" | User role |
| name | str | NOT NULL | Display name |
| is_active | bool | DEFAULT true | Soft-delete flag |
| is_verified | bool | DEFAULT false | Email verification |
| created_at | datetime | NOT NULL | Account creation timestamp |
| last_login | datetime | NULLABLE | Last login timestamp |

**Indexes:** `users_email_unique`, `users_role_idx`, `users_created_at_idx`

#### courses
One document per course.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Course identifier |
| title | str | NOT NULL | Course display name |
| description | str | NULLABLE | Course description |
| created_by | UUID (str) | FK → users | Professor who owns course |
| created_at | datetime | NOT NULL | Creation timestamp |
| updated_at | datetime | NOT NULL | Last update timestamp |

**Indexes:** `courses_professor_idx`, `courses_created_idx`

#### documents
Tracks uploaded files and processing status.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Document identifier |
| course_id | UUID (str) | FK → courses | Parent course |
| filename | str | NOT NULL | Original filename |
| file_type | str (enum) | pdf \| pptx \| docx | File format |
| file_size | int | NOT NULL | Size in bytes |
| storage_path | str | NOT NULL | Local/S3 path |
| extracted_text | str | NULLABLE | Extracted text content |
| status | str (enum) | pending \| processing \| done \| failed | Processing status |
| processed_at | datetime | NULLABLE | Processing completion timestamp |
| created_at | datetime | NOT NULL | Upload timestamp |

**Indexes:** `docs_course_idx`, `docs_status_idx`

#### knowledge_graphs
Generated concept maps.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Graph identifier |
| topic | str | NOT NULL | Graph topic |
| course_id | UUID (str) | FK → courses | Parent course |
| nodes | array | NOT NULL | [{ id, label, description }] |
| edges | array | NOT NULL | [{ id, from, to, relation }] |
| created_by | UUID (str) | FK → users | Graph creator |
| created_at | datetime | NOT NULL | Generation timestamp |

**Indexes:** `graphs_course_idx`

#### chat_messages
Conversation history.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Message identifier |
| session_id | UUID (str) | FK → study_sessions | Parent session |
| node_id | str | NOT NULL | Current graph node |
| role | str (enum) | user \| assistant | Message sender |
| content | str | NOT NULL | Message text |
| created_at | datetime | NOT NULL | Message timestamp |

**Indexes:** `messages_session_idx`

#### study_sessions
Active study sessions.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Session identifier |
| graph_id | UUID (str) | FK → knowledge_graphs | Associated graph |
| student_id | UUID (str) | FK → users | Session owner |
| current_node_id | str | NULLABLE | Currently viewing node |
| visited_nodes | str[] | DEFAULT [] | Navigation history |
| created_at | datetime | NOT NULL | Session start |
| updated_at | datetime | NOT NULL | Last activity |

**Indexes:** `sessions_graph_idx`, `sessions_student_idx`

### Qdrant Collections

**Collection Name:** `course_{course_id}` (one per course)

| Payload Field | Type | Description |
|---------------|------|-------------|
| chunk_id | str (UUID) | Chunk identifier |
| doc_id | str (UUID) | Source document |
| course_id | str (UUID) | Parent course |
| text | str | Chunk text content |
| page_number | int | Source page/slide |
| char_start | int | Character offset start |
| char_end | int | Character offset end |
| has_image | bool | Image-heavy flag |
| image_s3_key | str \| null | Image S3 path |
| original_filename | str | Source filename |
| chunk_index | int | Position in document |
| token_count | int | Approximate tokens |
| overlap_prev | str \| null | Previous chunk overlap |
| created_at | str (ISO 8601) | Ingestion timestamp |

**Vector:** 384 dimensions (all-MiniLM-L6-v2)  
**Distance Metric:** Cosine  
**Index:** HNSW (default)

### Redis Keys

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `celery` | Queue | N/A | Celery task queue (DB 0) |
| `celery-task-meta-*` | Hash | 86400s | Task results (DB 1) |
| `concept_map:{course_id}` | String (JSON) | 3600s | Cached concept graph |
| `doc_status:{doc_id}` | String (JSON) | 86400s | Document processing status |

---

## 5. Backend Deep Dive

### Directory Structure
```
backend/
├── .env                      # Environment variables
├── gen_keys.py               # RSA key generator
├── private.pem               # RSA private key (unused, prepared for RS256)
├── public.pem                # RSA public key (unused, prepared for RS256)
├── requirements.txt          # Python dependencies
└── app/
    ├── main.py               # FastAPI app entry point
    ├── worker.py             # Celery worker entry point
    ├── api/                  # Route handlers
    │   ├── auth.py           # /api/auth/* endpoints
    │   ├── courses.py        # /api/courses/* endpoints
    │   ├── documents.py      # /api/documents/* endpoints
    │   ├── graphs.py         # /api/graphs/* endpoints
    │   ├── sessions.py       # /api/sessions/* endpoints
    │   └── chat.py           # /api/chat/* endpoints
    ├── core/                 # Configuration & utilities
    │   ├── config.py         # Settings (Pydantic BaseSettings)
    │   ├── db.py             # MongoDB/Beanie initialization
    │   ├── qdrant.py         # Qdrant client wrapper
    │   ├── storage.py        # Local file storage
    │   ├── celery_app.py     # Celery configuration
    │   ├── limiter.py        # Rate limiting (slowapi)
    │   └── prompts.py        # Prompt templates
    ├── models/               # Beanie document models
    │   ├── __init__.py
    │   ├── user.py           # User model
    │   ├── course.py         # Course model
    │   ├── document.py       # Document model
    │   └── graph.py          # KnowledgeGraph, ChatMessage, StudySession
    ├── repositories/         # Repository pattern
    │   └── base.py           # Generic CRUD base class
    ├── schemas/              # Pydantic request/response schemas
    │   ├── user.py
    │   ├── course.py
    │   ├── chat.py
    │   ├── document.py
    │   └── quiz.py
    └── services/             # Business logic
        ├── llm.py            # LLM adapter (Ollama via OpenAI SDK)
        ├── tutor.py          # Socratic tutor service
        ├── graph_generator.py # LLM-based graph generation
        ├── graph_builder.py   # Triplet-based graph builder
        ├── triplet_extractor.py # Triplet extraction from text
        ├── doc_extractor.py   # Document processing pipeline
        ├── pdf_extractor.py   # PDF/DOCX/PPTX text extraction
        ├── chunking.py        # Text chunking + embedding
        └── reranker.py        # Cross-encoder reranker
```

### Key Files

#### main.py
```python
# FastAPI application factory
app = FastAPI(title="Cobble AI API")

# CORS middleware
app.add_middleware(CORSMiddleware, allow_origins=settings.ALLOWED_ORIGINS, ...)

# Router registration
app.include_router(auth.router, prefix="/api")
app.include_router(courses.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(graphs.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(chat.router, prefix="/api")

# Lifespan (startup/shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()  # Initialize MongoDB
    # init_qdrant()  # Optional Qdrant initialization
    yield
```

#### services/llm.py
```python
class LLMService:
    def __init__(self):
        self.client = OpenAI(base_url=settings.LLM_BASE_URL, api_key="not-needed")
        self.model = settings.LLM_MODEL
    
    async def generate(prompt, system_prompt, max_tokens, temperature):
        # Single-turn generation
        
    async def generate_from_messages(messages, max_tokens, temperature):
        # Multi-turn chat completion
```

**Note:** Uses OpenAI SDK to communicate with Ollama (which exposes OpenAI-compatible API at `http://localhost:11434/v1`)

#### services/tutor.py
```python
class TutorService:
    def answer_question(node, neighbors, question, chat_history):
        # Constructs system prompt with:
        # - Node label + description
        # - Connected concepts (neighbors)
        # - Socratic rules (never give direct answer, guide student)
        # Calls LLM with chat_history + question
        # Returns AI response
```

#### services/graph_generator.py
```python
class GraphGenerator:
    def generate_graph(topic):
        # Sends GRAPH_GENERATION_PROMPT to LLM
        # Expects JSON response: { nodes: [...], edges: [...] }
        # _enforce_cyclic() - ensures every node has ≥2 incoming edges
        # _add_ids() - assigns UUID prefixed with "uuid_"
        # Returns validated graph
```

#### services/chunking.py
```python
def split_into_chunks(text, chunk_size=400, overlap=80, min_chunk=100):
    # Sentence-level splitting using NLTK
    # Sliding window with overlap
    # Merges small chunks (< 100 tokens)
    
def embed_and_store(chunks, course_id, doc_id):
    # Uses sentence-transformers/all-MiniLM-L6-v2
    # Batch size: 32
    # Stores in Qdrant collection: course_{course_id}
```

#### api/chat.py
**CRITICAL ENDPOINT - Chat endpoint**
```python
@router.post("/chat/")
async def chat_endpoint(request: ChatRequest, current_user: User = Depends(get_current_user)):
    # 1. Lookup study_session by session_id
    # 2. Fetch knowledge_graph by session.graph_id
    # 3. Find current_node and neighbors in graph
    # 4. Get chat_history from MongoDB (session_id + node_id)
    # 5. Call TutorService.answer_question(node, neighbors, message, history)
    # 6. Save user message to ChatMessage collection
    # 7. Save assistant reply to ChatMessage collection
    # 8. Return ChatResponse(reply=answer)
```

**Current Issue:** This endpoint returns a **single response** (no streaming). The frontend expects streaming but backend doesn't support it.

### Configuration (core/config.py)

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection |
| `DB_NAME` | `cobble_ai` | Database name |
| `JWT_SECRET` | `your-secret-key` | JWT signing secret |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | Ollama endpoint |
| `LLM_MODEL` | `llama3` | Model name (change to qwen3.5:2b) |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `ALLOWED_ORIGINS` | `["*"]` | CORS origins |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Celery broker |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/1` | Celery results |

---

## 6. Frontend Deep Dive

### Directory Structure
```
frontend/
├── public/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root component + routing
│   ├── App.css                     # Legacy styles (unused)
│   ├── index.css                   # Tailwind imports
│   ├── api/                        # ⚠️ EMPTY - no API client abstraction
│   ├── assets/                     # Images (unused)
│   ├── components/
│   │   └── graph/
│   │       ├── KnowledgeGraph.tsx  # React Flow 2D graph
│   │       ├── NodeInfo.tsx        # Node details panel
│   │       └── TutorChat.tsx       # Node-scoped chat
│   ├── pages/
│   │   ├── Chat.tsx                # Main chat interface (STANDALONE)
│   │   ├── StudyMode.tsx           # Study mode (graph + chat)
│   │   ├── Dashboard.tsx           # Course listing
│   │   ├── Login.tsx               # Login page
│   │   ├── Signup.tsx              # Registration page
│   │   ├── CourseDetail.tsx        # Course detail + uploads
│   │   └── MindMap.tsx             # 3D force graph (mock data)
│   └── store/
│       ├── authStore.ts            # Auth state (Zustand)
│       └── graphStore.ts           # Graph session state (Zustand)
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

### Key Components

#### pages/Chat.tsx - Main Chat Interface (STANDALONE PAGE)
**Purpose:** The primary tutoring UI for students (not connected to graphs).

**State:**
```typescript
messages: { role: 'user' | 'assistant', content: string }[]
input: string
mode: 'teach' | 'test' | 'review'
isTyping: boolean
```

**Streaming Implementation:**
```typescript
const handleSend = async () => {
  // 1. Add user message to state
  setMessages(prev => [...prev, { role: 'user', content: input }])
  
  // 2. Call backend
  const response = await fetch(
    `http://127.0.0.1:8000/chat/?session_id=00000000-0000-0000-0000-000000000000&message=${input}&mode=${mode}`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }}
  )
  
  // 3. Stream response body
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let assistantMessage = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    assistantMessage += chunk
    // Update state incrementally for typewriter effect
    setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: assistantMessage }])
  }
}
```

**⚠️ ISSUE:** Backend `/api/chat/` endpoint does **NOT** stream responses. It returns a plain JSON object `{ reply: "..." }`. The frontend tries to read it as a stream, which fails silently or returns empty content.

**Session ID:** Hardcoded to `00000000-0000-0000-0000-000000000000` (placeholder).

**Mode Parameter:** Sent but **not used** by backend (backend doesn't differentiate teach/test/review modes).

#### pages/StudyMode.tsx - Study Mode (GRAPH-BASED CHAT)
**Purpose:** Combines knowledge graph visualization with context-aware chat.

**Flow:**
1. User enters topic or selects "from documents"
2. Calls `useGraphStore.generateGraph(topic, courseId)` or `generateFromDocs(courseId)`
3. Displays 3-panel layout:
   - Left: KnowledgeGraph (React Flow)
   - Right top: NodeInfo (current node details + neighbors)
   - Right bottom: TutorChat (node-scoped chat)

**State:**
```typescript
topic: string
showGenerator: boolean
mode: 'topic' | 'docs'
```

**Navigation:**
```typescript
handleNodeClick(nodeId) => navigateToNode(nodeId)  // from graphStore
```

#### components/graph/TutorChat.tsx - Node-Scoped Chat
**Purpose:** Chat component within StudyMode, scoped to current node.

**Uses:** `graphStore.askQuestion(nodeId, input)`

**Display:** Shows `chatHistory` from graphStore with user/assistant messages.

**Issue:** This component is **unused in the main Chat.tsx page**. They are separate implementations.

#### store/authStore.ts - Authentication State
```typescript
interface AuthState {
  token: string | null
  role: 'professor' | 'student' | null
  setAuth: (token, role) => void
  logout: () => void
  initialize: () => Promise<void>  // Validates token on app load
}
```

**Persistence:** localStorage  
**Validation:** GET `/users/me` with bearer token

#### store/graphStore.ts - Graph Session State
```typescript
interface GraphState {
  graphId: string | null
  sessionId: string | null
  nodes: GraphNode[]
  edges: GraphEdge[]
  currentNodeId: string | null
  visitedNodes: string[]
  chatHistory: ChatMessage[]
  isLoading: boolean
  error: string | null
}
```

**Actions:**
| Action | Endpoint | Method |
|--------|----------|--------|
| `generateGraph(topic, courseId?)` | `/graph/generate` | POST |
| `generateFromDocs(courseId)` | `/graph/generate-from-docs` | POST |
| `loadSession(sessionId)` | `/sessions/{sessionId}` | GET |
| `navigateToNode(nodeId)` | `/sessions/{sessionId}/navigate` | POST |
| `askQuestion(nodeId, question)` | `/sessions/{sessionId}/ask` | POST |

**Note:** This uses **different endpoints** than Chat.tsx. There are two separate chat implementations that don't share code.

### API Communication Issues

**⚠️ No Centralized API Client**
- `src/api/` directory exists but is **empty**
- Each component makes its own API calls with different patterns:
  - `axios` for standard requests (Dashboard, Login, Signup, graphStore)
  - `fetch` for streaming (Chat.tsx)
- **Inconsistent base URLs:**
  - `http://127.0.0.1:8000` (Chat.tsx, Dashboard, Login, Signup)
  - `http://localhost:8000` (authStore)
  - Should be unified

### Routing (App.tsx)
```typescript
<Routes>
  <Route path="/" element={<Login />} />
  <Route path="/signup" element={<Signup />} />
  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
  <Route path="/course/:courseId" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
  <Route path="/course/:courseId/map" element={<ProtectedRoute><MindMap /></ProtectedRoute>} />
  <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
  <Route path="/course/:courseId/study" element={<ProtectedRoute><StudyMode /></ProtectedRoute>} />
</Routes>
```

**ProtectedRoute:** Checks token + role. Redirects if unauthorized.

---

## 7. API Reference

### Authentication

#### POST /api/auth/register
Create new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name",
  "role": "professor"
}
```

**Response (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### POST /api/auth/login
Login with email/password.

**Request Body (form-urlencoded):**
```
username=user@example.com&password=securepassword
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### GET /users/me
Get current user info.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": "uuid...",
  "email": "user@example.com",
  "name": "User Name",
  "role": "professor"
}
```

### Courses

#### POST /api/courses/
Create a new course (professor only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Introduction to Algorithms",
  "description": "CS 201"
}
```

**Response (201):** Course object

#### GET /api/courses/
List all courses for current user.

**Response (200):** Array of Course objects

#### GET /api/courses/{course_id}
Get course details.

**Response (200):** Course object

#### PUT /api/courses/{course_id}
Update course.

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description"
}
```

**Response (200):** Updated Course object

#### DELETE /api/courses/{course_id}
Delete course.

**Response (204):** No content

### Documents

#### POST /api/documents/upload/{course_id}
Upload document(s) to course.

**Headers:** 
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Request Body (FormData):**
```
files: [File, File, ...]
```

**Response (201):**
```json
{
  "id": "doc-uuid",
  "filename": "lecture1.pdf",
  "status": "pending"
}
```

#### GET /api/documents/{doc_id}
Get document metadata.

**Response (200):** Document object

#### GET /api/documents/course/{course_id}
List all documents for course.

**Response (200):** Array of Document objects

#### POST /api/documents/{doc_id}/process
Trigger document processing (text extraction + embedding).

**Response (202):** `{ message: "Processing started" }`

### Graphs

#### POST /api/graphs/generate
Generate knowledge graph from topic.

**Request Body:**
```json
{
  "topic": "Machine Learning",
  "course_id": "course-uuid"  // optional
}
```

**Response (201):** KnowledgeGraph object
```json
{
  "id": "graph-uuid",
  "topic": "Machine Learning",
  "nodes": [
    { "id": "n1", "label": "Neural Networks", "description": "..." },
    ...
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "relation": "uses" },
    ...
  ]
}
```

#### POST /api/graphs/build
Build graph from document triplets.

**Request Body:**
```json
{
  "course_id": "course-uuid"
}
```

**Response (201):** KnowledgeGraph object

#### GET /api/graphs/{graph_id}
Get graph by ID.

**Response (200):** KnowledgeGraph object

### Sessions

#### POST /api/sessions/
Create new study session.

**Request Body:**
```json
{
  "graph_id": "graph-uuid"
}
```

**Response (201):** StudySession object

#### GET /api/sessions/{session_id}
Get session details.

**Response (200):** StudySession object

#### POST /api/sessions/{session_id}/navigate
Navigate to a node in the graph.

**Request Body:**
```json
{
  "node_id": "n1"
}
```

**Response (200):** Updated StudySession object

### Chat

#### POST /api/chat/
Send message and get AI response.

**Request Body:**
```json
{
  "session_id": "session-uuid",
  "node_id": "n1",
  "message": "What is a neural network?"
}
```

**Response (200):**
```json
{
  "reply": "Let's explore this concept together...",
  "session_id": "session-uuid",
  "node_id": "n1"
}
```

**⚠️ ISSUE:** This endpoint does **NOT** support streaming. Returns plain JSON.

### Health

#### GET /health
Check API status.

**Response (200):**
```json
{
  "status": "ok"
}
```

---

## 8. Development Workflow

### Prerequisites
- Docker Desktop (running)
- Python 3.11+
- Node.js 18+
- Ollama with `qwen3.5:2b` model

### Initial Setup

#### 1. Start Infrastructure (Docker)
```bash
cd C:\CLG\cobbleAI
docker-compose up -d
```

Verify services:
- MongoDB: `http://localhost:27017`
- Redis: `http://localhost:6379`
- Qdrant: `http://localhost:6333`
- MinIO Console: `http://localhost:9001` (login: `minioadmin` / `minioadmin`)

#### 2. Start Ollama
```bash
# Pull model (first time)
ollama pull qwen3.5:2b

# Verify it works
ollama run qwen3.5:2b "Hello"

# API available at:
# http://localhost:11434/v1
```

#### 3. Start Backend
```bash
cd C:\CLG\cobbleAI\backend

# Activate virtual environment
venv\Scripts\activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Start server
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API docs: `http://127.0.0.1:8000/docs`

#### 4. Start Frontend
```bash
cd C:\CLG\cobbleAI\frontend

# Install dependencies (first time only)
npm install

# Start dev server
npm run dev
```

App: `http://localhost:5173`

### First-Time Setup Flow
1. Navigate to `http://localhost:5173/signup`
2. Create a **professor** account
3. Create a course from the dashboard
4. Click "Enter Study Mode" on the course
5. Enter a topic (e.g., "Machine Learning")
6. Wait for graph generation (Qwen 3.5 2B processes it)
7. Click nodes to navigate, ask questions in the chat panel

### Database Management

#### MongoDB Shell
```bash
docker exec -it cobble-mongo mongosh
use cobble_ai
show collections
db.users.find()
db.knowledge_graphs.find()
db.study_sessions.find()
db.chat_messages.find()
db.documents.find()
db.courses.find()
```

#### MongoDB Compass (GUI)
1. Install MongoDB Compass
2. Connect to `mongodb://localhost:27017`
3. Select `cobble_ai` database
4. Browse collections visually

#### Clear All Data (Development)
```bash
docker exec -it cobble-mongo mongosh --eval "db.dropDatabase()" cobble_ai
```

### Common Development Commands

#### Backend
```bash
# Run tests (when implemented)
pytest

# Format code
black app/

# Type checking
mypy app/

# Start Celery worker
celery -A app.worker worker --loglevel=info

# Start Celery beat (scheduled tasks)
celery -A app.worker beat --loglevel=info
```

#### Frontend
```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint

# Type checking
npx tsc --noEmit
```

### Code Style Guidelines

#### Backend (Python)
- Follow PEP 8
- Use type hints everywhere
- Docstrings for all public functions/classes
- Max line length: 120 characters
- Use `async/await` for all I/O operations

#### Frontend (TypeScript/React)
- Functional components with hooks
- TypeScript strict mode
- Arrow functions for component definitions
- Destructure props
- Use `const` by default, `let` only when reassigning
- Naming: PascalCase for components, camelCase for functions/variables

---

## 9. Known Issues & Bugs

### 🔴 CRITICAL ISSUES

#### 1. Chat Responses Not Displaying (Empty Bubbles)
**Symptom:** AI responses appear as empty dark bubbles with no text content.

**Root Cause:** Frontend `Chat.tsx` expects streaming responses via `response.body.getReader()`, but backend `/api/chat/` returns plain JSON `{ reply: "..." }`.

**Code Location:**
- Frontend: `frontend/src/pages/Chat.tsx` (handleSend function)
- Backend: `backend/app/api/chat.py` (chat_endpoint)

**Fix Options:**

**Option A: Add Streaming to Backend (Recommended)**
```python
# backend/app/api/chat.py
from fastapi.responses import StreamingResponse

@router.post("/chat/")
async def chat_endpoint(request: ChatRequest, current_user: User = Depends(get_current_user)):
    # ... existing logic to generate answer ...
    
    async def generate_stream():
        # Stream token by token (or chunk by chunk)
        for chunk in answer.split(' '):
            yield chunk + ' '
            await asyncio.sleep(0.01)  # Small delay for streaming effect
    
    return StreamingResponse(generate_stream(), media_type="text/event-stream")
```

**Option B: Change Frontend to Handle JSON**
```typescript
// frontend/src/pages/Chat.tsx
const handleSend = async () => {
  // ... existing code ...
  
  const response = await fetch(url, { method: 'POST', headers })
  
  if (response.headers.get('content-type')?.includes('application/json')) {
    // Handle non-streamed JSON response
    const data = await response.json()
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
  } else {
    // Handle streaming (if implemented)
    const reader = response.body.getReader()
    // ... existing streaming code ...
  }
}
```

#### 2. Session ID Hardcoded
**Symptom:** All chat sessions use `00000000-0000-0000-0000-000000000000`.

**Impact:** Chat history is not persisted properly, cannot distinguish between different study sessions.

**Location:** `frontend/src/pages/Chat.tsx` line ~40

**Fix:** Create proper sessions via `/api/sessions/` endpoint and store `session_id` in state.

#### 3. Mode Parameter Not Used
**Symptom:** Frontend sends `mode=teach/test/review` but backend ignores it.

**Impact:** All chat responses use the same prompt regardless of selected mode.

**Location:** 
- Frontend: `Chat.tsx` sends mode parameter
- Backend: `chat.py` doesn't use it

**Fix:** Update `TutorService.answer_question()` to accept `mode` parameter and use different prompt templates:
- Teach: Socratic method
- Test: Generate quiz questions
- Review: Summarize concepts

### 🟡 MEDIUM ISSUES

#### 4. No Centralized API Client
**Symptom:** Each component makes its own API calls with inconsistent patterns.

**Impact:** Code duplication, inconsistent error handling, multiple base URLs.

**Fix:** Create `src/api/client.ts`:
```typescript
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor to add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired, logout
      localStorage.removeItem('token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

export default apiClient
```

#### 5. Inconsistent Base URLs
**Symptom:** `authStore` uses `localhost:8000`, other files use `127.0.0.1:8000`.

**Fix:** Use environment variable `VITE_API_URL` and centralized API client.

#### 6. Model Name Mismatch
**Symptom:** `.env` and config default to `llama3`, but SETUP.md says `qwen3.5:2b`.

**Fix:** Update `.env`:
```
LLM_MODEL=qwen3.5:2b
```

#### 7. No Error Handling in Chat Streaming
**Symptom:** If streaming fails, error message is vague: "Sorry, I encountered an error connecting to the brain."

**Fix:** 
- Log actual error to console
- Display specific error message to user
- Handle non-200 responses properly

#### 8. Graph Store Chat vs Main Chat Duplication
**Symptom:** Two separate chat implementations:
- `Chat.tsx` - standalone chat page
- `TutorChat.tsx` + `graphStore.askQuestion()` - graph-scoped chat

**Impact:** Code duplication, inconsistent UX, different endpoints.

**Fix:** Unify into single chat component that can work with or without graph context.

### 🟢 MINOR ISSUES

#### 9. Unused Files
- `frontend/src/App.css` - legacy styles
- `frontend/src/assets/*` - unused images
- `backend/gen_keys.py`, `private.pem`, `public.pem` - prepared for RS256 but using HS256

#### 10. Hardcoded Values
- Session ID in Chat.tsx
- Mock data in MindMap.tsx
- Course stats in CourseDetail.tsx

#### 11. No Loading States
- Chat.tsx doesn't show loading when fetching initial data
- Dashboard doesn't show skeleton loaders

#### 12. No Pagination
- Course listing shows all courses
- Chat history loads all messages
- Document list loads all documents

---

## 10. Troubleshooting

### Common Errors

#### "Connection refused" on MongoDB
```bash
docker-compose up -d
docker ps  # verify mongo container is running
```

#### Graph generation fails
```bash
# Verify Ollama is running
ollama list

# Test model
ollama run qwen3.5:2b "Hello"

# Check backend logs for errors
# Look for LLM_BASE_URL in .env (should be http://localhost:11434/v1)
```

#### Upload fails
```bash
# Verify MinIO is running
docker ps | grep minio

# Check MinIO console
# Open http://localhost:9001
# Login: minioadmin / minioadmin
```

#### CORS errors
```python
# backend/app/main.py
# Verify ALLOWED_ORIGINS includes frontend URL
settings.ALLOWED_ORIGINS = ["http://localhost:5173"]
```

#### Frontend won't start
```bash
cd frontend
rm -rf node_modules
npm install
npm run dev
```

#### Backend won't start
```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

#### Docker containers keep restarting
```bash
# View logs
docker logs cobble-mongo
docker logs cobble-redis
docker logs cobble-qdrant
docker logs cobble-minio

# Restart all
docker-compose down
docker-compose up -d
```

### Debug Mode

#### Backend Debugging
```python
# Add logging to endpoints
import logging
logging.basicConfig(level=logging.DEBUG)

# In endpoint
@router.post("/chat/")
async def chat_endpoint(...):
    print(f"Request: {request}")  # Debug print
    logger.info(f"User message: {request.message}")
```

#### Frontend Debugging
```typescript
// Add console logs
console.log('Sending message:', input)
console.log('Response:', response)
console.log('Streaming chunk:', chunk)

// Use React DevTools to inspect state
```

#### MongoDB Queries
```javascript
// Find all chat messages
db.chat_messages.find().sort({ created_at: -1 }).limit(10)

// Find sessions for a user
db.study_sessions.find({ student_id: "user-uuid" })

// Find graph by topic
db.knowledge_graphs.find({ topic: /machine/i })
```

### Performance Optimization

#### Backend
- Enable MongoDB indexes (check `models/*.py` for `@index` decorators)
- Use connection pooling for MongoDB
- Cache concept graphs in Redis
- Implement pagination for large datasets

#### Frontend
- Use React.memo for pure components
- Implement virtual scrolling for long chat histories
- Lazy load route components
- Use React Query for data fetching and caching

---

## Appendix A: File Inventory

### Backend Files (35 files)
| # | File | Purpose |
|---|------|---------|
| 1 | `app/main.py` | FastAPI app entry, CORS, routers, lifespan |
| 2 | `app/worker.py` | Celery worker entry point |
| 3 | `app/core/config.py` | Settings/env via Pydantic |
| 4 | `app/core/db.py` | MongoDB/Beanie init |
| 5 | `app/core/qdrant.py` | Qdrant client wrapper |
| 6 | `app/core/storage.py` | Local file storage |
| 7 | `app/core/celery_app.py` | Celery config + beat |
| 8 | `app/core/limiter.py` | Rate limiting |
| 9 | `app/core/prompts.py` | Prompt templates |
| 10 | `app/models/__init__.py` | Model re-exports |
| 11 | `app/models/user.py` | User document |
| 12 | `app/models/course.py` | Course document |
| 13 | `app/models/document.py` | Document document |
| 14 | `app/models/graph.py` | Graph, ChatMessage, Session |
| 15 | `app/repositories/base.py` | Generic CRUD base |
| 16-20 | `app/schemas/*.py` | Pydantic schemas |
| 21-26 | `app/api/*.py` | Route handlers |
| 27-35 | `app/services/*.py` | Business logic |

### Frontend Files (19 files)
| # | File | Purpose |
|---|------|---------|
| 1 | `src/main.tsx` | App entry point |
| 2 | `src/App.tsx` | Root component + routing |
| 3 | `src/pages/Chat.tsx` | Main chat interface |
| 4 | `src/pages/StudyMode.tsx` | Study mode with graph |
| 5 | `src/pages/Dashboard.tsx` | Course listing |
| 6 | `src/pages/Login.tsx` | Login page |
| 7 | `src/pages/Signup.tsx` | Registration page |
| 8 | `src/pages/CourseDetail.tsx` | Course detail |
| 9 | `src/pages/MindMap.tsx` | 3D force graph |
| 10 | `src/components/graph/KnowledgeGraph.tsx` | React Flow 2D graph |
| 11 | `src/components/graph/NodeInfo.tsx` | Node details panel |
| 12 | `src/components/graph/TutorChat.tsx` | Node-scoped chat |
| 13-14 | `src/store/*.ts` | Zustand stores |
| 15-19 | `src/assets/*.png/svg` | Unused assets |

---

## Appendix B: Environment Variables

### Backend (.env)
```bash
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=cobble_ai

# Authentication
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256

# LLM
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen3.5:2b

# Embeddings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Vector Database
QDRANT_URL=http://localhost:6333

# CORS
ALLOWED_ORIGINS=["http://localhost:5173"]

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

### Frontend (.env.local - create if needed)
```bash
VITE_API_URL=http://127.0.0.1:8000
```

---

## Appendix C: Ports Reference

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| Frontend (Vite) | 5173 | HTTP | Development server |
| Backend (FastAPI) | 8000 | HTTP | REST API |
| MongoDB | 27017 | TCP | Database |
| Redis | 6379 | TCP | Cache + queue |
| Qdrant | 6333 | HTTP | Vector database |
| MinIO API | 9002 | HTTP | File storage API |
| MinIO Console | 9001 | HTTP | File storage UI |
| Ollama | 11434 | HTTP | LLM inference |

---

## Appendix D: Quick Command Reference

```bash
# Start everything
docker-compose up -d
ollama pull qwen3.5:2b
cd backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
cd frontend && npm run dev

# Stop everything
docker-compose down
# Ctrl+C backend
# Ctrl+C frontend

# View logs
docker logs cobble-mongo -f
docker logs cobble-redis -f

# Clear database
docker exec -it cobble-mongo mongosh --eval "db.dropDatabase()" cobble_ai

# Check Ollama
ollama list
ollama run qwen3.5:2b "Test"

# API health check
curl http://127.0.0.1:8000/health

# Frontend build
cd frontend && npm run build
```

---

## Contact & Resources

**Project Repository:** `C:\CLG\cobbleAI`  
**Documentation:** This file + SETUP.md  
**API Docs:** `http://127.0.0.1:8000/docs` (when running)

**Key Documentation Files:**
- `SETUP.md` - Setup and run guide
- `plan_text.txt` - Technical architecture plan v2.0
- `schema_extracted.txt` - Complete database schema reference
- `techStack.txt` - Technology stack list
- `cobble_ai_plan_v2 (1).docx` - Visual architecture diagrams
- `cobble_ai_schema.docx` - Visual schema diagrams

---

**END OF DOCUMENTATION**
