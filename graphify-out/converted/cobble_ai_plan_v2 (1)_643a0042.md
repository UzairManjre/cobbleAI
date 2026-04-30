<!-- converted from cobble_ai_plan_v2 (1).docx -->




COBBLE AI
Technical Architecture & Development Plan
v2.0  —  Redesigned & Production-Ready












# Table of Contents

# 0. Architecture Overview
Cobble AI is an AI-powered edtech platform that enables professors to upload course materials and students to study through Socratic dialogue, auto-generated quizzes, and an interactive concept map. The system is built around a RAG (Retrieval-Augmented Generation) pipeline backed by a fine-tuned Qwen3.5-2B model.

## 0.1 Core Design Principles
Two principles govern every architectural decision in this plan:
- High Cohesion: each module has exactly one well-defined responsibility. A module that parses PDFs does not talk to the database. A module that serves HTTP does not run embedding inference.
- Low Coupling: modules communicate only through defined interfaces — HTTP REST endpoints, Celery task signatures, or the repository pattern. No module imports the internals of another.

## 0.2 Corrected Technology Stack



# 1. Authentication & Authorisation

## 1.1 Auth Strategy
Use FastAPI-Users with JWT access tokens (RS256 asymmetric signing). Short-lived access tokens (15 min) with long-lived refresh tokens (7 days) stored in httpOnly cookies. Two roles: professor and student.

## 1.2 Endpoints

## 1.3 Route Protection Pattern
Every protected route uses a FastAPI dependency. Role enforcement is done at the dependency level, never inside business logic:
current_user = Depends(get_current_active_user)          # any authenticated user
professor    = Depends(require_role("professor"))         # professor only
student      = Depends(require_role("student"))           # student only

## 1.4 Course Enrolment (Replacing invite_link)
The original plan used a bare invite_link field with no revocation. Replaced with a proper enrolment model:
- Professors generate a time-limited invite code (UUID, expires in 48 h, stored in Redis).
- Students POST the code to /courses/{course_id}/join. On success, an Enrolment record is created.
- Professors can revoke individual enrolments. The invite code is single-use-per-student.
- All course data access is gated: the student must have an active Enrolment row for that course_id.


# 2. Data Layer (MongoDB Schemas)

## 2.1 Repository Pattern
No route handler ever writes a raw PyMongo / Motor query. All DB access goes through a repository class. Example:
class ChatRepository:
async def get_history(self, session_id: str, limit: int = 20)
async def append_turn(self, session_id: str, turn: ChatTurn)
async def prune_session(self, session_id: str, keep: int = 40)

## 2.2 Collection: users

## 2.3 Collection: courses

## 2.4 Collection: enrolments

## 2.5 Collection: documents

## 2.6 Collection: chat_sessions


### ChatTurn sub-document schema

### History window eviction strategy
The history window is bounded to prevent unbounded token growth:
- Hard cap: 40 turns per session (20 exchanges). On turn 41, the oldest 10 turns are pruned and archived to a cold_chat_archive collection.
- Token cap: if token_count exceeds 6000 tokens, the oldest turns are pruned until under the limit, regardless of turn count.
- The pruning is done in the ChatRepository.prune_session() method, called after every append_turn().


# 3. Document Ingestion Pipeline (RAG)

## 3.1 Why Not HDFS / Airflow / Spark
HDFS requires a full Hadoop cluster. Airflow is a DAG scheduler for multi-stage batch workflows with dependencies between jobs. Spark is a distributed data processing engine for terabyte-scale analytics. We are parsing course PDFs that are at most tens of megabytes. The correct tools are:
- File Storage: S3-compatible object store — MinIO for local dev, AWS S3 for production.
- Task Queue: Celery with Redis as broker and result backend.
- Workers: Standard Python worker processes. No distributed compute cluster needed.

## 3.2 Upload Gateway
Route: POST /documents/upload (professor only, authenticated)
- Validates file type (PDF, PPTX, DOCX) and size (max 50 MB).
- Streams file directly to S3 using a pre-signed upload URL or server-side boto3 upload.
- Creates a Document record in MongoDB with status = "pending".
- Enqueues a Celery task: process_document.delay(doc_id) and returns immediately with 202 Accepted.
- The route NEVER reads the file content. It is a gateway only.

