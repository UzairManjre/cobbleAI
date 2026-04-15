# Critical Bug Fix Plan

**Goal:** Fix all 10 critical bugs identified in the audit report.
**Estimated effort:** 3–5 focused sessions
**Approach:** Fix in dependency order (auth first, then data flow, then UX)

---

## Fix #1: Require Auth on `/chat/` Endpoint

**Priority:** 🔴 Highest (security risk)
**Estimated time:** 5 minutes
**Dependencies:** None
**Risk:** Low

### Changes

#### File: `backend/app/api/chat.py`

**Line 35 — Change from optional to required auth**

Current:
```python
async def chat_interaction(
    request: Request,
    session_id: uuid.UUID,
    message: str,
    course_id: uuid.UUID | None = None,
    mode: str = "teach",
    user: User | None = Depends(fastapi_users.current_user(optional=True))
):
```

Replace with:
```python
from app.api.auth import current_active_user

async def chat_interaction(
    request: Request,
    session_id: uuid.UUID,
    message: str,
    course_id: uuid.UUID | None = None,
    mode: str = "teach",
    user: User = Depends(current_active_user)
):
```

**Lines 42–44 — Remove the fallback user logic**

Current:
```python
    user_id = user.id if user else uuid.UUID("00000000-0000-0000-0000-000000000000")
    user_role = user.role if user else "unknown"
```

Replace with:
```python
    user_id = user.id
    user_role = user.role
```

### Test
- Hit `/chat/` without a token → should get `401 Unauthorized`
- Hit `/chat/` with a valid token → should work as before

---

## Fix #2: Fix Hardcoded Session ID in Standalone Chat

**Priority:** 🔴 Highest (data corruption risk)
**Estimated time:** 10 minutes
**Dependencies:** None
**Risk:** Low

### Changes

#### File: `frontend/src/pages/Chat.tsx`

**After line 32 (where component state is declared), add session ID generation:**

```typescript
// Generate or restore session ID for this chat
const getOrCreateSessionId = (): string => {
  let sessionId = sessionStorage.getItem('chat_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('chat_session_id', sessionId);
  }
  return sessionId;
};
const sessionId = getOrCreateSessionId();
```

**Line 100 — Replace hardcoded UUID with generated session ID**

Current:
```typescript
      url.searchParams.append('session_id', '00000000-0000-0000-0000-000000000000');
```

Replace with:
```typescript
      url.searchParams.append('session_id', sessionId);
```

### Test
- Open `/chat?course=xxx` in two different browsers
- Verify each sends a different `session_id` in the URL
- Verify analytics events use the correct user ID (not the phantom UUID)

---

## Fix #5: Validate JWT Keys at Startup — Reject Defaults

**Priority:** 🔴 High (authentication security)
**Estimated time:** 15 minutes
**Dependencies:** None
**Risk:** Medium (will crash startup if keys are missing — this is intentional)

### Changes

#### File: `backend/app/main.py`

**Add validation at the top of the `lifespan` function, before `connect_to_mongo()`:**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Validate critical settings before starting ──
    from app.core.config import settings

    if settings.JWT_PRIVATE_KEY in ("temp_private_key", ""):
        raise RuntimeError(
            "JWT_PRIVATE_KEY is not configured. "
            "Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY in .env with RSA PEM keys. "
            "Run: python gen_keys.py to generate new keys."
        )

    if settings.JWT_PUBLIC_KEY in ("temp_public_key", ""):
        raise RuntimeError(
            "JWT_PUBLIC_KEY is not configured. "
            "Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY in .env with RSA PEM keys."
        )

    print("✅ JWT keys validated")

    # Startup: Connect to MongoDB, Redis, Qdrant here
    print("Starting up Cobble AI backend...")
    await connect_to_mongo()
    ...
