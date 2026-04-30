# CobbleAI - Detailed Project Report

**Date:** April 28, 2026  
**Version:** 2.0  
**Status:** Active Development (Not Launch-Ready)  
**Project Location:** `C:\CLG\cobbleAI`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture](#4-system-architecture)
5. [Key Features & Modules](#5-key-features--modules)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Backend Architecture](#9-backend-architecture)
10. [AI/ML Pipeline](#10-aiml-pipeline)
11. [Current Status & Issues](#11-current-status--issues)
12. [Security Analysis](#12-security-analysis)
13. [Performance Considerations](#13-performance-considerations)
14. [Deployment Architecture](#14-deployment-architecture)
15. [Recommendations & Roadmap](#15-recommendations--roadmap)

---

## 1. Executive Summary

CobbleAI is an AI-native educational platform that transforms static course materials (PDF, DOCX, PPTX) into interactive, graph-based learning experiences. The platform enables professors to upload syllabi and course materials, while students navigate auto-generated knowledge graphs and engage in Socratic dialogue with an AI tutor grounded in their actual course content.

**Key Value Propositions:**
- Automated knowledge graph generation from course materials
- Socratic AI tutoring with RAG (Retrieval-Augmented Generation)
- Interactive concept map visualization using React Flow
- Automated quiz/test generation with LLM-based grading
- Adaptive study plan generation
- Comprehensive behavioral analytics for professors

**Current State:** Functional prototype with well-designed core features but has structural bugs preventing production launch.

---

## 2. Project Overview

### 2.1 Purpose & Vision

CobbleAI addresses the challenge of navigating complex academic topics by:
- Converting linear course materials into interconnected knowledge graphs
- Providing contextual AI tutoring that references actual course content
- Enabling professors to track student engagement through behavioral analytics
- Automating assessment creation and grading

### 2.2 Target Users

| User Type | Capabilities |
|-----------|---------------|
| **Professors** | Upload documents, create courses, generate graphs/tests/study plans, view analytics |
| **Students** | Navigate knowledge graphs, chat with AI tutor, take tests, follow study plans |

### 2.3 Core Workflow

```
Professor Uploads Documents
         ↓
Document Processing Pipeline (Extract → Chunk → Embed → Store)
         ↓
Knowledge Graph Generation (LLM-powered triplet extraction)
         ↓
Students Navigate Graph + Chat with Context-Aware AI Tutor
         ↓
Analytics Collection (events, node metrics, user profiles)
```

---

## 3. Technology Stack

### 3.1 Backend Technologies

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | FastAPI | 0.100+ | REST API with OpenAPI docs |
| **ODM** | Beanie | Latest | Async MongoDB ODM (Pydantic v2 compatible) |
| **Database** | MongoDB | 6.0 | Primary datastore |
| **Vector DB** | Qdrant | Latest | Document embeddings storage |
| **Cache/Queue** | Redis | 7.x | Celery broker + cache |
| **Object Storage** | MinIO (dev) / S3 (prod) | - | File uploads |
| **LLM Serving** | Ollama | Latest | Hosts `gemma4:e2b` model |
| **Embeddings** | sentence-transformers/all-MiniLM-L6-v2 | - | 384-dim text embeddings |
| **Reranker** | cross-encoder/ms-marco-MiniLM-L-6-v2 | - | Semantic reranking |
| **Task Queue** | Celery | 5.x | Background document processing |
| **Auth** | FastAPI-Users | Latest | JWT authentication (RS256) |
| **Rate Limiting** | slowapi | Latest | API protection |

### 3.2 Frontend Technologies

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | React | 19 | UI library |
| **Build Tool** | Vite | Latest | Development server |
| **Language** | TypeScript | 5.x | Type safety |
| **State Management** | Zustand | 4.x | Lightweight global state |
| **Graph Visualization** | React Flow | 11.x | Interactive concept maps |
| **3D Visualization** | react-force-graph-3d | 1.x | 3D mind maps |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **API Client** | axios | 1.x | REST calls |
| **Routing** | React Router | 7.x | Client-side routing |
| **Icons** | lucide-react | Latest | Icon library |

### 3.3 Infrastructure (Docker)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **MongoDB** | mongo:6.0 | 27017 | Document database |
| **Redis** | redis:7-alpine | 6379 | Cache + queue broker |
| **Qdrant** | qdrant/qdrant:latest | 6333 | Vector database |
| **MinIO** | minio/minio | 9002 (API), 9001 (Console) | S3-compatible storage |

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Client Layer                                  │
│   React 19 + TypeScript + Vite [Port 5173]                    │
│   State: Zustand │ Graph: React Flow │ Styling: Tailwind CSS 4  │
└────────────────────────────┬───────────────────────────────────┘
                             │ HTTP / JWT Bearer
┌────────────────────────────▼───────────────────────────────────┐
│                     API Gateway (FastAPI)                       │
│   Port 8000 │ Middleware: CORS, Analytics, Rate Limiting       │
│   Auth: FastAPI-Users + JWT RS256 │ Docs: /docs               │
└───┬──────────┬──────────┬──────────┬──────────┬────────────┘
    │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
│MongoDB │ │Qdrant  │ │MinIO   │ │Redis   │ │Ollama       │
│  6.0   │ │        │ │  (S3)  │ │  7.x   │ │ gemma4:e2b  │
│:27017  │ │:6333   │ │:9002   │ │:6379   │ │ :11434      │
└────────┘ └────────┘ └────────┘ └───┬────┘ └──────────────┘
                                     │
                               ┌─────▼──────┐
                               │Celery Worker│
                               │  + Beat     │
                               └────────────┘
```

### 4.2 Data Flow Diagrams

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
DocumentExtractor.extract_text() [pdfplumber, python-docx, python-pptx]
    ↓
chunking.split_into_chunks() [400 tokens, 80 overlap, NLTK sentence tokenization]
    ↓
chunking.embed_and_store() → Qdrant [all-MiniLM-L6-v2, 384-dim]
    ↓
TripletExtractor.extract_triplets() → Ollama [LLM triplet extraction]
    ↓
GraphBuilder.build()
    ↓
Save KnowledgeGraph to MongoDB
```

#### Chat/Tutor Flow (RAG Pipeline)
```
POST /api/chat/ { session_id, node_id, message }
    ↓
Fetch StudySession → get graph_id
    ↓
Fetch KnowledgeGraph from MongoDB
    ↓
Find current node + neighbors
    ↓
Retrieve chat history (max 40 turns from MongoDB)
    ↓
RAG Retrieval: embed query → Qdrant ANN search (k=10) → Cross-encoder rerank → Top 5
    ↓
TutorService.answer_question()
    ↓
LLM generates Socratic response (gemma4:e2b, max 2048 tokens)
    ↓
Save ChatMessage (user + assistant) to MongoDB
    ↓
Return ChatResponse with sources
```

---

## 5. Key Features & Modules

### 5.1 Knowledge Graph Generation

**Two Generation Methods:**

1. **From Topic:** LLM generates a concept map for any subject
   - Endpoint: `POST /api/graphs/generate`
   - LLM directly outputs JSON: `{ nodes: [...], edges: [...] }`
   - Post-processing: `_enforce_cyclic()` ensures connectivity, `_add_ids()` assigns UUIDs

2. **From Documents:** Extracts triplets from uploaded course materials
   - Endpoint: `POST /api/graphs/generate-from-docs`
   - Two-pass LLM pipeline:
     - Pass 1: Extract 15-25 core concepts with relationships
     - Pass 2: Cross-document enrichment, merge duplicates, assign difficulty

**Graph Structure:**
```json
{
  "nodes": [
    { "id": "node_a1b2c3d4e5f6", "label": "Neural Networks", "description": "...", "category": "algorithm", "difficulty": "intermediate" }
  ],
  "edges": [
    { "id": "edge_f6e5d4c3b2a1", "from": "node_...", "to": "node_...", "relation": "prerequisite_for", "strength": 0.9 }
  ]
}
```

### 5.2 Interactive Study Mode

**Components:**
- **KnowledgeGraph.tsx:** React Flow 2D graph visualization with dagre layout
- **NodeInfo.tsx:** Displays current node details + connected concepts
- **TutorChat.tsx:** Node-scoped chat with context-aware AI tutor

**Features:**
- Visual graph navigation (click nodes to explore)
- Node-specific chat context (AI knows which concept you're viewing)
- Socratic teaching method (guides students, doesn't give direct answers)
- Connected concepts sidebar for exploration

### 5.3 Document Processing Pipeline

**Supported Formats:** PDF, DOCX, PPTX

**Processing Stages:**
1. **Upload:** `POST /api/documents/upload` → Save to MinIO
2. **Text Extraction:** `pdfplumber` (PDF), `python-docx` (DOCX), `python-pptx` (PPTX)
3. **Chunking:** Sentence-level splitting (NLTK), 400-word chunks, 80-word overlap
4. **Embedding:** `all-MiniLM-L6-v2` → 384-dim vectors
5. **Storage:** Qdrant collection `course_{uuid}` with metadata
6. **Triplet Extraction:** LLM extracts (subject, predicate, object) triplets
7. **Graph Building:** Construct knowledge graph from triplets

**Status Tracking:** `pending` → `processing` → `ready` | `failed`

### 5.4 Socratic AI Tutor

**Implementation:** `app/services/tutor.py` → `TutorService`

**System Prompt enforces:**
1. Answer based PRIMARILY on provided course materials
2. Be concise but thorough (2-4 sentences for initial answers)
3. If topic not in materials, say: "This isn't covered in your course materials..."
4. Reference specific documents: "According to [Document Name]..."
5. Use Socratic method - guide, don't give direct answers

**RAG Integration:**
- Retrieves top 5 relevant chunks using two-stage retrieve-then-rerank
- Formats sources as `[Document 1]: <chunk text> --- [Document 2]: ...`
- Tracks source references in `ChatMessage.sources[]`

### 5.5 Automated Assessment Generation

**Implementation:** `app/services/test_generator.py` → `TestGenerator`, `TestEvaluator`

**Question Types:**

| Type | Options | Marks Range |
|------|----------|-------------|
| **MCQ** | 4 options, exactly 1 correct | Easy: 1-2, Medium: 3-5 |
| **True/False** | N/A | Easy: 1-2 |
| **Short Answer** | Free-text, LLM-graded | Medium: 3-5, Hard: 6-10 |
| **Code/Practical** | Starter code + expected output | Hard: 6-10 |

**Difficulty Distribution:** 30% easy, 50% medium, 20% hard

**LLM-Based Grading:**
- Short answers evaluated by LLM with rubric
- Correctness threshold: ≥50% of marks
- Returns: `{ marks, is_correct, feedback }`

### 5.6 Adaptive Study Plan Generator

**Implementation:** `app/services/study_plan_generator.py` → `StudyPlanGenerator`

**Two-Level Architecture:**

1. **Course-Wide Ordering:** LLM receives full knowledge graph → outputs topologically-sorted list with prerequisites
2. **Per-Topic Deep Dive:** For individual topics → structured learning path with step types:
   - `concept_overview`, `guided_reading`, `practical_example`, `hands_on_practice`, `connections`, `review`
   - Includes ≥3 exercises, ≥3 self-check questions, estimated time per step

### 5.7 Behavioral Analytics

**Collections:**

| Collection | Purpose | Schedule |
|------------|---------|----------|
| `analytics_events` | Raw event warehouse (90-day TTL) | Real-time append-only |
| `analytics_aggregates` | Pre-computed daily rollups | Daily (Celery Beat) |
| `analytics_user_profiles` | Lifetime learning profiles | Every 25 hours |
| `analytics_node_metrics` | Per-concept difficulty scoring | Every 6 hours |
| `analytics_llm_usage` | LLM call latency, token counts | Real-time |
| `analytics_rag_performance` | Retrieval latency, relevance scores | Real-time |

**Confusion Score Formula:**
```
μ_confusion(n) = 0.4 · R_revisit + 0.3 · T_norm + 0.3 · Q_norm

Where:
- R_revisit = min((total_visits - unique_students) / total_visits, 1.0)
- T_norm = min(avg_dwell_time_sec / 300, 1.0)
- Q_norm = min((total_questions / unique_students) / 5, 1.0)
```

**Interpretation:**
- μ < 0.3: Low confusion (students progressing normally)
- 0.3 ≤ μ < 0.6: Moderate confusion (may need supplementary material)
- μ ≥ 0.6: High confusion (professor should intervene)

**Dropout Risk Detection:**
- High: `days_inactive > 14`
- Medium: `days_inactive > 7` OR (`total_sessions < 3` AND `days_inactive > 3`)
- Low: All other cases

---

## 6. Database Schema

### 6.1 MongoDB Collections

#### users
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| _id | UUID (str) | PK | Universally unique identifier |
| email | str | UNIQUE, INDEX | Login credential |
| hashed_password | str | NOT NULL | bcrypt hash (cost 12) |
| role | str (enum) | "professor" \| "student" | User role |
| name | str | NOT NULL | Display name |
| institution | str | NULLABLE | User's institution |
| preferences | dict | DEFAULT {} | User preferences |
| is_active | bool | DEFAULT true | Soft-delete flag |
| is_verified | bool | DEFAULT false | Email verification |
| created_at | datetime | NOT NULL | Account creation timestamp |
| last_login | datetime | NULLABLE | Last login timestamp |

**Indexes:** `users_email_unique`, `users_role_idx`, `users_created_at_idx`

#### courses
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| _id | UUID (str) | PK | Course identifier |
| title | str | NOT NULL | Course display name |
| code | str | NULLABLE | Course code (e.g., "CS 201") |
| professor_id | UUID (str) | FK → users | Professor who owns course |
| docs_count | int | DEFAULT 0 | Cached document count |
| created_at | datetime | NOT NULL | Creation timestamp |
| updated_at | datetime | NOT NULL | Last update timestamp |

#### documents
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| _id | UUID (str) | PK | Document identifier |
| course_id | UUID (str) | FK → courses | Parent course |
| filename | str | NOT NULL | Original filename |
| file_type | str (enum) | pdf \| pptx \| docx | File format |
| file_size_bytes | int | NOT NULL | Size in bytes |
| s3_path | str | NOT NULL | Object storage path |
| status | str (enum) | pending \| processing \| ready \| failed | Processing status |
| chunk_count | int | NULLABLE | Number of chunks created |
| error_message | str | NULLABLE | Error details if failed |
| processed_at | datetime | NULLABLE | Processing completion timestamp |
| created_at | datetime | NOT NULL | Upload timestamp |

#### knowledge_graphs
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| _id | UUID (str) | PK | Graph identifier |
| topic | str | NOT NULL | Graph topic |
| course_id | UUID (str) | FK → courses | Parent course |
| nodes | array | NOT NULL | [{ id, label, description, category, difficulty }] |
| edges | array | NOT NULL | [{ id, from, to, relation, strength }] |
| created_by | UUID (str) | FK → users | Graph creator |
| created_at | datetime | NOT NULL | Generation timestamp |

#### study_sessions
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| _id | UUID (str) | PK | Session identifier |
| graph_id | UUID (str) | FK → knowledge_graphs | Associated graph |
| student_id | UUID (str) | FK → users | Session owner |
| current_node_id | str | NULLABLE | Currently viewing node |
| visited_nodes | str[] | DEFAULT [] | Navigation history |
| created_at | datetime | NOT NULL | Session start |
| updated_at | datetime | NOT NULL | Last activity |

#### chat_messages
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| _id | UUID (str) | PK | Message identifier |
| session_id | UUID (str) | FK → study_sessions | Parent session |
| node_id | str | NOT NULL | Current graph node |
| role | str (enum) | user \| assistant | Message sender |
| content | str | NOT NULL | Message text |
| sources | array | DEFAULT [] | Document references [{ doc_id, relevance_score, filename }] |
| created_at | datetime | NOT NULL | Message timestamp |

#### enrolments
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| course_id | UUID (str) | FK → courses | Parent course |
| student_id | UUID (str) | FK → users | Enrolled student |
| enrolled_at | datetime | NOT NULL | Enrollment timestamp |

#### course_invites
| Field | Type | Constraints | Description |
|-------|------|-------------|---------------|
| course_id | UUID (str) | FK → courses | Parent course |
| code | str | UNIQUE | Join code |
| expires_at | datetime | NOT NULL | Code expiration |

### 6.2 Qdrant Collections

**Collection Naming:** `course_{uuid}` (one per course)

**Vector Configuration:**
- Dimensions: 384 (all-MiniLM-L6-v2)
- Distance Metric: Cosine
- Index: HNSW (default)

**Point Structure:**
```python
PointStruct(
    id=str(uuid.uuid4()),
    vector=embedding.tolist(),  # 384-dim float array
    payload={
        "chunk_id": str,
        "doc_id": str,
        "course_id": str,
        "text": str,           # Full chunk text
        "filename": str,        # Source filename
        "page_number": int,     # Source page/slide
        "char_start": int,      # Character offset start
        "char_end": int,        # Character offset end
        "chunk_index": int,     # Position in document
        "token_count": int,     # Approximate tokens
    }
)
```

### 6.3 Redis Keys

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `celery` | List | N/A | Celery task queue (DB 0) |
| `celery-task-meta-*` | Hash | 86400s | Task results (DB 1) |
| `concept_map:{course_id}` | String (JSON) | 3600s | Cached concept graph |
| `doc_status:{doc_id}` | String (JSON) | 86400s | Document processing status |

---

## 7. API Reference

### 7.1 Authentication Endpoints

#### POST /auth/register — Register New User
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name",
  "role": "professor",
  "institution": "University Name"
}
```

**Response (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### POST /auth/jwt/login — Login
**Request Body (form-urlencoded):** `username=user@example.com&password=securepassword`

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### GET /users/me — Get Current User Info
**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": "uuid...",
  "email": "user@example.com",
  "name": "User Name",
  "role": "professor",
  "institution": "University Name"
}
```

### 7.2 Course Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| POST | /api/courses/ | Create course (professor only) | Yes |
| GET | /api/courses/ | List user's courses | Yes |
| GET | /api/courses/{course_id} | Get course details | Yes |
| PUT | /api/courses/{course_id} | Update course | Yes (owner) |
| DELETE | /api/courses/{course_id} | Delete course | Yes (owner) |
| POST | /api/courses/{course_id}/invite | Generate join code | Yes (owner) |
| POST | /api/courses/join | Join course via code | Yes (student) |

### 7.3 Document Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| POST | /api/documents/upload/{course_id} | Upload document(s) | Yes |
| GET | /api/documents/course/{course_id} | List course documents | Yes |
| GET | /api/documents/{doc_id} | Get document metadata | Yes |
| POST | /api/documents/{doc_id}/process | Trigger processing | Yes |
| POST | /api/documents/process-all-pending | Process all pending | Yes |
| DELETE | /api/documents/{doc_id} | Delete document | Yes (owner) |

### 7.4 Graph Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| POST | /api/graphs/generate | Generate graph from topic | Yes |
| POST | /api/graphs/generate-from-docs | Generate from documents | Yes |
| GET | /api/graphs/{graph_id} | Get graph by ID | Yes |
| DELETE | /api/graphs/{graph_id} | Delete graph | Yes |

### 7.5 Session & Chat Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| POST | /api/sessions/ | Create study session | Yes |
| GET | /api/sessions/{session_id} | Get session details | Yes |
| POST | /api/sessions/{session_id}/navigate | Navigate to node | Yes |
| POST | /api/chat/ | Send message, get AI response | Yes |
| POST | /api/sessions/{session_id}/ask | Ask question (graph-scoped) | Yes |

### 7.6 Test Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| POST | /api/tests/generate | Generate test | Yes (professor) |
| GET | /api/tests/{test_id} | Get test details | Yes |
| POST | /api/tests/{test_id}/submit | Submit test answers | Yes (student) |
| GET | /api/tests/mock/generate | Generate mock test | Yes |
| GET | /api/tests/analytics/{test_id} | Get test analytics | Yes (professor) |

### 7.7 Study Plan Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| POST | /api/study-plans/generate | Generate study plan | Yes |
| GET | /api/study-plans/active | Get active plan | Yes |
| POST | /api/study-plans/regenerate | Regenerate plan | Yes |
| DELETE | /api/study-plans/active | Delete active plan | Yes |
| POST | /api/study-plans/complete-topic | Mark topic complete | Yes (student) |

### 7.8 Analytics Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|-----------|-------------|---------------|
| GET | /api/analytics/events | Query raw events | Yes (professor) |
| GET | /api/analytics/aggregates | Get daily rollups | Yes (professor) |
| GET | /api/analytics/user-profiles | Get user profiles | Yes (professor) |
| GET | /api/analytics/node-metrics | Get node metrics | Yes (professor) |

---

## 8. Frontend Architecture

### 8.1 Directory Structure

```
frontend/
├── public/
├── src/
│   ├── main.tsx                         # App entry point
│   ├── App.tsx                          # Root component + routing
│   ├── index.css                         # Tailwind imports
│   │
│   ├── api/                             # Centralized API clients
│   │   ├── index.ts                      # API exports
│   │   ├── client.ts                     # Axios instance + interceptors
│   │   ├── auth.ts                       # Auth API calls
│   │   ├── courses.ts                    # Course API calls
│   │   ├── documents.ts                  # Document API calls
│   │   ├── graphs.ts                     # Graph API calls
│   │   ├── sessions.ts                   # Session API calls
│   │   ├── studyPlans.ts                 # Study plan API calls
│   │   └── tests.ts                      # Test API calls
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthLayout.tsx            # Auth page layout
│   │   ├── graph/
│   │   │   ├── KnowledgeGraph.tsx        # React Flow 2D graph
│   │   │   ├── NodeInfo.tsx              # Node details panel
│   │   │   └── TutorChat.tsx            # Node-scoped chat
│   │   └── layout/
│   │       ├── ProfessorLayout.tsx        # Professor dashboard layout
│   │       ├── Sidebar.tsx               # Navigation sidebar
│   │       └── Topbar.tsx                # Top navigation bar
│   │
│   ├── pages/
│   │   ├── LandingPage.tsx               # Marketing landing page
│   │   ├── Login.tsx                     # Login page
│   │   ├── Signup.tsx                    # Registration page
│   │   ├── ProfessorOnboarding.tsx        # Professor setup flow
│   │   ├── StudentOnboarding.tsx         # Student setup flow
│   │   ├── Dashboard.tsx                  # Course listing
│   │   ├── CourseDetail.tsx               # Course detail + uploads
│   │   ├── StudyMode.tsx                  # Study mode (graph + chat)
│   │   ├── StudyPlan.tsx                  # Study plan view
│   │   ├── Chat.tsx                       # Standalone chat page
│   │   ├── TakeTest.tsx                   # Test-taking interface
│   │   ├── ProfessorTests.tsx            # Test management
│   │   ├── Students.tsx                   # Student roster
│   │   ├── Assignments.tsx                # Assignment list
│   │   └── MindMap.tsx                   # 3D force graph
│   │
│   ├── store/
│   │   ├── authStore.ts                   # Auth state (Zustand)
│   │   └── graphStore.ts                  # Graph session state (Zustand)
│   │
│   └── utils/
│       └── analytics.ts                   # Analytics tracking
│
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

### 8.2 Routing Table

| Path | Component | Auth Required | Role |
|------|-----------|---------------|------|
| `/` | LandingPage | No | - |
| `/login` | Login | No | - |
| `/signup` | Signup | No | - |
| `/onboarding/professor` | ProfessorOnboarding | Yes | professor |
| `/onboarding/student` | StudentOnboarding | Yes | student |
| `/dashboard` | Dashboard | Yes | both |
| `/course/:courseId` | CourseDetail | Yes | both |
| `/course/:courseId/study` | StudyMode | Yes | student |
| `/course/:courseId/map` | MindMap | Yes | both |
| `/course/:courseId/tests` | ProfessorTests | Yes | professor |
| `/course/:courseId/students` | Students | Yes | professor |
| `/course/:courseId/assignments` | Assignments | Yes | both |
| `/chat` | Chat | Yes | both |

### 8.3 State Management (Zustand)

#### authStore
```typescript
interface AuthState {
  token: string | null
  role: 'professor' | 'student' | null
  user: User | null
  setAuth: (token, role, user) => void
  logout: () => void
  initialize: () => Promise<void>  // Validates token on app load
}
```

#### graphStore
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
  // Actions
  generateGraph: (topic, courseId?) => Promise<void>
  generateFromDocs: (courseId) => Promise<void>
  loadSession: (sessionId) => Promise<void>
  navigateToNode: (nodeId) => Promise<void>
  askQuestion: (nodeId, question) => Promise<void>
}
```

### 8.4 API Client Architecture

**Centralized Client (`src/api/client.ts`):**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Error handling interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)
```

---

## 9. Backend Architecture

### 9.1 Directory Structure

```
backend/
├── .env                                   # Environment variables
├── requirements.txt                        # Python dependencies
├── gen_keys.py                            # RSA key generator
├── private.pem / public.pem                # RSA keys (for RS256)
│
└── app/
    ├── main.py                            # FastAPI app entry point
    ├── worker.py                          # Celery worker entry point
    │
    ├── api/                              # Route handlers
    │   ├── auth.py                        # /auth/* endpoints
    │   ├── courses.py                     # /api/courses/* endpoints
    │   ├── documents.py                   # /api/documents/* endpoints
    │   ├── graphs.py                      # /api/graphs/* endpoints
    │   ├── sessions.py                    # /api/sessions/* endpoints
    │   ├── chat.py                        # /api/chat/* endpoints
    │   ├── tests.py                       # /api/tests/* endpoints
    │   ├── study_plans.py                 # /api/study-plans/* endpoints
    │   └── analytics.py                   # /api/analytics/* endpoints
    │
    ├── core/                             # Configuration & utilities
    │   ├── config.py                      # Settings (Pydantic BaseSettings)
    │   ├── db.py                          # MongoDB/Beanie initialization
    │   ├── qdrant.py                     # Qdrant client wrapper
    │   ├── storage.py                     # MinIO/S3 storage client
    │   ├── celery_app.py                  # Celery configuration
    │   ├── limiter.py                     # Rate limiting (slowapi)
    │   └── prompts.py                     # LLM prompt templates
    │
    ├── models/                           # Beanie document models
    │   ├── user.py                        # User model
    │   ├── course.py                      # Course model
    │   ├── document.py                    # Document model
    │   ├── graph.py                       # KnowledgeGraph, ChatMessage, StudySession
    │   ├── test.py                        # Test, TestAttempt, MockTest
    │   ├── study_plan.py                  # StudyPlan, TopicStudyPlan, StudyProgress
    │   └── analytics/                     # Analytics models
    │       ├── event.py                    # AnalyticsEvent
    │       ├── aggregate.py                # AnalyticsAggregate
    │       ├── user_profile.py             # AnalyticsUserProfile
    │       ├── node_metrics.py             # AnalyticsNodeMetrics
    │       ├── llm_usage.py                # AnalyticsLLMUsage
    │       └── rag_performance.py          # AnalyticsRAGPerformance
    │
    ├── schemas/                          # Pydantic request/response schemas
    │   ├── user.py
    │   ├── course.py
    │   ├── document.py
    │   ├── chat.py
    │   └── quiz.py
    │
    ├── services/                         # Business logic
    │   ├── llm.py                         # LLM adapter (Ollama via OpenAI SDK)
    │   ├── tutor.py                       # Socratic tutor service
    │   ├── graph_generator.py              # Basic LLM graph generation
    │   ├── advanced_graph_generator.py     # Multi-doc graph construction
    │   ├── graph_builder.py               # Triplet-based graph builder
    │   ├── triplet_extractor.py           # Triplet extraction from text
    │   ├── doc_extractor.py               # Document processing pipeline
    │   ├── pdf_extractor.py               # PDF/DOCX/PPTX text extraction
    │   ├── chunking.py                    # Text chunking + embedding
    │   ├── rag.py                         # RAG retrieval + reranking
    │   ├── reranker.py                    # Cross-encoder reranker
    │   ├── test_generator.py               # Test generation + grading
    │   ├── study_plan_generator.py         # Adaptive study plans
    │   └── analytics.py                   # Analytics computations
    │
    ├── tasks/                            # Celery task definitions
    │   └── analytics_aggregation.py        # Scheduled aggregation tasks
    │
    └── middleware/
        └── analytics.py                   # Analytics middleware (auto-tracking)
```

### 9.2 Key Services

#### LLM Service (`services/llm.py`)
- Wraps Ollama API (OpenAI-compatible endpoint)
- Supports streaming responses (NDJSON)
- Handles `<thought>` tag parsing (fine-tuned model reasoning)
- Configurable: `num_ctx=32768`, `temperature=0.7`, `timeout=120s`
- Retry logic: 1 retry with 2s backoff

#### RAG Service (`services/rag.py`)
- Two-stage retrieve-then-rerank:
  1. Vector search: Qdrant ANN (k=10 candidates)
  2. Reranking: Cross-encoder scores
  3. Weighted merge: `S_final = 0.3 * S_cosine + 0.7 * S_cross`
  4. Top-k injection: Take top 5, format into prompt context

#### Chunking Service (`services/chunking.py`)
- Sentence-level splitting using NLTK
- Sliding window: 400 words chunk size, 80 words overlap
- Merge small chunks (< 100 words) into previous
- Never splits sentences across chunk boundaries

### 9.3 Celery Task Schedule

| Task | Interval | TTL | Purpose |
|------|----------|-----|---------|
| `analytics.compute_daily_aggregates` | Every 24h | 2 hours | Roll up raw events |
| `analytics.update_user_profiles` | Every 25h | 2 hours | Recompute user profiles |
| `analytics.update_node_metrics` | Every 6h | 1 hour | Recompute node metrics |
| `analytics.detect_dropout_risk` | Every 7 days | 4 hours | Flag at-risk students |

---

## 10. AI/ML Pipeline

### 10.1 LLM Configuration

| Property | Value |
|----------|-------|
| **Model** | `gemma4:e2b` (fine-tuned) |
| **Base Architecture** | Gemma 2 2B |
| **Fine-Tuning Focus** | Socratic instruction, JSON structured output, quiz generation |
| **Inference Server** | Ollama (development) / vLLM (production) |
| **API Protocol** | Ollama native REST (`/api/chat`) |
| **Context Window** | 32,768 tokens |
| **Temperature** | 0.7 |

### 10.2 Embedding Model

| Property | Value |
|----------|-------|
| **Model** | `sentence-transformers/all-MiniLM-L6-v2` |
| **Architecture** | 6-layer MiniLM (distilled from BERT) |
| **Output Dimensionality** | 384 |
| **Model Size** | ~80 MB |
| **Max Sequence Length** | 256 tokens |
| **Loading** | Module-level singleton |

### 10.3 Reranker Model

| Property | Value |
|----------|-------|
| **Model** | `cross-encoder/ms-marco-MiniLM-L-6-v2` |
| **Purpose** | Score (query, document) pairs jointly |
| **Usage** | Re-rank top 10 Qdrant results to top 5 |

### 10.4 Fine-Tuned Model Features

The `gemma4:e2b` model has been fine-tuned to:
1. Emit reasoning tokens in `"thinking"` field before content
2. Generate valid JSON with graph structures
3. Follow Socratic tutoring principles
4. Generate well-structured quiz questions

**`<thought>` Envelope Parser:**
```python
# The adapter intercepts thinking tokens in real-time
if "thinking" in msg and msg["thinking"]:
    if not is_thinking:
        yield "<thought>"           # Open tag
        is_thinking = True
    yield msg["thinking"]           # Internal reasoning (hidden from student)
    continue

if is_thinking and "content" in msg and msg["content"]:
    yield "</thought>"              # Close tag
    is_thinking = False

if "content" in msg and msg["content"]:
    yield msg["content"]            # Student-facing token
```

---

## 11. Current Status & Issues

### 11.1 Launch Readiness Assessment

**Verdict: NOT LAUNCH-READY**

CobbleAI is a **functional prototype** with impressive architectural choices, but has structural bugs that make core features completely unreachable.

### 11.2 Critical Bugs (🔴)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **Hardcoded Session ID** - All users share `00000000-0000-0000-0000-000000000000` | `Chat.tsx:100` | All chat messages mixed into one pseudo-session |
| 2 | **No Auth Guard on `/chat/`** - LLM is publicly accessible | `chat.py:35` | Anyone can hammer endpoint, draining LLM resources |
| 3 | **Document Processing Uses `asyncio.create_task`** - Tasks lost on restart | `documents.py:259` | Uploads get stuck in "pending" forever |
| 4 | **Graph Generation May Silently Fail** - New event loop issues | `documents.py:82-83` | Auto graph generation fails silently |
| 5 | **Default JWT Keys** - Auth trivially bypassable | `config.py:14` | Attackers can impersonate any user |
| 6 | **`list_courses` Returns `docs_count=0` Always** - Hardcoded | `courses.py:76-81` | Misleading for professors |
| 7 | **Test Submit Has No Time Enforcement** | `tests.py:321-326` | Students can take unlimited time |
| 8 | **`generate_graph_from_docs` Blocks Request** - Synchronous processing | `graphs.py:118-134` | Spins for minutes, often times out |
| 9 | **Double Router Prefix on Study Plans** - ALL endpoints return 404 | `study_plans.py:14` + `main.py:60` | Entire Study Plan feature broken |
| 10 | **Chat Stream Error Handling** - No error on mid-stream failures | `Chat.tsx:113-138` | Frozen spinner with no retry option |

### 11.3 Half-Baked Features (🟠)

| # | Issue | Impact |
|---|-------|--------|
| 1 | **Double Prefix on Tests Router** - Same bug as Study Plans | Entire Tests feature unreachable (404) |
| 2 | **Celery Worker Is Dead Code** - Primary upload path doesn't use it | Document processing fragile, no retry logic |
| 3 | **Mode Parameter Ignored** - Teach/Test/Review modes do nothing | Mode selector UI is misleading |
| 4 | **`process_all_pending` Fire-and-Forget** - No completion feedback | Professors get no processing status |
| 5 | **Professor Test UI Missing Configuration** - No question count/topic filter | No control over generated questions |
| 6 | **Analytics `trackPageViews` Is No-Op** - Placeholder function | No page view analytics collected |
| 7 | **Study Plan Code Duplication** - `/generate` and `/regenerate` copy-pasted | Maintenance burden |
| 8 | **`TakeTest.tsx` Navigates to Non-Existent Route** - After submission | Students see 404 instead of results |

### 11.4 Missing Table Stakes (🟡)

| # | Issue | Impact |
|---|-------|--------|
| 1 | **No Input Validation** on course title/code | Blank/absurdly long titles break UI |
| 2 | **No Rate Limiting** on LLM-heavy endpoints (graphs, tests) | Single user can monopolize LLM |
| 3 | **No Confirmation Dialog** for deleting study plans | Accidental data loss with no undo |
| 4 | **No Password Strength Validation** on signup | Trivially weak passwords allowed |
| 5 | **No Email Verification Flow** | Anyone can sign up with fake email |
| 6 | **No Error Toast/Notification** - Uses `alert()` or silent console.error | No clear feedback after actions |
| 7 | **No Pagination** on document/list endpoints | Slow loads with many documents |
| 8 | **CORS Only Allows localhost** - Hardcoded | Breaks in any deployment |
| 9 | **No CSRF Protection** on form submissions | Future vulnerability if auth changes |

### 11.5 UX Gaps (🔵)

| # | Issue | Impact |
|---|-------|--------|
| 1 | **No Empty State Guidance** in StudyMode when no graph exists | Students see dead-end page |
| 2 | **No Loading Indicator** on document upload | UI appears frozen during upload |
| 3 | **Mixed API URL Conventions** - `127.0.0.1` vs `localhost` | Inconsistent behavior across browsers |
| 4 | **No Mobile Responsive Design** - Fixed pixel widths | Unusable on phones/tablets |
| 5 | **No Accessibility** - Keyboard navigation broken on graph | Inaccessible to keyboard/screen reader users |
| 6 | **"Forgot Password" Link Goes Nowhere** | Locked out users with no recovery |
| 7 | **Dashboard Sidebar Links Are Dead** - Analytics, Settings | Frustration, erodes trust |
| 8 | **No Guided Onboarding Flow** - Just collects name/institution | New users don't know how to start |

### 11.6 Summary Counts

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 Critical | 10 | Runtime errors, security, data loss, broken APIs |
| 🟠 Half-Baked | 8 | Dead code, incomplete features, 404 routes |
| 🟡 Missing | 9 | Validation, rate limiting, auth guards |
| 🔵 UX Gaps | 8 | Empty states, loading indicators, accessibility |
| **Total** | **35** | |

---

## 12. Security Analysis

### 12.1 Authentication & Authorization

**Current Implementation:**
- JWT with RS256 (asymmetric RSA signing)
- Keys stored in `.env` as PEM-encoded strings
- FastAPI-Users library for auth flows
- Role-based access: `"professor"` | `"student"`

**Vulnerabilities:**
1. **Default JWT Keys:** If `.env` not configured, uses `"temp_private_key"` / `"temp_public_key"` - trivially bypassable
2. **Unauthenticated LLM Endpoint:** `/chat/` allows `optional=True` - public LLM access
3. **No Email Verification:** `is_verified` field exists but never checked
4. **Weak Password Policy:** No complexity requirements (FastAPI-Users default: 3+ chars)

**Recommendations:**
- Add startup validation rejecting default/temp key values
- Require auth on ALL LLM endpoints
- Implement email verification flow
- Add password complexity validation (8+ chars, mixed case, numbers)

### 12.2 CORS Configuration

**Current State:**
```python
allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
               "http://localhost:5174", "http://127.0.0.1:5174"]
```

**Issue:** Hardcoded localhost - breaks on any deployment

**Recommendation:** Move to `settings.CORS_ORIGINS` loaded from `.env` as comma-separated list

### 12.3 Rate Limiting

**Current State:**
- `/chat/` has `@limiter.limit("20/minute")`
- Graph generation, test generation have NO limit

**Risk:** Single user can trigger hundreds of LLM calls

**Recommendation:** Add `@limiter.limit("5/minute")` to all LLM-heavy endpoints

### 12.4 Data Validation

**Missing Validations:**
- Course title/code: No length limits, no uniqueness check
- File uploads: No file type validation beyond extension
- JWT tokens: No expiration check on `/chat/` (optional auth)

---

## 13. Performance Considerations

### 13.1 Backend Optimizations Needed

| Area | Current State | Recommendation |
|------|---------------|----------------|
| **MongoDB Indexes** | Defined in models | Ensure indexes created (`beanie.init_beanie()` auto-creates) |
| **Connection Pooling** | Default Motor pool | Consider increasing `maxPoolSize` for high concurrency |
| **Query Pagination** | Not implemented | Add `skip`/`limit` to list endpoints (max 100) |
| **Caching** | Redis configured but unused | Cache concept graphs, user profiles |

### 13.2 Frontend Optimizations Needed

| Area | Current State | Recommendation |
|------|---------------|----------------|
| **Code Splitting** | All routes loaded upfront | Implement lazy loading with `React.lazy()` |
| **Virtual Scrolling** | Not implemented | Use for long chat histories, course lists |
| **State Management** | Zustand (good) | Consider React Query for data fetching/caching |
| **Bundle Size** | Not analyzed | Run `vite build --analyze` and tree-shake |

### 13.3 LLM Performance

| Metric | Current Value | Recommendation |
|--------|---------------|----------------|
| **Context Window** | 32,768 tokens | Sufficient for most use cases |
| **Chat Max Tokens** | 2,048 | May need increase for complex topics |
| **Graph Max Tokens** | 8,192 | Monitor for truncation |
| **Timeout** | 120 seconds | Consider streaming for better UX |

---

## 14. Deployment Architecture

### 14.1 Development Environment

```
Local Machine (Windows 11):
├── Docker Desktop (MongoDB, Redis, Qdrant, MinIO)
├── Python 3.11+ virtual environment (backend)
├── Node.js 18+ (frontend)
└── Ollama (gemma4:e2b model)
```

**Startup Commands:**
```bash
# 1. Infrastructure
docker-compose up -d

# 2. Ollama
ollama pull gemma4:e2b

# 3. Backend
cd backend && venv\Scripts\activate && pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 4. Frontend
cd frontend && npm install && npm run dev

# 5. Celery Worker (optional for production-like testing)
cd backend && celery -A app.worker worker --loglevel=info
```

### 14.2 Production Recommendations

| Component | Development | Production Recommendation |
|-----------|-------------|--------------------------|
| **LLM Serving** | Ollama | vLLM (better throughput, batching) |
| **Object Storage** | MinIO | AWS S3 or Cloudflare R2 |
| **Reverse Proxy** | None (direct) | Nginx or Cloudflare Tunnel |
| **Process Manager** | Manual uvicorn | systemd or Docker + supervisor |
| **Frontend Hosting** | Vite dev server | Vercel, Netlify, or S3 + CloudFront |
| **Environment** | `.env` file | Secret management (Vault, AWS Secrets Manager) |
| **Monitoring** | Console logs | Prometheus + Grafana, Sentry for errors |

### 14.3 Docker Compose Services

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: cobble-mongo
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: cobble-redis
    ports:
      - "6379:6379"
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: cobble-qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped

  minio:
    image: minio/minio
    container_name: cobble-minio
    ports:
      - "9002:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    restart: unless-stopped

volumes:
  mongo_data:
  qdrant_data:
  minio_data:
```

---

## 15. Recommendations & Roadmap

### 15.1 Top 5 Priority Fixes (Estimated: 3-5 Days)

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 1 | **Fix double-prefix on routers** (study_plans.py, tests.py) | 2 minutes | Unblocks 25% of product features |
| 2 | **Require auth on `/chat/` endpoint** | 1 line | Prevents unlimited free LLM access |
| 3 | **Move document processing to Celery** | 1 hour | Fixes silent document loss, adds retry |
| 4 | **Fix `TakeTest.tsx` result route** (404 after submission) | 2 hours | Students can see test results |
| 5 | **Fix hardcoded session ID in `Chat.tsx`** | 30 minutes | Fixes analytics attribution |

### 15.2 Pre-Launch Checklist

**Security:**
- [ ] Fix double-prefix on study_plans.py and tests.py routers
- [ ] Require auth on /chat/ endpoint
- [ ] Validate JWT keys are not defaults at startup
- [ ] Add rate limiting to graph generation and test generation endpoints
- [ ] Add password strength validation (8+ chars)
- [ ] Implement email verification or remove is_verified field

**User Experience:**
- [ ] Add toast notifications (replace all alert() calls)
- [ ] Add loading indicators to all async actions
- [ ] Add empty state guidance to StudyMode when no graph exists
- [ ] Add confirmation dialog for destructive actions
- [ ] Fix "Forgot Password" link (implement or remove)
- [ ] Remove or implement dead sidebar links (Analytics, Settings)
- [ ] Add mobile responsive breakpoints

**Stability:**
- [ ] Move document processing to Celery
- [ ] Add CORS origins from .env instead of hardcoded localhost
- [ ] Add pagination to list endpoints
- [ ] Add error handling to chat streaming

### 15.3 Post-Launch Roadmap

**Phase 1: Core Stability (Weeks 1-2)**
- Fix all critical bugs (35 issues identified)
- Add comprehensive error handling
- Implement proper logging and monitoring

**Phase 2: Feature Completion (Weeks 3-4)**
- Complete Tests feature (result page, analytics)
- Complete Study Plans feature (regenerate, progress tracking)
- Implement email verification flow
- Add password reset functionality

**Phase 3: Polish & Scale (Weeks 5-6)**
- Mobile responsive design
- Accessibility improvements (WCAG 2.1 AA)
- Performance optimizations (pagination, caching, lazy loading)
- Production deployment setup

**Phase 4: Advanced Features (Weeks 7-8)**
- Real-time collaboration (WebSocket for live tutoring)
- Advanced analytics dashboard for professors
- Export functionality (PDF syllabus, study plans)
- Integration with LMS platforms (Canvas, Blackboard)

### 15.4 What's Well-Implemented

- ✅ RAG retrieval pipeline (`rag.py` + `reranker.py`) is solid with proper fallback handling
- ✅ Analytics service architecture (`analytics.py`) is well-designed with fire-and-forget tracking
- ✅ Graph generation prompts in `advanced_graph_generator.py` show careful prompt engineering
- ✅ React Flow visualization with dagre layout is polished
- ✅ Zustand state management is clean and consistent
- ✅ Document deduplication logic and Celery worker design show good engineering
- ✅ TutorService's RAG integration with source resolution is well-structured

---

## Appendix A: Environment Variables

### Backend (.env)

```bash
# Database
MONGO_URI=mongodb://localhost:27017
DATABASE_NAME=cobbleai

# Authentication
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...

# LLM
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=gemma4:e2b

# Embeddings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Vector Database
QDRANT_URL=http://localhost:6333

# Object Storage (MinIO/S3)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT_URL=http://localhost:9002
S3_BUCKET=cobble-documents

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# CORS
ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

### Frontend (.env.local)

```bash
VITE_API_URL=http://127.0.0.1:8000
```

---

## Appendix B: Port Reference

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

## Appendix C: Quick Command Reference

```bash
# Start everything
docker-compose up -d
ollama pull gemma4:e2b
cd backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
cd frontend && npm run dev

# Stop everything
docker-compose down

# View logs
docker logs cobble-mongo -f
docker logs cobble-redis -f
docker logs cobble-qdrant -f
docker logs cobble-minio -f

# Clear database
docker exec -it cobble-mongo mongosh --eval "db.dropDatabase()" cobbleai

# Check Ollama
ollama list
ollama run gemma4:e2b "Test"

# API health check
curl http://127.0.0.1:8000/health

# Frontend build
cd frontend && npm run build

# Backend tests (when implemented)
cd backend && pytest

# Celery worker
cd backend && celery -A app.worker worker --loglevel=info

# Celery beat (scheduled tasks)
cd backend && celery -A app.worker beat --loglevel=info
```

---

## Appendix D: File Inventory

### Backend Files (~50 files)

| # | File | Purpose |
|---|------|---------|
| 1 | `app/main.py` | FastAPI app entry, CORS, routers, lifespan |
| 2 | `app/worker.py` | Celery worker entry point |
| 3-9 | `app/core/*` | Config, db, qdrant, storage, celery, limiter, prompts |
| 10-14 | `app/models/*` | User, Course, Document, Graph, Test, StudyPlan, Analytics |
| 15 | `app/repositories/base.py` | Generic CRUD base class |
| 16-20 | `app/schemas/*` | Pydantic request/response schemas |
| 21-26 | `app/api/*` | Route handlers (auth, courses, documents, graphs, sessions, chat, tests, study_plans, analytics) |
| 27-37 | `app/services/*` | Business logic (llm, tutor, graph_generator, advanced_graph_generator, graph_builder, triplet_extractor, doc_extractor, pdf_extractor, chunking, rag, reranker, test_generator, study_plan_generator, analytics) |
| 38-39 | `app/tasks/*` | Celery tasks (analytics_aggregation) |
| 40 | `app/middleware/analytics.py` | Analytics middleware |

### Frontend Files (~35 files)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/main.tsx` | App entry point |
| 2 | `src/App.tsx` | Root component + routing |
| 3-10 | `src/pages/*` | LandingPage, Login, Signup, Dashboard, CourseDetail, StudyMode, StudyPlan, Chat, TakeTest, ProfessorTests, Students, Assignments, MindMap, Onboarding |
| 11-14 | `src/components/*` | AuthLayout, KnowledgeGraph, NodeInfo, TutorChat, ProfessorLayout, Sidebar, Topbar |
| 15-16 | `src/store/*` | authStore, graphStore (Zustand) |
| 17-24 | `src/api/*` | client, auth, courses, documents, graphs, sessions, studyPlans, tests |
| 25 | `src/utils/analytics.ts` | Analytics tracking |

---

**END OF REPORT**

*Report generated on: April 28, 2026*  
*Project: CobbleAI v2.0*  
*Status: Active Development (Not Launch-Ready)*