## 3.3 Celery Worker Pipeline
The worker picks up process_document(doc_id), fetches the document record, downloads the file from S3, and runs the following stages in sequence:

### Stage 1 — Text & Layout Extraction
- PDF: use pdfplumber. Extract text per page, preserving reading order. Detect and flag image-heavy pages (where text char count < 200) for separate handling.
- PPTX: use python-pptx. Extract text per slide in order: title → body → speaker notes.
- DOCX: use python-docx. Extract paragraphs and table cells in document order.
- Image-heavy slides/pages: extract the embedded images and store their S3 paths. These are embedded as image context in the chunk metadata for future multimodal retrieval.

### Stage 2 — Semantic Chunking with Overlap

- Split by sentence boundary first (use nltk.sent_tokenize), never mid-sentence.
- Target chunk size: 400 tokens (not 512 — leaves headroom for the overlap).
- Sliding window overlap: 80 tokens (20% of chunk size). Each chunk shares its last 80 tokens with the start of the next chunk.
- Minimum chunk size: 100 tokens. Chunks shorter than this are merged with the next chunk.
- Each chunk stores: chunk_id, doc_id, course_id, page_or_slide_number, char_start, char_end, text, has_image (bool), image_s3_key (str | null).

### Stage 3 — Embedding
- Model: sentence-transformers/all-MiniLM-L6-v2 for text chunks. Fast, small (80MB), strong performance for semantic similarity.
- Limitation acknowledged: this is a text-only embedding model. For image-heavy slides, the chunk text will be sparse. If the fine-tuned Qwen3.5-2B is a vision model, the roadmap is to replace this with a CLIP-family multimodal embedder. For v1, flag image-heavy chunks in metadata so the retriever can deprioritise them.
- Batch size: 32. Embed all chunks from a document in batches.
- Push vectors to Qdrant collection named course_{course_id} with full chunk payload stored alongside the vector.

### Stage 4 — Status Update & Notification
- On success: update Document.processing_status = "ready", Document.chunk_count = N.
- On failure: update Document.processing_status = "failed", Document.error_message = str(e). Log the full traceback.
- Notification: the FastAPI server exposes a WebSocket endpoint (/ws/documents/{course_id}). On status change, publish a message to a Redis pub/sub channel. The WebSocket server forwards this to connected professor clients in real time — no polling required.

## 3.4 Celery Configuration
CELERY_BROKER_URL      = "redis://redis:6379/0"
CELERY_RESULT_BACKEND  = "redis://redis:6379/1"
CELERY_TASK_SOFT_LIMIT = 300   # 5 min soft timeout
CELERY_TASK_TIME_LIMIT = 360   # 6 min hard timeout
CELERY_MAX_RETRIES     = 3
CELERY_RETRY_BACKOFF   = True  # exponential: 2s, 4s, 8s


# 4. Inference Layer (LLM Adapter)

## 4.1 Model
Base model: Qwen/Qwen3.5-2B (HuggingFace, Apache 2.0 license). The fine-tuning target is an instruction-following checkpoint trained on edtech dialogue data (Socratic Q&A pairs, quiz generation, concept explanation). Fine-tuning is a separate workstream — the inference layer is designed to be model-agnostic at the interface level.

## 4.2 Dev vs Production Serving

Because both Ollama and vLLM expose the same OpenAI-compatible chat completions API, the adapter genuinely can switch between them by changing one environment variable (LLM_BASE_URL). This is the actual valid decoupling — not a claim that the weights are interchangeable.

## 4.3 FastAPI Adapter Implementation
The adapter is a single service class. The rest of the application calls only generate_response(). No other module knows what model is behind it.
class LLMAdapter:
def __init__(self, base_url: str, model: str, timeout: int = 30):
self.client = AsyncOpenAI(base_url=base_url, api_key="na")
self.model = model

async def generate_response(
self, system: str, messages: list[dict], max_tokens: int = 512,
stream: bool = True
) -> AsyncIterator[str]: ...