```

#### File: `backend/.env`

Verify the `.env` file contains actual RSA PEM key content for:
```
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0B...\n-----END PUBLIC KEY-----
```

If not, run the key generation script:
```bash
cd backend
python gen_keys.py
```

Then copy the contents of `private.pem` and `public.pem` into `.env`.

### Test
- Temporarily set `JWT_PRIVATE_KEY=temp_private_key` in `.env`
- Start the backend → should crash with a clear error message
- Restore valid keys → should start normally

---

## Fix #6: Fix `docs_count=0` in Course List

**Priority:** 🔴 High (misleading UI)
**Estimated time:** 10 minutes
**Dependencies:** None
**Risk:** Low (adds one extra query per course)

### Changes

#### File: `backend/app/api/courses.py`

**Replace the `list_courses` function (lines 63–81):**

Current:
```python
@router.get("/", response_model=List[CourseRead])
async def list_courses(user: User = Depends(current_active_user)):
    if user.role == "professor":
        courses = await Course.find(Course.professor_id == user.id).to_list()
    else:
        enrolments = await Enrolment.find(Enrolment.student_id == user.id).to_list()
        course_ids = [e.course_id for e in enrolments]
        courses = await Course.find({"_id": {"$in": course_ids}}).to_list()

    return [
        CourseRead(
            id=c.id,
            professor_id=c.professor_id,
            title=c.title,
            code=c.code,
            created_at=c.created_at,
            docs_count=0,
            status="ready"
        ) for c in courses
    ]
```

Replace with:
```python
@router.get("/", response_model=List[CourseRead])
async def list_courses(user: User = Depends(current_active_user)):
    from app.models.document import DocumentModel

    if user.role == "professor":
        courses = await Course.find(Course.professor_id == user.id).to_list()
    else:
        enrolments = await Enrolment.find(Enrolment.student_id == user.id).to_list()
        course_ids = [e.course_id for e in enrolments]
        courses = await Course.find({"_id": {"$in": course_ids}}).to_list()

    result = []
    for c in courses:
        # Count documents for this course
        docs_count = await DocumentModel.find(
            DocumentModel.course_id == c.id
        ).count()

        result.append(CourseRead(
            id=c.id,
            professor_id=c.professor_id,
            title=c.title,
            code=c.code,
            created_at=c.created_at,
            docs_count=docs_count,
            status="ready"
        ))

    return result
