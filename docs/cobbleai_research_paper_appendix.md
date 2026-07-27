# CobbleAI: Complete Technical Specification
### A Research-Grade System Architecture Document

---

## Table of Contents

1. [System Overview & Design Principles](#1-system-overview--design-principles)
2. [Infrastructure Topology](#2-infrastructure-topology)
3. [Configuration & Environment Management](#3-configuration--environment-management)
4. [Data Models & MongoDB Schema Inventory](#4-data-models--mongodb-schema-inventory)
5. [Document Ingestion Pipeline](#5-document-ingestion-pipeline)
6. [Semantic Chunking Algorithm](#6-semantic-chunking-algorithm)
7. [Vector Embedding & Indexing](#7-vector-embedding--indexing)
8. [Retrieval-Augmented Generation (RAG) Pipeline](#8-retrieval-augmented-generation-rag-pipeline)
9. [LLM Orchestration Layer](#9-llm-orchestration-layer)
10. [Socratic Tutoring Engine](#10-socratic-tutoring-engine)
11. [Multi-Document Knowledge Graph Construction](#11-multi-document-knowledge-graph-construction)
12. [Automated Assessment Generation & LLM-Based Grading](#12-automated-assessment-generation--llm-based-grading)
13. [Adaptive Study Plan Generator](#13-adaptive-study-plan-generator)
14. [Behavioral Analytics Data Warehouse](#14-behavioral-analytics-data-warehouse)
15. [Celery Task Orchestration & Beat Scheduling](#15-celery-task-orchestration--beat-scheduling)
16. [API Layer, Middleware & Security](#16-api-layer-middleware--security)

---

## 1. System Overview & Design Principles

CobbleAI is an AI-native educational platform that transforms static course materials (PDF, DOCX, PPTX) into interactive, graph-based learning experiences powered by a fine-tuned large language model. The platform enables professors to upload syllabi and students to navigate auto-generated knowledge graphs while engaging in Socratic dialogue with an AI tutor grounded in their actual course content.

**Governing Principles:**
- **High Cohesion:** Each module has exactly one responsibility. The PDF parser does not touch the database. The HTTP layer does not run embedding inference.
- **Low Coupling:** Modules communicate only through defined interfaces — REST endpoints, Celery task signatures, or the repository/service pattern. No module imports the internals of another.
- **Stateless API:** The FastAPI layer maintains no in-process state. All persistence is delegated to MongoDB, Qdrant, Redis, or MinIO.

---

## 2. Infrastructure Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                     Client Layer                                  │
│   React 19 + TypeScript + Vite [Port 5173]                       │
│   State: Zustand │ Graph: React Flow │ Styling: Tailwind CSS 4   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP / JWT Bearer
┌────────────────────────────▼─────────────────────────────────────┐
│                     API Gateway                                   │
│   FastAPI 0.100+ (Pydantic v2) [Port 8000]                       │
│   Middleware: CORS, Analytics, Rate Limiting (slowapi)            │
│   Auth: FastAPI-Users + JWT RS256                                 │
└───┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
    │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐
│MongoDB │ │Qdrant  │ │MinIO   │ │Redis   │ │Ollama          │
│  6.0   │ │        │ │  (S3)  │ │  7.x   │ │ gemma4:e2b     │
│:27017  │ │:6333   │ │:9002   │ │:6379   │ │ :11434         │
└────────┘ └────────┘ └────────┘ └───┬────┘ └────────────────┘
                                     │
                               ┌─────▼──────┐
                               │Celery Worker│
                               │  + Beat     │
                               └─────────────┘
```

| Service | Technology | Port | Role |
|:---|:---|:---|:---|
| **Application Database** | MongoDB 6.0 (Beanie ODM) | 27017 | Users, courses, documents, graphs, sessions, chat, analytics |
| **Vector Store** | Qdrant | 6333 | 384-dim document chunk embeddings, Cosine distance |
| **Object Storage** | MinIO (S3-compatible) | 9002 (API), 9001 (Console) | Raw PDFs, DOCX, PPTX blobs |
| **Message Broker / Cache** | Redis 7.x | 6379 | Celery broker (DB 0), Celery result backend (DB 1) |
| **LLM Inference** | Ollama | 11434 | Hosts fine-tuned `gemma4:e2b` model |
| **Task Queue** | Celery 5.x | — | Document processing, analytics aggregation |

---

## 3. Configuration & Environment Management

All runtime configuration is centralized through Pydantic Settings (`app.core.config`), which reads from a `.env` file and validates on import:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    MONGO_URI:            str = "mongodb://localhost:27017/cobbleai"
    DATABASE_NAME:        str = "cobbleai"
    REDIS_URL:            str = "redis://localhost:6379/0"
    QDRANT_URL:           str = "http://localhost:6333"
    AWS_ACCESS_KEY_ID:    str = "minioadmin"
    AWS_SECRET_ACCESS_KEY:str = "minioadmin"
    S3_ENDPOINT_URL:      str = "http://localhost:9002"
    S3_BUCKET:            str = "cobble-documents"
    LLM_BASE_URL:         str = "http://localhost:11434"
    LLM_MODEL:            str = "gemma4:e2b"
    JWT_PRIVATE_KEY:      str   # RS256 private key (PEM)
    JWT_PUBLIC_KEY:        str   # RS256 public key (PEM)
```

**Fail-Fast JWT Validation:** On import, `settings.validate_jwt_keys()` checks for placeholder markers (`"temp_private_key"`, `"REPLACE_WITH_YOUR_OWN"`). If detected, the server raises `RuntimeError` and refuses to start — preventing accidental deployment with insecure keys.

---

## 4. Data Models & MongoDB Schema Inventory

All models use **Beanie ODM** (async MongoDB ODM built on Motor + Pydantic v2). Every document uses `uuid.UUID` as primary key with `default_factory=uuid.uuid4`.

### 4.1 Core Collections

| Collection | Model Class | Key Fields | Purpose |
|:---|:---|:---|:---|
| `users` | `User` | `id`, `role` ("student"/"professor"), `name`, `email`, `institution`, `preferences`, `refresh_token_hash` | Authentication & profile |
| `courses` | `Course` | `id`, `professor_id`, `title`, `code`, `docs_count` | Course containers |
| `enrolments` | `Enrolment` | `course_id`, `student_id` | Student ↔ Course binding |
| `course_invites` | `CourseInvite` | `course_id`, `code`, `expires_at` | Time-limited join codes |
| `documents` | `DocumentModel` | `course_id`, `filename`, `s3_path`, `status`, `file_type`, `file_size_bytes`, `chunk_count`, `error_message`, `processed_at` | Document lifecycle tracking |
| `knowledge_graphs` | `KnowledgeGraph` | `topic`, `course_id`, `nodes[]`, `edges[]`, `created_by` | Graph structure storage |
| `study_sessions` | `StudySession` | `graph_id`, `student_id`, `current_node_id`, `visited_nodes[]` | Session state |
| `chat_messages` | `ChatMessage` | `session_id`, `node_id`, `role`, `content`, `sources[]` | Conversation persistence |

**Document Status Lifecycle:** `pending` → `processing` → `ready` | `failed`

### 4.2 Analytics Collections

| Collection | Model Class | Schedule | Purpose |
|:---|:---|:---|:---|
| `analytics_events` | `AnalyticsEvent` | Real-time (append-only, 90-day TTL) | Raw event warehouse |
| `analytics_aggregates` | `AnalyticsAggregate` | Daily (Celery Beat) | Pre-computed rollups |
| `analytics_user_profiles` | `AnalyticsUserProfile` | Every 25 hours | Lifetime learning profiles |
| `analytics_node_metrics` | `AnalyticsNodeMetrics` | Every 6 hours | Per-concept difficulty scoring |
| `analytics_llm_usage` | `AnalyticsLLMUsage` | Real-time | LLM call latency, token counts |
| `analytics_rag_performance` | `AnalyticsRAGPerformance` | Real-time | Retrieval latency, relevance scores |

### 4.3 `AnalyticsEvent` Schema (The Core Warehouse Record)

```
┌──────────────────────────────────────────────────────────────┐
│ AnalyticsEvent (immutable, append-only)                       │
├──────────────────┬───────────────────────────────────────────┤
│ user_id          │ UUID — who performed the action            │
│ user_role        │ "student" | "professor"                    │
│ event_type       │ e.g. "node_visited", "question_asked",     │
│                  │      "session_started", "document_uploaded" │
│ event_category   │ "navigation" | "chat" | "llm" | "api"     │
│ course_id        │ UUID (nullable)                            │
│ graph_id         │ UUID (nullable)                            │
│ session_id       │ UUID (nullable)                            │
│ node_id          │ str (nullable) — concept node identifier   │
│ document_id      │ UUID (nullable)                            │
│ payload          │ Dict — event-specific flexible data        │
│ timestamp        │ datetime (UTC)                             │
│ platform         │ "web"                                      │
│ user_agent       │ str (nullable)                             │
│ ip_address       │ str (nullable)                             │
└──────────────────┴───────────────────────────────────────────┘
```

**MongoDB Indexes on `analytics_events`:**
- Single-field: `user_id`, `event_type`, `event_category`, `course_id`, `graph_id`, `session_id`, `node_id`, `document_id`, `timestamp`
- Composite: `(user_id, timestamp DESC)`, `(course_id, timestamp DESC)`, `(event_category, timestamp DESC)`, `(node_id, timestamp DESC)`

### 4.4 `AnalyticsNodeMetrics` Schema

```
┌──────────────────────────────────────────────────────────────┐
│ AnalyticsNodeMetrics (one per graph_id + node_id, unique)     │
├──────────────────────┬───────────────────────────────────────┤
│ graph_id             │ UUID                                   │
│ node_id              │ str                                    │
│ node_label           │ str (denormalized for queries)         │
│ course_id            │ UUID (nullable)                        │
│ total_visits         │ int — all visits including revisits    │
│ unique_students      │ int — distinct student count           │
│ total_time_spent_sec │ int — cumulative dwell time            │
│ avg_time_per_visit   │ float — total_time / total_visits      │
│ avg_dwell_time_sec   │ float                                  │
│ revisit_rate         │ float — (visits - uniques) / visits    │
│ total_questions_asked│ int                                    │
│ avg_questions_per_student │ float                             │
│ confusion_score      │ float — derived metric (see §14.3)    │
│ position_in_graph    │ int — BFS depth from root              │
│ retrieval_count      │ int — RAG query count for this topic   │
│ hour_distribution    │ Dict {0..23: count}                    │
│ day_of_week_dist     │ Dict {0..6: count}                     │
└──────────────────────┴───────────────────────────────────────┘
```

### 4.5 `AnalyticsUserProfile` Schema

```
┌──────────────────────────────────────────────────────────────┐
│ AnalyticsUserProfile (one per user, unique on user_id)        │
├──────────────────────┬───────────────────────────────────────┤
│ user_id              │ UUID                                   │
│ lifetime_stats       │ Dict:                                  │
│   total_sessions     │   int                                  │
│   total_questions    │   int                                  │
│   total_nodes_visited│   int                                  │
│   total_graphs       │   int                                  │
│   total_courses      │   int                                  │
│   first_session_date │   datetime                             │
│   last_active_date   │   datetime                             │
│   study_streak_days  │   int                                  │
│   avg_session_dur_sec│   float                                │
│   preferred_study_time│  "morning"/"afternoon"/"evening"/"night"│
│   learning_style     │   "linear" | "exploratory"             │
│ topic_interests      │ List[{topic, engagement_score, q_count}]│
│ performance_indicators│ Dict:                                 │
│   engagement_level   │   "high"/"medium"/"low"                │
│   risk_of_dropout    │   "high"/"medium"/"low"                │
│   knowledge_coverage │   float (0.0–1.0)                     │
│   days_inactive      │   int                                  │
└──────────────────────┴───────────────────────────────────────┘
```

---

## 5. Document Ingestion Pipeline

**Entry Point:** `POST /documents/upload` (professor-only, authenticated)

**Implementation:** `app/worker.py` → Celery task `process_document`

### 5.1 Pipeline Stages

```
Upload → S3 Storage → Celery Enqueue → Extract → Chunk → Embed → Qdrant Upsert
  │          │              │              │         │        │          │
  │     boto3.put_object   delay()    pdfplumber  nltk   MiniLM-L6  qdrant_sync
  │          │              │         python-docx  sent_    v2        .upsert()
  │          │              │         python-pptx tokenize
  └──────────┴──────────────┴──────────┴──────────┴────────┴──────────┘
```

### 5.2 Text Extraction (`app/services/pdf_extractor.py`)

| File Type | Library | Extraction Method |
|:---|:---|:---|
| **PDF** | `pdfplumber` | `pdfplumber.open(BytesIO(bytes))` → iterate `pdf.pages` → `page.extract_text()` → concatenate with newline separators |
| **DOCX** | `python-docx` | `docx.Document(BytesIO(bytes))` → join `paragraph.text` for all paragraphs with `\n` |
| **PPTX** | `python-pptx` | `pptx.Presentation(BytesIO(bytes))` → iterate slides → iterate `slide.shapes` → extract `shape.text` where `hasattr(shape, "text")` |

**Key Detail:** All extractors operate on `bytes` via `BytesIO`, meaning the file is never written to local disk — it streams directly from S3 into memory.

### 5.3 Status Tracking

The worker updates `DocumentModel.status` at each phase:
1. `"pending"` — Record created, file uploaded to S3, Celery task enqueued.
2. `"processing"` — Worker has picked up the task, extraction begun.
3. `"ready"` — All chunks embedded and indexed in Qdrant. `chunk_count` field populated.
4. `"failed"` — Exception caught. `error_message` field populated with traceback.

**Retry Policy:** `max_retries=3`, exponential backoff, `task_soft_time_limit=300s`, `task_time_limit=360s`.

---

## 6. Semantic Chunking Algorithm

**Implementation:** `app/services/chunking.py` → `split_into_chunks()`

### 6.1 Parameters

| Parameter | Value | Rationale |
|:---|:---|:---|
| **Target chunk size** ($C_{max}$) | 400 words | Approximates the 512-token BERT sequence limit with buffer for overlap |
| **Overlap window** ($O_{win}$) | 80 words | 20% of chunk size — preserves context at boundaries |
| **Minimum chunk size** ($C_{min}$) | 100 words | Prevents sparse vectors from degrading retrieval quality |

### 6.2 Algorithm Pseudocode

```
FUNCTION split_into_chunks(text, C_max=400, O_win=80, C_min=100):
    sentences ← nltk.sent_tokenize(text)
    chunks ← []
    current_chunk ← []
    current_length ← 0

    FOR EACH sentence IN sentences:
        word_count ← len(sentence.split())

        IF current_length + word_count > C_max AND current_chunk is not empty:
            chunks.append(join(current_chunk))

            // Compute overlap: walk backwards through current_chunk
            overlap_chunk ← []
            overlap_length ← 0
            FOR s IN reversed(current_chunk):
                s_len ← len(s.split())
                IF overlap_length + s_len ≤ O_win:
                    overlap_chunk.insert(0, s)
                    overlap_length += s_len
                ELSE:
                    BREAK
            current_chunk ← overlap_chunk
            current_length ← overlap_length

        current_chunk.append(sentence)
        current_length += word_count

    // Handle final chunk
    IF current_chunk AND current_length ≥ C_min:
        chunks.append(join(current_chunk))
    ELSE IF current_chunk AND chunks is not empty:
        chunks[-1] += " " + join(current_chunk)    // Merge into previous

    RETURN chunks
```

**Critical Design Choice:** The overlap is computed by walking backwards through complete sentences, not by slicing at a fixed character offset. This guarantees that no sentence is ever split across the boundary — every chunk begins and ends on a sentence boundary.

---

## 7. Vector Embedding & Indexing

**Implementation:** `app/services/chunking.py` → `embed_and_store()`

### 7.1 Embedding Model

| Property | Value |
|:---|:---|
| **Model** | `sentence-transformers/all-MiniLM-L6-v2` |
| **Architecture** | 6-layer MiniLM (distilled from BERT) |
| **Output Dimensionality** | 384 |
| **Model Size** | ~80 MB |
| **Max Sequence Length** | 256 tokens |
| **Loading** | Loaded once as a module-level singleton: `embedder = SentenceTransformer(...)` |

### 7.2 Qdrant Configuration

**Client Architecture:** Two separate clients are maintained (`app/core/qdrant.py`):
- `qdrant_sync` (`QdrantClient`) — Used by Celery workers (synchronous ingestion path)
- `qdrant_async` (`AsyncQdrantClient`) — Used by FastAPI routes (async retrieval path)

**Collection Strategy:** One collection per course, named `course_{uuid}`.

**Collection Creation:**
```python
qdrant_sync.create_collection(
    collection_name=f"course_{course_id}",
    vectors_config={"size": 384, "distance": "Cosine"}
)
```

**Race Condition Handling:** If `create_collection` raises HTTP 409 (already exists), the error is caught and silently handled — making the operation idempotent across concurrent workers.

### 7.3 Vector Point Structure

Each upserted point contains the full chunk text in its payload, enabling direct retrieval without secondary database lookups:

```python
PointStruct(
    id=str(uuid.uuid4()),          # Unique point ID
    vector=embedding.tolist(),     # 384-dim float array
    payload={
        "chunk_id": point_id,      # Same as point ID
        "doc_id": doc_id,          # Source document UUID
        "course_id": course_id,    # Parent course UUID
        "text": chunk,             # Full chunk text
        "filename": filename       # Source filename (optional)
    }
)
```

---

## 8. Retrieval-Augmented Generation (RAG) Pipeline

**Implementation:** `app/services/rag.py` → `retrieve_context()`

### 8.1 Two-Stage Retrieve-then-Rerank Architecture

```
Student Query
     │
     ▼
┌────────────────────┐
│ 1. EMBED QUERY     │  sentence-transformers/all-MiniLM-L6-v2
│    → 384-dim vector │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 2. VECTOR SEARCH   │  Qdrant ANN (Cosine Similarity)
│    Fetch 2k chunks │  where k=5 → fetch 10 candidates
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 3. CROSS-ENCODER   │  cross-encoder/ms-marco-MiniLM-L-6-v2
│    RERANK          │  Score each (query, chunk) pair jointly
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 4. WEIGHTED MERGE  │  S_final = 0.3·S_cosine + 0.7·S_cross
│    Sort descending │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 5. TOP-k INJECTION │  Take top 5, format into prompt context
└────────────────────┘
```

### 8.2 The Reranking Formula

For each candidate chunk $i$:

$$S_{final,i} = (0.3 \times S_{cosine,i}) + (0.7 \times S_{cross,i})$$

Where:
- $S_{cosine,i}$ = Qdrant's approximate nearest neighbor score (cosine similarity)
- $S_{cross,i}$ = Cross-encoder joint relevance score

**Rationale for 0.3/0.7 weighting:** The bi-encoder (cosine) produces fast but coarse-grained similarity scores — it embeds query and document independently. The cross-encoder scores the (query, document) pair jointly through all transformer attention layers, capturing fine-grained semantic interactions. The 70% weight on cross-encoder reflects its significantly higher precision.

### 8.3 Reranker Implementation (`app/services/reranker.py`)

```python
class Reranker:
    def __init__(self):
        self.model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        pairs = [[query, doc] for doc in documents]
        scores = self.model.predict(pairs)
        return scores.tolist()

reranker_client = Reranker()  # Module-level singleton
```

The `CrossEncoder.predict()` call passes all `(query, document)` pairs through the transformer in a single batch, returning calibrated relevance scores.

### 8.4 Context Formatting

Retrieved chunks are formatted into labeled sections for the LLM prompt:
```
[Document 1]:
<chunk text>

---

[Document 2]:
<chunk text>
```

Each source is tracked with metadata: `{ doc_id, relevance_score, chunk_index, filename }`.

---

## 9. LLM Orchestration Layer

**Implementation:** `app/services/llm.py` → `LLMAdapter`

### 9.1 Model Specification

| Property | Value |
|:---|:---|
| **Model** | `gemma4:e2b` (fine-tuned) |
| **Base Architecture** | Gemma 2 2B |
| **Fine-Tuning Focus** | Socratic instruction, JSON structured output, quiz generation |
| **Inference Server** | Ollama (development) / vLLM (production) |
| **API Protocol** | Ollama native REST (`/api/chat`) |
| **Base URL** | `http://localhost:11434` |

### 9.2 Hyperparameters

| Parameter | Value | Code Reference |
|:---|:---|:---|
| **Context Window** (`num_ctx`) | 32,768 tokens | `payload["options"]["num_ctx"] = 32768` |
| **Temperature** | 0.7 | `payload["options"]["temperature"] = 0.7` |
| **Max Predict (Tutoring)** | 2,048 tokens | `tutor.py: max_tokens=2048` |
| **Max Predict (Chat)** | 4,096 tokens | `llm.py: max_tokens=4096` |
| **Max Predict (Graph/Test)** | 8,192 tokens | `graph_generator.py / test_generator.py` |
| **HTTP Timeout** | 120 seconds | `self.timeout = 120` |
| **Retry on Error** | 1 retry with 2s backoff | `generate_full_response: range(2)` |

### 9.3 Streaming Architecture

The `LLMAdapter.generate_response()` method implements a true async streaming generator over Ollama's NDJSON stream:

```
Client ──POST──▶ Ollama /api/chat (stream=true)
                     │
                     ▼ (NDJSON lines)
              {"message": {"content": "Hello"}, "done": false}
              {"message": {"content": " world"}, "done": false}
              {"message": {"thinking": "Let me reason..."}, "done": false}
              {"message": {"content": "Final answer"}, "done": true}
```

### 9.4 The `<thought>` Envelope Parser

The fine-tuned `gemma4:e2b` model emits reasoning tokens in a `"thinking"` field before producing student-facing content. The adapter intercepts this in real-time:

```python
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

Downstream consumers (graph generator, tutor) strip `<thought>...</thought>` blocks via regex before presenting output or parsing JSON.

### 9.5 URL Normalization

The adapter strips trailing `/v1` suffixes from `LLM_BASE_URL` to ensure compatibility with Ollama's native API (which uses `/api/chat`, not the OpenAI-compatible `/v1/chat/completions`):

```python
self.base_url = raw_url.rstrip("/").removesuffix("/v1")
```

---

## 10. Socratic Tutoring Engine

**Implementation:** `app/services/tutor.py` → `TutorService`

### 10.1 System Prompt Template

The tutor operates under strict instructional constraints injected as a system prompt:

```
You are a Socratic tutor helping a student understand concepts
from their course materials.

Context you have:
- Current concept: {node_label} - {node_description}
- Connected concepts: {neighbors}
- Course materials: {course_context}

Rules:
1. Answer based PRIMARILY on the provided course materials
2. Be concise but thorough (2-4 sentences for initial answers)
3. If the topic is not in the course materials, say:
   "This isn't covered in your course materials, but here's what I know..."
4. Reference specific documents when possible using:
   "According to [Document Name]..."
5. When introducing a topic, clearly explain how it fits into the
   broader course context and how it relates to connected concepts.
6. Reference connected concepts to help the student see relationships.
7. Use specific evidence from the provided course materials.

Course Material Sources:
{source_list}
```

### 10.2 Context Assembly Pipeline

When `TutorService.answer_question()` is called:

1. **RAG Retrieval:** Calls `retrieve_context(question, course_id, top_k=5, use_rerank=True)` — triggers the full two-stage retrieval pipeline (§8).
2. **Neighbor Formatting:** Graph neighbors are formatted as comma-separated `"Label (relation)"` strings.
3. **Source List:** Retrieved documents are listed as `"- filename.pdf (Relevance: 0.85)"`.
4. **History Injection:** The full chat history (`List[Dict]`) is prepended to the messages array, followed by the current user question.
5. **LLM Call:** `generate_full_response(system=system_prompt, messages=[...history, user_msg], max_tokens=2048)`.

### 10.3 Observability Hooks

Both RAG and LLM calls are instrumented with fire-and-forget analytics:

- **RAG Tracking:** `asyncio.create_task(self._track_rag(...))` — Records to `analytics_rag_performance` collection: retrieval count, latency, source doc IDs, relevance scores.
- **LLM Tracking:** `asyncio.create_task(self._track_llm(...))` — Records to `analytics_llm_usage` collection: model name, prompt text (truncated to 200 chars), latency, estimated input/output tokens (word-count based), RAG success flag.

---

## 11. Multi-Document Knowledge Graph Construction

**Implementation:** `app/services/advanced_graph_generator.py` → `AdvancedGraphGenerator`

### 11.1 Two-Pass LLM Pipeline

**Pass 1 — Concept Extraction (`_extract_concepts`):**
- Input: Up to 25,000 characters of concatenated document text (with `--- Document: filename ---` separators).
- Instruction: Extract 15–25 core concepts with `name`, `description`, `category` (technology/algorithm/concept/tool/framework/methodology), and `source_docs[]`.
- Relationship types: `prerequisite_for`, `builds_on`, `contrasts_with`, `is_part_of`, `enables`, `uses`, `produces`, `requires`.
- Fallback: If the first pass returns 0 concepts (model choked on 25k chars), retry with only the first 8,000 characters.

**Pass 2 — Cross-Document Enrichment (`_enrich_graph`):**
- Input: The JSON graph from Pass 1 + all document titles.
- Instruction: Add missing cross-document relationships, ensure every node has ≥2 connections, merge duplicates, assign difficulty levels (`beginner`/`intermediate`/`advanced`).
- Max tokens: 4,096.

### 11.2 JSON Fault-Tolerance (`_clean_and_parse_json`)

Small LLMs frequently produce malformed JSON. The parser applies a sequence of regex corrections:

| Step | Regex | Purpose |
|:---|:---|:---|
| 1 | `<thought>.*?</thought>` | Strip reasoning blocks |
| 2 | `\*\*(.*?)\*\*` | Remove bold markdown from keys/values |
| 3 | `__(.*?)__` | Remove underscore-bold |
| 4 | `(?<!\w)\*(.+?)\*(?!\w)` | Remove standalone italic |
| 5 | `~~(.*?)~~` | Remove strikethrough |
| 6 | `` `([^`]+)` `` | Remove inline code ticks |
| 7 | ` ```(?:json)?\s*\n(.*?)\n``` ` | Extract from code fences |
| 8 | `\{.*\}` (dotall) | Last resort: find first `{` to last `}` |

### 11.3 Graph Validation (`_validate_graph`)

Post-parsing, two structural checks are applied:
1. **Orphan Detection:** Nodes not appearing in any edge's `from` or `to` are logged as warnings.
2. **Density Check:** If `|edges| < 1.5 × |nodes|`, a sparsity warning is emitted — indicating the enrichment pass may have underperformed.

### 11.4 UUID Assignment (`_assign_uuids`)

Concepts are mapped to deterministic node IDs (`node_{uuid_hex[:12]}`) and edges to `edge_{uuid_hex[:12]}`, producing a final graph structure:

```json
{
  "nodes": [{"id": "node_a1b2c3d4e5f6", "label": "...", "description": "...", "category": "...", "difficulty": "..."}],
  "edges": [{"id": "edge_f6e5d4c3b2a1", "from": "node_...", "to": "node_...", "relation": "prerequisite_for", "strength": 0.9}]
}
```

---

## 12. Automated Assessment Generation & LLM-Based Grading

**Implementation:** `app/services/test_generator.py` → `TestGenerator`, `TestEvaluator`

### 12.1 Test Generation

The `TestGenerator` produces four question types from course content:

| Type | Schema | Marks Range |
|:---|:---|:---|
| **MCQ** | 4 options (`MCQOption: id, text, is_correct`), exactly 1 correct | Easy: 1–2, Medium: 3–5 |
| **True/False** | `correct_answer: bool` | Easy: 1–2 |
| **Short Answer** | Free-text, evaluated by LLM | Medium: 3–5, Hard: 6–10 |
| **Code/Practical** | Starter code + expected output | Hard: 6–10 |

**Difficulty Distribution (enforced in prompt):** 30% easy, 50% medium, 20% hard.

**Max tokens for generation:** 8,192.

### 12.2 Mock Test Generation

A separate prompt template (`MOCK_TEST_PROMPT`) generates learning-focused practice questions with mandatory hints and detailed explanations. Input: graph topic labels + descriptions + optional focus areas.

### 12.3 LLM-Based Short Answer Grading (`TestEvaluator`)

For short-answer questions, the evaluator sends the student's response to the LLM alongside the expected answer:

```
Question: {question_text}
Expected: {explanation}
Student Answer: {student_answer}
Max Marks: {marks}

Rate the answer (0 to max_marks) and provide brief feedback.
Return JSON: {"marks": 3.5, "is_correct": true, "feedback": "..."}
```

**Correctness Threshold:** A student scores "correct" if awarded ≥ 50% of available marks (`marks >= question.marks * 0.5`).

**Max tokens for grading:** 512 (intentionally low — prevents verbose LLM responses).

---

## 13. Adaptive Study Plan Generator

**Implementation:** `app/services/study_plan_generator.py` → `StudyPlanGenerator`

### 13.1 Two-Level Plan Architecture

**Level 1 — Course-Wide Ordering:** The LLM receives the full knowledge graph structure (nodes + edges) and outputs a topologically-sorted list of `{node_id, order, prerequisites}`. The backend then wraps each topic with auto-generated exercises and document references.

**Level 2 — Per-Topic Deep Dive:** For individual topics, a separate prompt generates a structured learning path with step types: `concept_overview`, `guided_reading`, `practical_example`, `hands_on_practice`, `connections`, `review`. Includes exercises (≥3), self-check questions (≥3), and estimated time per step.

### 13.2 Graph Structure Formatting

The graph is serialized into a compact text format to minimize token usage:
```
- node_abc123|Machine Learning|Supervised and unsupervised le...
- node_def456|Neural Networks|Artificial neural network archi...

Relations:
- node_abc123->node_def456|prerequisite_for
```

Edge count is capped at 20 to prevent context overflow.

### 13.3 JSON Recovery Strategies

The `_extract_json()` method implements five sequential fallback strategies:

1. **Regex strip:** Remove `<thought>` blocks and markdown fences.
2. **Brace extraction:** Find first `{` and last `}`.
3. **Key repair:** Fix malformed `{"node_xyz",` patterns → `{"node_id":"node_xyz",`.
4. **Duplicate deduplication:** Walk the topics array line-by-line, tracking seen `node_id` values and dropping duplicates.
5. **Line trimming:** Progressively remove trailing lines until `json.loads()` succeeds.

### 13.4 Fallback Plan

If all LLM attempts fail, the system generates a deterministic fallback plan directly from the graph structure — ordering nodes by their index position and deriving prerequisites from edge data.

---

## 14. Behavioral Analytics Data Warehouse

### 14.1 Event Capture — The Analytics Middleware

**Implementation:** `app/middleware/analytics.py` → `AnalyticsMiddleware`

The middleware wraps every HTTP request as a Starlette `BaseHTTPMiddleware`:

- **Tracked Paths:** Any request to `/api/`, `/auth/`, `/sessions/`, `/graph/`, `/documents/`, `/courses/`, `/chat`.
- **Excluded:** `/health`, `/docs`, `/openapi.json`, `OPTIONS` preflight requests.
- **Latency Measurement:** `time.time()` delta between request receipt and response dispatch.
- **User Resolution:** Reads `request.state.user_id` and `request.state.user_role` (set by auth dependency).
- **Security:** Query parameters containing `"token"` or `"password"` are sanitized to `"***"`.
- **Non-Blocking:** Events are inserted via `asyncio.create_task(event.insert())` — the response is never delayed by analytics writes.
- **Fault Isolation:** All analytics operations are wrapped in `try/except: pass` — analytics failures never break the application.

### 14.2 Aggregation Pipeline — Daily Rollups

**Task:** `analytics.compute_daily_aggregates` (runs every 24 hours)

Executes four MongoDB aggregation pipelines against the `analytics_events` collection:

**Pipeline 1 — User Daily:**
```javascript
$match:   { timestamp: {$gte: day_start, $lt: day_end}, user_id: {$ne: null} }
$group:   {
    _id: { user_id, user_role },
    sessions_count:  $sum($cond: event_type == "session_started"),
    questions_asked: $sum($cond: event_type == "question_asked"),
    nodes_visited:   $sum($cond: event_type == "node_visited"),
    unique_nodes:    $addToSet("$node_id"),
    course_ids:      $addToSet("$course_id"),
    graph_ids:       $addToSet("$graph_id"),
    hours_active:    $addToSet($hour("$timestamp"))
}
$project: { unique_nodes_count: $size($setUnion(unique_nodes)), ... }
```

**Pipeline 2 — Course Daily:** Groups by `course_id`, counts unique students, sessions, questions, nodes, documents uploaded, graphs generated.

**Pipeline 3 — Node Daily:** Groups by `(graph_id, node_id)`, counts visits, revisits, questions, unique students.

**Pipeline 4 — Global Daily:** Ungrouped aggregate across all events: total events, unique users, sessions, questions, nodes visited, documents, graphs, LLM calls, RAG queries, errors.

All results are upserted (idempotent — safe to re-run for the same date).

### 14.3 The Confusion Score Formula

**Implementation:** `app/services/analytics.py` → `_compute_derived_metrics()` AND `app/tasks/analytics_aggregation.py` → `update_node_metrics()`

For each concept node $n$:

$$\mu_{confusion}(n) = 0.4 \cdot R_{revisit} + 0.3 \cdot T_{norm} + 0.3 \cdot Q_{norm}$$

Where:

$$R_{revisit} = \min\left(\frac{\text{total\_visits} - \text{unique\_students}}{\text{total\_visits}}, 1.0\right)$$

$$T_{norm} = \min\left(\frac{\text{avg\_dwell\_time\_sec}}{300}, 1.0\right)$$

$$Q_{norm} = \min\left(\frac{\text{total\_questions} / \text{unique\_students}}{5}, 1.0\right)$$

| Component | Weight | Interpretation | Saturation Ceiling |
|:---|:---|:---|:---|
| **Revisit Rate** ($R_{revisit}$) | 0.4 | Students returning to the same node repeatedly indicates conceptual loops | 1.0 (100% revisit rate) |
| **Dwell Time** ($T_{norm}$) | 0.3 | Extended time on a node suggests difficulty processing the material | 300 seconds (5 min) |
| **Question Density** ($Q_{norm}$) | 0.3 | High question volume per student on a single node indicates confusion | 5 questions per student |

**Interpretation Scale:**
- $\mu < 0.3$: Low confusion — students are progressing normally.
- $0.3 \leq \mu < 0.6$: Moderate confusion — concept may benefit from supplementary material.
- $\mu \geq 0.6$: High confusion — professor should intervene or restructure the content.

### 14.4 User Profile Computation

**Task:** `analytics.update_user_profiles` (runs every 25 hours)

For each user with analytics events:

1. **Lifetime Stats:** MongoDB aggregation computes total sessions, questions, nodes, unique graphs/courses, first/last session dates, active dates set.

2. **Study Streak:** Active dates are sorted, then a backward walk from today counts consecutive days present.

3. **Average Session Duration:** Computed from `session_ended` events containing `payload.durationMs` (milliseconds → seconds).

4. **Preferred Study Time:** The hour with the highest event count determines the time slot:
   - 06:00–11:59 → `morning`
   - 12:00–16:59 → `afternoon`
   - 17:00–20:59 → `evening`
   - 21:00–05:59 → `night`

5. **Learning Style Classification:**
   - Count `node_revisited` events vs total navigation events.
   - If `revisit_ratio > 0.3` → `"exploratory"` (non-linear navigation).
   - If `revisit_ratio ≤ 0.3` → `"linear"` (sequential graph traversal).

6. **Engagement Level:**
   - `total_sessions ≥ 10` AND `days_inactive ≤ 3` → `"high"`
   - `total_sessions ≥ 3` → `"medium"`
   - Otherwise → `"low"`

7. **Knowledge Coverage:**
   $$K_{coverage} = \frac{|\text{unique\_nodes\_visited}|}{|\text{unique\_graphs}| \times 20}$$
   (Assumes ~20 nodes per graph as a baseline estimate, capped at 1.0.)

### 14.5 Dropout Risk Detection

**Task:** `analytics.detect_dropout_risk` (runs weekly)

| Risk Level | Condition |
|:---|:---|
| **High** ($\gamma_{high}$) | `days_inactive > 14` |
| **Medium** ($\gamma_{med}$) | `days_inactive > 7` OR (`total_sessions < 3` AND `days_inactive > 3`) |
| **Low** ($\gamma_{low}$) | All other cases |

When a student is flagged as `"high"` risk, `performance_indicators.flagged_for_dropout` is set to `true` in their profile — surfacing the alert to the professor dashboard.

---

## 15. Celery Task Orchestration & Beat Scheduling

**Implementation:** `app/core/celery_app.py`

### 15.1 Worker Configuration

```python
celery_app = Celery("cobble_worker",
    broker=settings.REDIS_URL,                    # redis://localhost:6379/0
    backend=settings.REDIS_URL.replace("0", "1")  # redis://localhost:6379/1
)
```

| Setting | Value |
|:---|:---|
| `task_serializer` | `json` |
| `task_soft_time_limit` | 300 seconds (5 min) |
| `task_time_limit` | 360 seconds (6 min hard kill) |
| `task_max_retries` | 3 |
| `timezone` | UTC |

### 15.2 Beat Schedule

| Task | Interval | TTL (expires) | Purpose |
|:---|:---|:---|:---|
| `analytics.compute_daily_aggregates` | Every 24h | 2 hours | Roll up raw events into daily summaries |
| `analytics.update_user_profiles` | Every 25h | 2 hours | Recompute per-user lifetime stats & risk indicators |
| `analytics.update_node_metrics` | Every 6h | 1 hour | Recompute per-node confusion scores & visit distributions |
| `analytics.detect_dropout_risk` | Every 7 days | 4 hours | Flag at-risk students |

**Note on 25h interval for user profiles:** This intentionally drifts relative to the 24h daily aggregation, ensuring user profiles are always computed against the most recently completed daily rollup rather than running concurrently.

### 15.3 Worker Process Initialization

On `worker_process_init` signal, each Celery worker process initializes Beanie ODM with all 16 document models:

```python
User, Course, Enrolment, CourseInvite,
DocumentModel,
KnowledgeGraph, StudySession, ChatMessage,
StudyPlan, StudyProgress, TopicStudyPlan,
Test, TestAttempt, MockTest, TestAnalytics,
AnalyticsEvent, AnalyticsAggregate,
AnalyticsUserProfile, AnalyticsNodeMetrics,
AnalyticsLLMUsage, AnalyticsRAGPerformance
```

This prevents connection pool exhaustion and race conditions that would occur if `init_beanie` were called inside every task body.

---

## 16. API Layer, Middleware & Security

### 16.1 FastAPI Application Lifecycle

**Entry point:** `app/main.py` → `app = FastAPI(lifespan=lifespan)`

The `lifespan` async context manager handles:
- **Startup:** `connect_to_mongo()`, `ensure_bucket_exists()` (MinIO)
- **Shutdown:** `close_mongo_connection()`

### 16.2 Registered Routers

| Router | Prefix | Purpose |
|:---|:---|:---|
| `auth.auth_router` | `/auth/jwt` | Login, token refresh |
| `auth.register_router` | `/auth` | Registration |
| `auth.users_router` | `/users` | User profile CRUD |
| `courses.router` | `/api/courses` | Course management |
| `documents.router` | `/api/documents` | Upload and processing |
| `chat.router` | `/api/chat` | Standalone chat |
| `graphs.router` | `/api/graphs` | Knowledge graph CRUD |
| `sessions.router` | `/api/sessions` | Study session + tutoring |
| `analytics.router` | `/api/analytics` | Analytics dashboard data |
| `study_plans.router` | `/api/study-plans` | Study plan generation |
| `tests.router` | `/api/tests` | Test generation + evaluation |

### 16.3 CORS Configuration

```python
allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
               "http://localhost:5174", "http://127.0.0.1:5174"]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```

### 16.4 Rate Limiting

Implemented via `slowapi` with a rate limiter attached to `app.state.limiter`. Exceeded limits return HTTP 429 with appropriate `Retry-After` headers.

### 16.5 Legacy URL Redirects

A middleware catches requests to `/api/api/...` (double-prefix bug from frontend) and issues a HTTP 307 redirect to `/api/...`.

### 16.6 Authentication

**Library:** `fastapi-users` with Beanie backend
**Algorithm:** RS256 (asymmetric RSA signing)
**Key Storage:** PEM-encoded keys in `.env` (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`)
**Roles:** `"student"` | `"professor"` — enforced at the route dependency level

---

*End of Specification.*