## 4.4 Rate Limiting on Inference
Applied at the FastAPI layer using slowapi before the request ever reaches the LLM adapter:
- Per-user limit: 20 requests / minute on /chat endpoints.
- Per-course limit: 100 requests / minute across all students in a course.
- Queue depth guard: if the Celery queue depth exceeds 50 pending tasks, the /upload endpoint returns 503 with a Retry-After header.


# 5. Core Orchestration — /chat Route

## 5.1 Request Flow
The /chat endpoint is the central orchestrator. It calls other modules through their defined interfaces — never bypassing them. Here is the exact sequence:


## 5.2 Reranker — Why It Is Not Optional

The cross-encoder reranker (cross-encoder/ms-marco-MiniLM-L-6-v2) scores each (query, chunk) pair jointly, not independently. This is far more accurate than cosine similarity but too slow to run on all vectors — hence the two-stage retrieve-then-rerank design: vector search for recall, cross-encoder for precision.

## 5.3 Prompt Templates (Per Mode)

### Teach Mode — Socratic Prompt
- Rule 1: Never state the answer directly in the first response. Ask a guiding question instead.
- Rule 2: If the student's answer is wrong, acknowledge what is correct in their reasoning before redirecting.
- Rule 3: After 3 exchanges on the same concept, you may summarise the correct explanation.
- Rule 4: If you cannot answer from the provided course material, say exactly: "This topic is not in your course materials."
- Rule 5: Do not introduce examples or analogies not present in the course material.
- Prompt injects: system rules + RAG chunks (top-3, labeled by source) + last 10 turns of history + user message.

### Test Mode — Quiz Generation Prompt
Output must be valid JSON conforming to this schema. No markdown, no preamble, no trailing text:
{ "questions": [
{ "id": "q1",
"type": "mcq" | "short_answer" | "true_false",
"question": "...",
"options": ["A","B","C","D"],   // mcq only
"correct": "A",                 // mcq: option key; short: model answer
"explanation": "...",
"source_chunk_id": "..."        // for auditability
}
]
}
The route validates the LLM output against this Pydantic schema before returning to the client. Malformed output triggers a retry (max 2 retries) with an explicit correction prompt.

### Review Mode — Concept Map Generation Prompt

The concept map is generated in two stages:
- Stage 1 (ingest-time, per document): When a document finishes ingestion, a separate Celery task extract_concept_graph.delay(doc_id) runs. The LLM is prompted with the full document text (chunked into sections) to extract entities and relationships. Output is a partial graph JSON stored on the Document record.
- Stage 2 (request-time, per course): GET /courses/{course_id}/concept-map merges all per-document partial graphs into one unified graph for the course. Deduplication is done by entity name normalisation (lowercase + strip). This merged graph is cached in Redis (TTL 1 hour) and invalidated when a new document finishes ingestion.
Output schema for the concept map:
{ "nodes": [{ "id": "n1", "label": "Dijkstra's Algorithm",
"type": "algorithm", "doc_ids": ["..."] }],
"edges": [{ "source": "n1", "target": "n2",
"relation": "uses", "weight": 0.8 }]
}


# 6. Frontend (React + Vite)

## 6.1 Architecture
- Framework: React 18 + Vite + TypeScript.
- State management: Zustand (lightweight, no Redux boilerplate).
- API client: axios with an interceptor that attaches the JWT and handles 401 → token refresh.
- SSE streaming: native EventSource API for chat response streaming.
- Concept map: React Flow (native, not a Streamlit wrapper). Nodes are draggable and clickable — clicking a node sends a chat query pre-filled with that concept.
- Styling: Tailwind CSS.

## 6.2 Key Pages

## 6.3 Real-time Document Processing Feedback
The frontend connects to the WebSocket endpoint /ws/documents/{course_id} after upload. The server sends status updates (pending → processing → ready / failed) as the Celery worker progresses. The UI shows an inline progress indicator on the document row — no polling, no page refresh.


# 7. Containerisation & Deployment