```

### Test
- Upload 3 documents to a course
- Hit `GET /courses/` → should return `docs_count: 3`
- Delete a document → should return `docs_count: 2`

---

## Fix #7: Add Time Enforcement to Test Submission

**Priority:** 🔴 High (assessment integrity)
**Estimated time:** 15 minutes
**Dependencies:** None
**Risk:** Low

### Changes

#### File: `backend/app/api/tests.py`

**In the `submit_test` function, after retrieving the test (around line 310), add time validation:**

After this block:
```python
    # Get test
    test = await Test.get(attempt.test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
```

Add:
```python
    # ── Time enforcement ──
    time_taken = (datetime.utcnow() - attempt.started_at).total_seconds()
    grace_period = 120  # 2-minute grace period for network lag
    max_time = (test.duration_minutes * 60) + grace_period

    if time_taken > max_time:
        raise HTTPException(
            status_code=400,
            detail=f"Time limit exceeded. You took {int(time_taken // 60)} minutes but the limit was {test.duration_minutes} minutes."
        )
```

### Test
- Create a test with `duration_minutes=5`
- Start the test, wait 7 minutes, submit → should get `400` with time exceeded message
- Submit within 5 minutes → should succeed

---

## Fix #3 + #4: Move Document Processing to Celery + Fix Event Loop Issues

**Priority:** 🔴 High (data loss + silent failures)
**Estimated time:** 45 minutes
**Dependencies:** Celery worker must be running
**Risk:** Medium (changes core document flow)

### Changes

#### File: `backend/app/api/documents.py`

**Step 1 — Import the Celery task at the top:**

Add to imports (after line 11):
```python
from app.worker import process_document as celery_process_document
```

**Step 2 — Replace the async processing call (line 259):**

Current:
```python
    # Start processing all uploaded documents in background
    for doc_info in uploaded_docs:
        if doc_info["status"] == "processing":
            asyncio.create_task(_process_document_async(doc_info["id"]))
```

Replace with:
```python
    # Queue documents for Celery processing (durable across restarts)
    for doc_info in uploaded_docs:
        if doc_info["status"] == "processing":
            celery_process_document.delay(doc_info["id"])
            print(f"📤 Queued document {doc_info['id']} for Celery processing")
```

**Step 3 — Remove the inline processing functions (lines 71–271):**

Delete these functions entirely:
- `_process_document_sync(doc_id: str)` — lines 71–214
- `_process_document_async(doc_id: str)` — lines 253–271

These are now handled by the Celery worker.

**Step 4 — Update `process_all_pending` endpoint (lines 277–291):**

Current:
```python
@router.post("/process-all-pending")
async def process_all_pending(user: User = Depends(current_active_user)):
    """Manually trigger processing for all pending documents"""
    from app.worker import process_document

    pending_docs = await DocumentModel.find(
        DocumentModel.status == "pending"
    ).to_list()

    processed = []
    for doc in pending_docs:
        doc_id = str(doc.id)
        # Process in background thread
        asyncio.get_event_loop().run_in_executor(_executor, _process_document_sync, doc_id)
        processed.append({"id": doc_id, "filename": doc.filename})

    return {"message": f"Processing {len(processed)} documents", "documents": processed}
```

Replace with:
```python
@router.post("/process-all-pending")
async def process_all_pending(user: User = Depends(current_active_user)):
    """Manually trigger processing for all pending documents via Celery"""
    pending_docs = await DocumentModel.find(
        DocumentModel.status == "pending"
    ).to_list()

    queued = []
    for doc in pending_docs:
        doc_id = str(doc.id)
        celery_process_document.delay(doc_id)
        queued.append({"id": doc_id, "filename": doc.filename, "status": "queued"})

    return {
        "message": f"Queued {len(queued)} documents for processing",
        "documents": queued
    }
```

**Step 5 — Remove unused imports at the top:**

Remove these if no longer used:
```python
from concurrent.futures import ThreadPoolExecutor
_executor = ThreadPoolExecutor(max_workers=2)  # DELETE THIS LINE
```

Also remove from the S3 upload section (line 226):
```python
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, lambda: s3.put_object(
```

Replace with synchronous S3 upload in a simpler form (or keep `run_in_executor` but remove `_executor` reference):
```python
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: s3.put_object(
            Bucket=S3_BUCKET, Key=s3_key, Body=file_bytes))
```

#### File: `backend/app/api/graphs.py`

**In `generate_graph_from_docs` (lines 118–134), remove the synchronous document processing:**

Current block (lines 118–134):
```python
        pending_docs = await DocumentModel.find(
            DocumentModel.course_id == req.course_id,
            DocumentModel.status == "pending"
        ).to_list()

        if pending_docs:
            print(f"⏳ Found {len(pending_docs)} pending documents, processing them first...")

            # Process each pending document
            for doc in pending_docs:
                doc_id = str(doc.id)
                print(f"🔄 Processing: {doc.filename}")
                # Run processing in thread pool
                loop = asyncio.get_event_loop()
                from concurrent.futures import ThreadPoolExecutor
                executor = ThreadPoolExecutor(max_workers=1)
                await loop.run_in_executor(executor, _process_document_sync, doc_id)
                executor.shutdown(wait=False)

            print(f"✅ All documents processed")
```

Replace with:
```python
        pending_docs = await DocumentModel.find(
            DocumentModel.course_id == req.course_id,
            DocumentModel.status == "pending"
        ).to_list()

        if pending_docs:
            print(f"⏳ Found {len(pending_docs)} pending documents, queueing for Celery...")

            # Queue documents for Celery processing
            from app.worker import process_document as celery_process_document
            for doc in pending_docs:
                doc_id = str(doc.id)
                celery_process_document.delay(doc_id)
                print(f"📤 Queued: {doc.filename}")

            # Return immediately — documents will be processed asynchronously
            # The auto-trigger in documents.py will generate the graph when done
            return {
                "message": f"Queued {len(pending_docs)} documents for processing. Graph will be generated automatically when all documents are ready.",
                "queued_documents": len(pending_docs),
                "status": "queued"
            }
```

Also remove the import at the top:
```python
from app.api.documents import _process_document_sync  # DELETE THIS LINE
```

#### File: `backend/app/worker.py`

**Verify the Celery task handles graph generation after the last document.**

The current worker does NOT trigger graph generation. We need to add it.

After the successful processing block (around line 80), add:
```python
        # 7. Auto-trigger graph generation if this is the last pending document
        pending_count = await db["documents"].count_documents({
            "course_id": doc.get("course_id"),
            "status": "pending"
        })

        if pending_count == 0:
            print(f"🚀 All documents processed for course {doc.get('course_id')}, triggering graph generation...")
            # Queue graph generation as a Celery task
            from app.tasks import generate_course_graph
            generate_course_graph.delay(str(doc.get("course_id")))
```

#### File: `backend/app/tasks/__init__.py`

**Create a new Celery task for graph generation:**

```python
from app.core.celery_app import celery_app
import asyncio
import uuid

@celery_app.task(name="generate_course_graph", bind=True, max_retries=2)
def generate_course_graph(self, course_id_str: str):
    """Generate knowledge graph from all ready documents in a course."""
    try:
        from app.services.advanced_graph_generator import AdvancedGraphGenerator
        from motor.motor_asyncio import AsyncIOMotorClient
        from app.core.config import settings
        from datetime import datetime

        async def run():
            client = AsyncIOMotorClient(settings.MONGO_URI, uuidRepresentation="standard")
            db = client.get_default_database()

            try:
                course_uuid = uuid.UUID(course_id_str)

                generator = AdvancedGraphGenerator()
                graph_data = await generator.generate_from_course(course_id_str)

                if not graph_data["nodes"]:
                    print(f"⚠️ No graph nodes generated for course {course_id_str}")
                    return

                # Save to MongoDB
                from app.models.graph import KnowledgeGraph, StudySession
                from beanie import init_beanie
                from app.models.graph import KnowledgeGraph as KGModel

                # Re-init Beanie for this process
                await init_beanie(
                    database=client[settings.DATABASE_NAME],
                    document_models=[KGModel]
                )

                graph = KnowledgeGraph(
                    topic=f"Course Knowledge Graph (from {len(graph_data.get('_source_docs', []))} documents)",
                    course_id=course_uuid,
                    nodes=graph_data["nodes"],
                    edges=graph_data["edges"],
                    created_by=uuid.UUID("00000000-0000-0000-0000-000000000000")
                )
                await graph.insert()

                print(f"✅ Graph generated and saved: {len(graph_data['nodes'])} nodes, {len(graph_data['edges'])} edges")

            finally:
                client.close()

        asyncio.run(run())
    except Exception as e:
        print(f"❌ Graph generation failed: {e}")
        raise self.retry(exc=e)
```

### Test
- Upload a PDF → check Celery logs for `Queued document XXX for Celery processing`
- Kill and restart uvicorn mid-processing → document should resume (Celery retry)
- Upload multiple documents → graph should auto-generate after the last one finishes

---

## Fix #8: Make `generate_graph_from_docs` Non-Blocking

**Priority:** 🔴 High (request timeout)
**Estimated time:** 20 minutes
**Dependencies:** Fix #3 + #4 (Celery migration)
**Risk:** Low (already addressed in the changes above)

**Note:** This fix is already covered by the changes in Fix #3 + #4. The `generate_graph_from_docs` endpoint now returns immediately with a "queued" status instead of blocking.

### Additional: Add a Poll Endpoint for Graph Generation Status

#### File: `backend/app/api/graphs.py`

**Add a new endpoint to check graph generation status:**

```python
@router.get("/course/{course_id}/graph-status")
async def get_course_graph_status(
    course_id: uuid.UUID,
    user: User = Depends(current_active_user)
):
    """Check if a knowledge graph exists for this course, or if documents are still processing."""
    from app.models.document import DocumentModel
    from app.models.graph import KnowledgeGraph

    # Check for existing graph
    graph = await KnowledgeGraph.find_one(
        KnowledgeGraph.course_id == course_id
    ).sort(-KnowledgeGraph.created_at).first_or_none()

    if graph:
        return {
            "status": "ready",
            "graph_id": str(graph.id),
            "nodes_count": len(graph.nodes),
            "edges_count": len(graph.edges),
        }

    # Check for pending documents
    pending_count = await DocumentModel.find(
        DocumentModel.course_id == course_id,
        DocumentModel.status == "pending"
    ).count()

    processing_count = await DocumentModel.find(
        DocumentModel.course_id == course_id,
        DocumentModel.status == "processing"
    ).count()

    if pending_count > 0 or processing_count > 0:
        return {
            "status": "processing",
            "pending_documents": pending_count,
            "processing_documents": processing_count,
            "message": "Documents are being processed. Graph will be generated automatically."
        }

    return {
        "status": "no_documents",
        "message": "No documents found for this course. Upload documents first."
    }
```

### Test
- Call `/graph/course/{id}/graph-status` while documents are processing → should return `status: "processing"`
- Call after graph is generated → should return `status: "ready"` with graph details

---

## Fix #9: Fix Double Router Prefix on Study Plans and Tests

**Priority:** 🔴 Highest (entire features are broken)
**Estimated time:** 2 minutes
**Dependencies:** None
**Risk:** None

### Changes

#### File: `backend/app/api/study_plans.py`

**Line 14 — Remove the prefix:**

Current:
```python
router = APIRouter(prefix="/api/study-plans", tags=["study-plans"])
```

Replace with:
```python
router = APIRouter(tags=["study-plans"])
```

#### File: `backend/app/api/tests.py`

**Line 12 — Remove the prefix:**

Current:
```python
router = APIRouter(prefix="/api/tests", tags=["tests"])
```

Replace with:
```python
router = APIRouter(tags=["tests"])
```

### Test
- Hit `POST /api/study-plans/generate` → should work (was returning 404)
- Hit `POST /api/tests/create` → should work (was returning 404)
- Hit `GET /api/tests/course/{id}` → should work (was returning 404)

---

## Fix #10: Chat Stream Error Handling

**Priority:** 🔴 High (poor user experience)
**Estimated time:** 20 minutes
**Dependencies:** None
**Risk:** Low

### Changes

#### File: `frontend/src/pages/Chat.tsx`

**Replace the `handleSend` function's streaming block (lines 113–138):**

Current:
```typescript
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;

        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = assistantMessage;
          return newMessages;
        });
      }