## 7.1 Docker Compose Services
Each service is isolated in its own container. Because of low coupling, each can be started, stopped, and tested independently:


## 7.2 Environment Variables
All secrets are environment variables — never hardcoded or committed to source control:
LLM_BASE_URL          = http://inference:11434/v1  # Ollama dev
LLM_MODEL             = qwen3.5-2b-instruct
JWT_PRIVATE_KEY       = <RS256 private key>
JWT_PUBLIC_KEY        = <RS256 public key>
MONGO_URI             = mongodb://mongo:27017/cobble
REDIS_URL             = redis://redis:6379/0
QDRANT_URL            = http://qdrant:6333
S3_ENDPOINT_URL       = http://minio:9000          # blank for AWS
S3_BUCKET             = cobble-documents
AWS_ACCESS_KEY_ID     = ...
AWS_SECRET_ACCESS_KEY = ...

## 7.3 Testing Strategy
High cohesion makes the system genuinely unit-testable — each module can be tested without starting the others:
- Unit tests: ChatRepository (mock Motor), LLMAdapter (mock OpenAI client), chunker (pure function), reranker (mock model).
- Integration tests: FastAPI routes with pytest-asyncio + httpx. Real MongoDB and Redis via testcontainers.
- RAG pipeline tests: upload a known PDF, assert that a specific question retrieves the correct chunk.
- Auth tests: assert that a student cannot access professor-only routes and cannot access a course they are not enrolled in.
- CI: GitHub Actions runs unit + integration tests on every PR. Docker images are built and pushed on merge to main.


# 8. Recommended Build Order


# 9. Known Limitations & Future Work

- Multimodal embeddings: MiniLM-L6-v2 is text-only. Image-heavy slides will have poor retrieval recall. Roadmap: replace with a CLIP-family embedder (e.g. jinaai/jina-clip-v2) once the fine-tuned model confirms it is a vision model.
- Concept map quality: LLM-extracted graphs will have noise. Deduplication by name normalisation is naive — "Dijkstra" and "Dijkstra's Algorithm" will not be merged automatically. Roadmap: entity linking with a lightweight NER model.
- Qdrant at scale: Qdrant runs as a single node here. For 10k+ documents, it needs replication configured. This is a config change, not an architecture change.
- Fine-tuning pipeline: not in scope for this plan. It is a separate workstream requiring dataset curation, training infrastructure, and evaluation benchmarks.
- Mobile: no mobile app in scope for v1. The React frontend is responsive but not a native app.