```

Replace with:
```typescript
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let streamError: string | null = null;

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      try {
        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Check for error markers from backend
          if (chunk.startsWith('Error:')) {
            streamError = chunk.replace('Error: ', '').trim();
            break;
          }

          assistantMessage += chunk;

          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = assistantMessage;
            return newMessages;
          });
        }
      } catch (err) {
        streamError = 'Connection lost while streaming. Please try again.';
        console.error('Stream error:', err);
      }

      // If there was a stream error, update the last message
      if (streamError) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === 'assistant' && !lastMsg.content) {
            newMessages[newMessages.length - 1] = {
              role: 'assistant',
              content: `⚠️ ${streamError}`,
            };
          }
          return newMessages;
        });
      }
```

**Also add error handling for the fetch call itself (around line 108):**

Current:
```typescript
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch response');
      }
```

This is fine, but add a user-friendly error for auth failures:
```typescript
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session has expired. Please log in again.');
        }
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch response');
      }
```

### Test
- Start a chat, then stop the Ollama server mid-response → should show an error message instead of a frozen spinner
- Start a chat with an expired token → should show "session expired" message
- Normal chat flow → should work exactly as before

---

## Execution Order

| # | Fix | Why First? |
|---|-----|-----------|
| 1 | **#9 — Double Router Prefix** | 2-minute fix, unblocks 25% of features, zero risk |
| 2 | **#2 — Hardcoded Session ID** | Independent, quick fix, prevents data corruption |
| 3 | **#1 — Auth on /chat/** | Security fix, independent, 1-line change |
| 4 | **#5 — JWT Key Validation** | Security fix, independent, prevents silent misconfiguration |
| 5 | **#6 — docs_count=0** | Independent, quick fix, improves UX immediately |
| 6 | **#7 — Test Time Enforcement** | Independent, important for assessment integrity |
| 7 | **#10 — Chat Stream Error Handling** | Improves user experience, independent |
| 8 | **#8 — Non-Blocking Graph Generation** | Depends on #3 (partially), but the poll endpoint is independent |
| 9 | **#3 + #4 — Celery Migration** | Most complex, changes core flow, requires Celery worker running |

## Testing Strategy

After all fixes:

1. **Auth flow:** Signup → Login → Dashboard (verify JWT validation)
2. **Course flow:** Create course → Upload document → Verify docs_count > 0
3. **Document flow:** Upload PDF → Check Celery logs → Verify document becomes "ready"
4. **Graph flow:** Click "Generate from Documents" → Verify it returns "queued" immediately → Poll status → Verify graph appears
5. **Chat flow:** Open /chat → Send message → Verify unique session_id → Verify auth required → Test stream error
6. **Test flow:** Create test → Generate questions → Start test → Submit on time → Submit late (should fail)
7. **Study Plan flow:** Generate plan → View plan → Complete topic → Regenerate (all should work now)