| WHY THIS STACK  Every technology choice below is justified by the scale of the problem. We are processing course PDFs and serving a classroom — not petabytes of logs. The stack is chosen to be correct, not impressive. |
| --- |
| Component | Technology |
| --- | --- |
| LLM Inference | Qwen3.5-2B (fine-tuned) via vLLM (prod) / Ollama+GGUF (dev) |
| API Layer | FastAPI + Pydantic v2 |
| Frontend | React (Vite) — NOT Streamlit |
| Concept Map | React Flow (native, no wrapper) |
| Auth | FastAPI-Users + JWT (RS256) |
| Task Queue | Celery + Redis (NOT Airflow, NOT Spark) |
| File Storage | S3-compatible (MinIO local, AWS S3 prod) — NOT HDFS |
| Vector DB | Qdrant (single binary, no cluster needed) |
| App Database | MongoDB (via Motor, async) |
| Cache / Queue Broker | Redis |
| Embeddings | all-MiniLM-L6-v2 (text) — see §3 for image caveat |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| Containerisation | Docker Compose (dev), Docker Swarm or K8s (prod) |
| Rate Limiting | slowapi (per-user, per-endpoint) |
| FIXED ISSUE  The original plan had zero authentication. Roles existed in the schema with no mechanism to enforce them. This module fixes that entirely. |
| --- |
| Endpoint | Description |
| --- | --- |
| POST /auth/register | Register with role selection (student / professor) |
| POST /auth/login | Returns access_token + sets refresh cookie |
| POST /auth/refresh | Rotates refresh token, issues new access token |
| POST /auth/logout | Clears refresh cookie, blacklists token in Redis |
| GET /auth/me | Returns current user profile |
| FIXED ISSUE  The original chat_sessions collection was defined as "rolling memory of user interactions" — one vague sentence. Every collection below has fully specified fields, types, and eviction strategies. |
| --- |
| Field | Type | Description |
| --- | --- | --- |
| _id | UUID | Primary key |
| email | str | Unique, indexed |
| hashed_password | str | bcrypt hash — never store plaintext |
| role | enum | "professor" | "student" |
| name | str | Display name |
| preferences | object | { language, theme, notifications_enabled } |
| created_at | datetime | UTC timestamp |
| is_active | bool | Soft-delete flag |
| Field | Type | Description |
| --- | --- | --- |
| _id | UUID | Primary key |
| professor_id | UUID | FK → users._id, indexed |
| title | str | Course name |
| syllabus_roadmap | object | Parsed topic graph { nodes[], edges[] } |
| created_at | datetime | UTC timestamp |
| is_archived | bool | Soft-delete flag |
| Field | Type | Description |
| --- | --- | --- |
| _id | UUID | Primary key |
| course_id | UUID | FK → courses._id, indexed |
| student_id | UUID | FK → users._id, indexed |
| joined_at | datetime | UTC timestamp |
| is_active | bool | Revocation flag — false = kicked |
| compound index | — | { course_id, student_id } unique — prevents duplicate joins |
| Field | Type | Description |
| --- | --- | --- |
| _id | UUID | Primary key |
| course_id | UUID | FK → courses._id, indexed |
| uploaded_by | UUID | FK → users._id (must be professor of course) |
| original_filename | str | Original file name |
| s3_key | str | S3 object key (not HDFS path) |
| processing_status | enum | "pending" | "processing" | "ready" | "failed" |
| chunk_count | int | Number of chunks pushed to Qdrant |
| error_message | str | null | Set on failure, null otherwise |
| created_at | datetime | UTC timestamp |
| FIXED ISSUE  The original plan had zero schema here. Below is the complete design including bounded history, per-mode storage, and explicit eviction strategy. |
| --- |
| Field | Type | Description |
| --- | --- | --- |
| _id | UUID | Primary key — also used as Qdrant session namespace |
| student_id | UUID | FK → users._id, indexed |
| course_id | UUID | FK → courses._id, indexed |
| mode | enum | "teach" | "test" | "review" |
| turns | array | Array of ChatTurn objects — max 40 entries (see below) |
| token_count | int | Running total of tokens in turns — used for window pruning |
| topic_focus | str | null | Current topic e.g. "Dijkstra's Algorithm" — set by LLM |
| created_at | datetime | UTC timestamp |
| last_active | datetime | Updated on each turn — used for TTL index |
| TTL index | — | sessions expire after 30 days of inactivity (MongoDB TTL index on last_active) |
| Field | Type | Description |
| --- | --- | --- |
| role | enum | "user" | "assistant" |
| content | str | Message text |
| rag_chunks_used | str[] | Qdrant chunk IDs that were injected — for auditability |
| timestamp | datetime | UTC timestamp |
| FIXED ISSUE  Original plan: HDFS, Airflow, Spark, flat 512-token chunks, no overlap, no reranking. This section replaces all of that with a correct, right-sized pipeline. |
| --- |
| FIXED ISSUE  Flat 512-token chunks with no overlap cause concepts that span chunk boundaries to be split and never retrieved. Fixed below. |
| --- |
| FIXED ISSUE  Original plan claimed Ollama and vLLM are interchangeable via an adapter. They are not — Ollama uses GGUF quantized weights; vLLM uses full-precision HuggingFace weights. The correct separation is documented below. |
| --- |
| Concern | Development (Ollama) |
| --- | --- |
| Environment | Dev (Ollama) |
| Weight format | GGUF (quantized, ~1.5 GB) |
| Conversion needed? | Yes: llama.cpp convert script |
| Throughput | Low (1 request at a time) |
| GPU requirement | CPU fallback possible |
| API format | OpenAI-compatible /v1/chat/completions |
| Step | Action |
| --- | --- |
| 1 | Authenticate: verify JWT, extract student_id and course_id. |
| 2 | Authorise: confirm student has an active Enrolment for this course. |
| 3 | Load history: call ChatRepository.get_history(session_id, limit=20). Returns last 20 turns. |
| 4 | Embed query: embed the user message using the same MiniLM model used at ingest time. |
| 5 | Retrieve: query Qdrant collection course_{course_id} with the query vector. Retrieve top-10 candidates. |
| 6 | Rerank: pass the query + top-10 candidates to the cross-encoder reranker. Keep top-3. |
| 7 | Build prompt: select system prompt template by mode. Inject: RAG chunks, chat history, user message. |
| 8 | Generate: call LLMAdapter.generate_response() with stream=True. |
| 9 | Stream: forward tokens to the client via Server-Sent Events (SSE) as they arrive. |
| 10 | Persist: after stream completes, append both the user turn and assistant turn to the session via ChatRepository. Run prune_session() if needed. |
| FIXED ISSUE  The original plan had no reranking step. Vector similarity search has high recall but low precision — it returns topically adjacent chunks that are not actually relevant to the question. Without reranking, the context window fills with noise and hallucination rates rise significantly. |
| --- |
| FIXED ISSUE  Original plan listed modes in six words: "Socratic rules", "JSON quiz generation rules". Below are the actual prompt designs. |
| --- |
| FIXED ISSUE  Original plan said the backend "returns a pristine JSON array of nodes and edges" with zero design on how that graph is generated. Fixed below. |
| --- |
| FIXED ISSUE  The original plan used Streamlit with a React Flow wrapper. Streamlit re-runs the entire Python script on every interaction — this causes unacceptable latency with a stateful React component like React Flow. The correct choice is a native React frontend from day one, which the plan already proposed migrating to anyway. |
| --- |
| Page | Description |
| --- | --- |
| /login, /register | Auth forms — role selection on register |
| /dashboard | Student: enrolled courses. Professor: courses they own. |
| /courses/:id | Course hub: documents list, upload (professor), student progress |
| /study/:courseId | Split-screen study lab: chat panel (left) + mode switcher (right) |
| /map/:courseId | Full-screen React Flow concept map for the course |
| /quiz/:courseId | Quiz mode — rendered from Test Mode JSON output |
| Service | Responsibility |
| --- | --- |
| frontend | Vite dev server (dev) / Nginx serving built assets (prod) |
| api | FastAPI app — HTTP routes, WebSocket, rate limiting |
| worker | Celery worker — document ingestion pipeline |
| inference | Ollama (dev) or vLLM (prod) — LLM serving |
| qdrant | Vector database — single binary, no cluster |
| mongo | MongoDB — application state |
| redis | Celery broker + result backend + pub/sub + rate limit counters + cache |
| minio | S3-compatible object storage for local dev (swap for AWS S3 in prod) |
| START HERE  Build in this order. Each step is independently deployable and testable before the next begins. Do not start Module 3 until Module 2 is tested. |
| --- |
| Sprint | Deliverable |
| --- | --- |
| Sprint 1 | Docker Compose skeleton. All services boot. Health checks pass. |
| Sprint 2 | Auth module complete. Register, login, refresh, route protection. Tests pass. |
| Sprint 3 | MongoDB schemas + repository layer. All CRUD ops tested with testcontainers. |
| Sprint 4 | Document upload → S3 → Celery worker → chunking → embedding → Qdrant. No LLM yet. |
| Sprint 5 | LLM adapter wired. Manual test: query a question, get a response from retrieved chunks. |
| Sprint 6 | /chat orchestrator complete. All three modes (Teach, Test, Review). Reranker integrated. |
| Sprint 7 | React frontend. Auth flow, dashboard, study lab with SSE streaming, React Flow map. |
| Sprint 8 | Rate limiting, WebSocket doc progress, enrolment system, end-to-end tests. |
| Sprint 9 | Fine-tuning pipeline (separate workstream). Swap in fine-tuned weights. Evaluate. |
| HONESTY  Every plan has gaps. These are the known ones — not hidden, not hand-waved. |
| --- |