# CobbleAI — Full Codebase Audit Report

**Date:** 2026-04-13
**Auditor:** Qwen Code
**Scope:** Entire backend (Python/FastAPI) + frontend (React/TypeScript) codebase

---

## Table of Contents

1. [Critical Bugs (🔴)](#-critical-bugs)
2. [Half-Baked Features (🟠)](#-half-baked-features)
3. [Missing Table Stakes (🟡)](#-missing-table-stakes)
4. [UX Gaps (🔵)](#-ux-gaps)
5. [Summary Counts](#summary-counts)
6. [Top 5 Priority Fixes](#top-5-priority-fixes)
7. [Launch Readiness Assessment](#launch-readiness-assessment)

---

## 🔴 CRITICAL BUGS

---

### 1. Hardcoded Session ID in Standalone Chat — All Users Share One Session

- **Location:** `frontend/src/pages/Chat.tsx` line 100
- **What's wrong:** Every user who uses the standalone `/chat` page sends `session_id=00000000-0000-0000-0000-000000000000`. This means all chat messages from all users are mixed into one pseudo-session.
- **Customer impact:** All users share the same "session." Analytics events are all attributed to a phantom user. No isolation between conversations. If the backend ever persists these to `ChatMessage`, it would corrupt data across users.
- **Fix:** Generate a UUID per chat session on the client (`crypto.randomUUID()`) or have the backend create a session on first message. Each user should have their own session.

---

### 2. No Auth Guard on `/chat/` Endpoint — LLM Is Publicly Accessible

- **Location:** `backend/app/api/chat.py` line 35
- **What's wrong:** The chat endpoint allows unauthenticated users via `user: User | None = Depends(fastapi_users.current_user(optional=True))`. An unauthenticated request gets `user_id = UUID("00000000-0000-0000-0000-000000000000")` and `user_role = "unknown"`.
- **Customer impact:** The LLM is the most expensive resource in the system. Without auth, anyone on the network can hammer the endpoint, consuming unlimited LLM tokens, draining server resources, and potentially incurring costs.
- **Fix:** Change to `user: User = Depends(current_active_user)` (required auth). Remove the `optional=True` pattern.

---

### 3. Document Processing Uses `asyncio.create_task` — Tasks Lost on Restart

- **Location:** `backend/app/api/documents.py` line 259
- **What's wrong:** Documents are processed in background asyncio tasks tied to the HTTP request lifecycle (`asyncio.create_task(_process_document_async(...))`). If the uvicorn process restarts or the request is cancelled, the task is silently dropped. The document stays in "pending" forever. A Celery worker (`backend/app/worker.py`) is properly designed for this, but the upload route doesn't use it.
- **Customer impact:** Uploaded documents can get stuck in "pending" indefinitely with no user feedback. The professor thinks the upload succeeded but the document is never usable for RAG or graph generation.
- **Fix:** Replace `asyncio.create_task(_process_document_async(...))` with a Celery task call: `process_document.delay(str(doc_id))`. This ensures durability across restarts and leverages the existing retry logic (`max_retries=3`).

---

### 4. `_process_document_sync` Creates New Event Loop — Graph Generation May Silently Fail

- **Location:** `backend/app/api/documents.py` lines 82–83 (`loop = asyncio.new_event_loop()` + `loop.run_until_complete(process())`), and line 169 (`asyncio.create_task(_generate_graph_for_course(course_id))`)
- **What's wrong:** When `_process_document_sync` is called from within an existing event loop (via `run_in_executor`), it creates a new event loop and runs `process()`. Inside `process()`, `asyncio.create_task()` is called to trigger graph generation (line 169) — but `create_task` requires a running loop, and at that point the loop is about to close via `loop.run_until_complete(process())`.
- **Customer impact:** Auto graph generation after document processing may silently fail. The graph is never built even though documents processed successfully.
- **Fix:** Use `asyncio.run()` instead of `loop.run_until_complete()` for the entire `process()` coroutine. For the graph generation task, use `asyncio.ensure_future()` with proper loop management, or better yet, make graph generation a separate Celery task.

---

### 5. `auth.py` Uses Default/Temp JWT Keys — Authentication Trivially Bypassable

- **Location:** `backend/app/api/auth.py` lines 16–17; `backend/app/core/config.py` line 14
- **What's wrong:** `JWTStrategy` is configured with `algorithm="RS256"` (asymmetric) but `settings.JWT_PRIVATE_KEY` and `settings.JWT_PUBLIC_KEY` default to `"temp_private_key"` / `"temp_public_key"` in `config.py`. If the `.env` file doesn't override these with actual RSA PEM keys, JWT tokens are signed with a known literal string.
- **Customer impact:** Authentication is trivially bypassable if default keys are used. Any attacker can create a valid JWT with `{"sub": "any_user_id"}` and impersonate any user.
- **Fix:** Add startup validation in `main.py`'s `lifespan` function that rejects default/temp key values before starting the app. Also verify that `.env` values are actually being loaded (check `pydantic_settings` reads from the correct `.env` path — it uses `env_file = ".env"` relative to the working directory, which may not be `backend/`).

---

### 6. `list_courses` Returns `docs_count=0` Always — Hardcoded

- **Location:** `backend/app/api/courses.py` lines 76–81
- **What's wrong:** The `CourseRead` schema always returns `docs_count=0` (hardcoded literal). The actual document count is never queried from the database.
- **Customer impact:** The Dashboard (`Dashboard.tsx` line 117) shows "0 documents" for every course, misleading professors about their upload status and confusing students.
- **Fix:** Query the document count in the loop: `docs_count = await DocumentModel.find(DocumentModel.course_id == c.id).count()` and pass it to `CourseRead`.

---

### 7. Test Submit Endpoint Has No Time Enforcement

- **Location:** `backend/app/api/tests.py` lines 321–326
- **What's wrong:** The `submit_test` endpoint calculates `time_taken_seconds` from `started_at` to `submitted_at` but never checks if the student exceeded `test.duration_minutes`. A student can take unlimited time.
- **Customer impact:** Students can cheat by taking far longer than the allotted time, undermining the integrity of assessments.
- **Fix:** Add a check: if `time_taken_seconds > test.duration_minutes * 60 + grace_period`, reject the submission or flag it as late.

---

### 8. `generate_graph_from_docs` Processes Documents Synchronously — Blocks Request for Minutes

- **Location:** `backend/app/api/graphs.py` lines 118–134
- **What's wrong:** When `/graph/generate-from-docs` is called, it finds pending documents and processes them synchronously using `run_in_executor` with a fresh `ThreadPoolExecutor` per document. For multiple large documents, this blocks the HTTP request for minutes, likely hitting gateway timeouts (60s default on many proxies).
- **Customer impact:** The "Generate from Documents" button in StudyMode spins for minutes and often times out, making the user think the feature is broken even though processing may eventually complete.
- **Fix:** This endpoint should either (a) return immediately with a "processing" status and provide a poll endpoint, or (b) rely on the auto-trigger in `documents.py` (line 169) instead of duplicating the processing logic.

---

### 9. Double Router Prefix on Study Plans — ALL Endpoints Return 404

- **Location:** `backend/app/main.py` line 60 (`study_plans.router` registered with `prefix="/api/study-plans"`) vs `backend/app/api/study_plans.py` line 14 (router itself has `prefix="/api/study-plans"`)
- **What's wrong:** The router is registered in `main.py` with `prefix="/api/study-plans"`, and the router itself also has `prefix="/api/study-plans"`. This results in a double prefix: actual endpoint is `/api/study-plans/api/study-plans/generate`. But the frontend calls `/api/study-plans/generate` (e.g., `StudyPlan.tsx` line 127).
- **Customer impact:** All study plan API calls return 404. The Study Plan feature is completely broken — generating, viewing, completing, and deleting study plans all fail silently.
- **Fix:** Remove the `prefix="/api/study-plans"` from the router definition in `study_plans.py` line 14. The prefix is already applied in `main.py`.

---

### 10. Chat Stream Error Handling — Mid-Stream Failures Show No Error

- **Location:** `frontend/src/pages/Chat.tsx` lines 113–138; `backend/app/api/chat.py` lines 132–138
- **What's wrong:** The Chat page uses `fetch` + `response.body.getReader()` to stream. If the LLM connection drops mid-stream, the `reader.read()` loop exits but there's no error state displayed — the user sees a frozen typing indicator. The backend's `generate()` function catches exceptions and yields `f"Error: {str(e)}"`, but the frontend has no way to distinguish an error chunk from normal content.
- **Customer impact:** If the LLM connection drops mid-response, the user sees a frozen spinner with no error message and no way to retry.
- **Fix:** Add a `try/catch` around the `reader.read()` loop with an error state that displays a retry message. Prefix error chunks with a distinguishable marker (e.g., `<error>...</error>`) that the frontend can detect and render as an error toast.

---

## 🟠 HALF-BAKED FEATURES

---

### 1. Double Prefix on Tests Router — Same Bug as Study Plans

- **Location:** `backend/app/api/tests.py` line 12 (`prefix="/api/tests"`) + `backend/app/main.py` line 61 (`prefix="/api/tests"`)
- **What's wrong:** Same double-prefix bug as Study Plans. The actual endpoint URLs are `/api/tests/api/tests/...`. The frontend calls `/api/tests/...` which returns 404.
- **Customer impact:** The entire Tests feature (professor test creation, student test-taking, mock tests, grading, analytics) is unreachable. Students and professors cannot use the test system at all.
- **Fix:** Remove `prefix="/api/tests"` from `tests.py` line 12. The prefix is already applied in `main.py`.

---

### 2. Celery Worker Is Dead Code for Primary Upload Path

- **Location:** `backend/app/worker.py` (full file) vs `backend/app/api/documents.py` line 259
- **What's wrong:** A fully implemented Celery task `process_document` exists in `worker.py` with retries (`max_retries=3`), error handling, and proper async handling. But the upload route in `documents.py` uses `asyncio.create_task` with an inline function instead.
- **Customer impact:** Document processing is fragile and non-durable (see Critical bug #3). The retry logic in the Celery task is never utilized.
- **Fix:** Replace the inline async processing with `process_document.delay(str(doc_id))`. Remove the inline `_process_document_sync` and `_process_document_async` functions from `documents.py`.

---

### 3. Mode Parameter Ignored by TutorService

- **Location:** `frontend/src/pages/Chat.tsx` line 106 (sends `mode` param) vs `backend/app/api/chat.py` lines 78–82 (selects prompt) vs `backend/app/services/tutor.py` (uses its own hardcoded `TUTOR_SYSTEM_PROMPT`)
- **What's wrong:** The `/chat/` endpoint in `chat.py` does select a prompt template based on mode (lines 78–82), but the `/sessions/{id}/ask` endpoint (used by StudyMode's TutorChat) calls `TutorService.answer_question()` which uses its own hardcoded `TUTOR_SYSTEM_PROMPT` and completely ignores the mode parameter. The mode is never passed through to `TutorService`.
- **Customer impact:** Switching between Teach/Test/Review modes in StudyMode has no effect. Students always get the same Socratic tutor regardless of mode selection. The mode selector UI is misleading.
- **Fix:** Pass the `mode` parameter from the session or request to `TutorService.answer_question()` and select the prompt template there using the same `TEACH_MODE_SYSTEM` / `TEST_MODE_SYSTEM` / `REVIEW_MODE_SYSTEM` constants.

---

### 4. `process_all_pending` Fires and Forgets — No Completion Feedback

- **Location:** `backend/app/api/documents.py` lines 277–291
- **What's wrong:** The `/documents/process-all-pending` endpoint uses `run_in_executor` but doesn't `await` the results — it fires and forgets. It returns immediately with a list of "processing" documents but provides no way to check completion status.
- **Customer impact:** Professors click "Process All" and get no feedback on whether processing succeeded or failed.
- **Fix:** Either make this endpoint pollable (return a task ID and add a `/status/{task_id}` endpoint) or have it `await` all processing tasks and return results.

---

### 5. Professor Test Creation Has No Question Generation Configuration UI

- **Location:** `frontend/src/pages/ProfessorTests.tsx` (full file)
- **What's wrong:** The professor can create a test (title, description, dates) and separately click "Generate Questions." But the UI flow for generating questions is a single button that fires an LLM call with no configuration UI — no question count slider, no type selector, no topic filter. The backend endpoint `GenerateTestRequest` schema supports all these options but the frontend doesn't expose them.
- **Customer impact:** Professors have no control over what questions are generated. They get default questions with no ability to focus on specific topics or adjust difficulty.
- **Fix:** Add a modal/form before question generation that lets professors configure question count, types, difficulty distribution, and topic focus. Wire these values to the `GenerateTestRequest` body.

---

### 6. Analytics `trackPageViews` Is a No-Op Placeholder

- **Location:** `frontend/src/utils/analytics.ts` lines 99–102
- **What's wrong:** The function body is a comment saying "This is a no-op placeholder." Page views are supposedly tracked by a "PageViewTracker component that wraps routes" but no such component exists in `App.tsx`.
- **Customer impact:** No page view analytics are collected despite the analytics infrastructure being set up. Professors and admins cannot see engagement metrics.
- **Fix:** Either implement the `PageViewTracker` component and add it to `App.tsx` (using `useLocation` from React Router), or implement `trackPageViews` to set up a router listener that calls `analytics.track('page_view', { path })`.

---

### 7. Study Plan Generate/Regenerate Has Massive Code Duplication

- **Location:** `backend/app/api/study_plans.py` lines 34–124 (`/generate`) vs 161–256 (`/regenerate`)
- **What's wrong:** The regenerate endpoint is a near-copy-paste of the generate endpoint with an extra delete step. Any bug fix in one must be manually applied to the other.
- **Customer impact:** Maintenance burden. Inconsistencies between the two endpoints will cause subtle bugs over time.
- **Fix:** Extract the generation logic into a shared helper function `_generate_plan(course_uuid, graph_uuid, user)`. Have `/regenerate` call delete + the shared function.

---

### 8. `TakeTest.tsx` Navigates to Non-Existent Result Route After Submission

- **Location:** `frontend/src/pages/TakeTest.tsx` line 99
- **What's wrong:** After submitting a test, the code navigates to `/tests/${testId}/result/${attempt.id}`. No route for this path is defined in `App.tsx`.
- **Customer impact:** Students submit their test and are taken to a blank/404 page. They never see their results, scores, or feedback.
- **Fix:** Add a `TestResult` page component and route in `App.tsx` (e.g., `<Route path="/tests/:testId/result/:attemptId" element={<TestResult />} />`), or navigate to `/dashboard` with a success toast showing the score.

---

## 🟡 MISSING "TABLE STAKES"

---

### 1. No Input Validation on Course Title/Code

- **Location:** `backend/app/api/courses.py` lines 38–53; `backend/app/schemas/course.py` lines 6–8
- **What's wrong:** The `CourseCreate` schema only requires `title: str` and `code: str`. No length limits, no character restrictions, no uniqueness check on `code`.
- **Customer impact:** Courses with blank or absurdly long titles break the UI. Duplicate course codes confuse students joining courses.
- **Fix:** Add `Field(min_length=1, max_length=200)` constraints to the Pydantic schema. Add a uniqueness check on `code` per professor before creating.

---

### 2. No Rate Limiting on LLM-Heavy Endpoints

- **Location:** `backend/app/api/chat.py` has `@limiter.limit("20/minute")`; `backend/app/api/graphs.py` has NO limit; `backend/app/api/tests.py` has NO limit
- **What's wrong:** Only the `/chat/` endpoint has rate limiting. Graph generation and test generation call the LLM with no rate limiting. A single user could trigger hundreds of LLM calls by rapidly clicking "Generate Graph" or "Generate Questions."
- **Customer impact:** A single user can monopolize the LLM, causing latency spikes for all other users and potentially crashing the Ollama server.
- **Fix:** Add `@limiter.limit("5/minute")` to `/graph/generate`, `/graph/generate-from-docs`, `/api/tests/{id}/generate-questions`, and `/api/tests/mock/generate`.

---

### 3. No Confirmation Dialog for Deleting Study Plans

- **Location:** `backend/app/api/study_plans.py` lines 127–156 (DELETE `/active`); `frontend/src/pages/StudyPlan.tsx` (regenerate flow)
- **What's wrong:** The DELETE endpoint immediately deletes the study plan and all associated progress with no confirmation step. The frontend shows a "Regenerate" confirm dialog but deletion happens silently as a side effect.
- **Customer impact:** A professor accidentally clicks "Regenerate" and loses all student progress data with no warning and no undo.
- **Fix:** Add an explicit "Delete Study Plan" button with a confirmation modal that shows what will be lost (X topics, Y exercises, Z student progress records).

---

### 4. No Password Strength Validation on Signup

- **Location:** `frontend/src/pages/Signup.tsx` lines 91–98; `backend/app/api/auth.py` (uses fastapi-users default)
- **What's wrong:** The signup form accepts any password value. FastAPI Users has a default minimum length (typically 3+ characters), but there's no enforcement of password complexity.
- **Customer impact:** Students and professors can set trivially weak passwords, making accounts easy to compromise.
- **Fix:** Add frontend validation requiring 8+ characters with at least one uppercase and one number. Add a `PasswordValidator` on the backend `UserCreate` schema.

---

### 5. No Email Verification Flow

- **Location:** `backend/app/api/auth.py` (signup route); `frontend/src/pages/Signup.tsx`
- **What's wrong:** Users are logged in immediately after signup with no email verification. The `is_verified` field exists on the User model but is never checked or set.
- **Customer impact:** Anyone can sign up with a fake email and use the platform. Professors could create accounts with student emails and impersonate them.
- **Fix:** Implement email verification tokens (send a verification link on signup, block access until verified). For an MVP, at minimum validate email format and domain (e.g., require `.edu` email for students).

---

### 6. No Error Toast/Notification After Actions

- **Location:** Multiple — `CourseDetail.tsx` (upload, graph gen, invite), `Dashboard.tsx` (create/join course), `StudyPlan.tsx` (generate plan)
- **What's wrong:** Success/failure feedback uses `alert()` (blocking, ugly) or silent `console.error`. No toast notifications, no success states.
- **Customer impact:** Users get no clear feedback after uploading documents, generating graphs, creating courses, or generating study plans. They don't know if actions succeeded.
- **Fix:** Integrate a toast library (e.g., `sonner` or `react-hot-toast`) and show success/error toasts for all user actions. Replace all `alert()` calls with toast notifications.

---

### 7. No Pagination on Document/List Endpoints

- **Location:** `backend/app/api/documents.py` line 293 (`list_documents`)
- **What's wrong:** The endpoint returns all documents for a course with no limit. A course with hundreds of documents would return a massive payload.
- **Customer impact:** Slow page loads and potential memory issues for courses with many documents.
- **Fix:** Add `skip: int = 0` and `limit: int = 50` query parameters with a maximum limit of 100.

---

### 8. CORS Only Allows localhost — Breaks in Any Deployment

- **Location:** `backend/app/main.py` lines 33–34
- **What's wrong:** `allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"]` is hardcoded. If the frontend is deployed to any domain (Vercel, Netlify, production), all API calls will be blocked by CORS.
- **Customer impact:** The app works in local development but will completely break on any deployment.
- **Fix:** Move allowed origins to `settings` and load from `.env` as a comma-separated list. Support a `CORS_ORIGINS` environment variable.

---

### 9. No CSRF Protection on Form Submissions

- **Location:** All frontend forms (Signup, Login, Course creation, document upload, test submission)
- **What's wrong:** The API uses JWT bearer tokens (which are immune to CSRF when sent in headers), but the login endpoint uses `application/x-www-form-urlencoded` (Signup.tsx line 46, Login.tsx line 32) which sends the token in the body, not a header. This is fine for login but any future form that uses cookies would be vulnerable.
- **Customer impact:** Currently low risk because auth is JWT-in-header, but the login flow uses form-encoded data which could be a vector if the auth strategy changes.
- **Fix:** Document the current security posture. If switching to cookie-based sessions in the future, add CSRF tokens.

---

## 🔵 UX GAPS

---

### 1. No Empty State Guidance in StudyMode When No Graph Exists

- **Location:** `frontend/src/pages/StudyMode.tsx` lines 172–176
- **What's wrong:** If `!currentNodeId`, the page shows "No active session" with no guidance on what to do next. There's no link to generate a graph or go back to the course.
- **Customer impact:** Students who navigate to StudyMode before a graph is generated see a dead-end page with no navigation out.
- **Fix:** Add a "Generate Graph" button and a "Back to Course" link on the empty state.

---

### 2. No Loading Indicator on Document Upload

- **Location:** `frontend/src/pages/CourseDetail.tsx` lines 67–83
- **What's wrong:** The upload sets `isUploading` state, but the file input button text changes to "Uploading..." inline. There's no progress bar or spinner overlay. For large files (50MB max), this can take 10+ seconds with no visual feedback beyond small text.
- **Customer impact:** Professors click "Add Documents" and the UI appears frozen. They may click again, causing duplicate uploads.
- **Fix:** Show a full-width upload progress bar or a modal spinner with file names and progress percentage.

---

### 3. Mixed API URL Conventions — `127.0.0.1` vs `localhost`

- **Location:** `frontend/src/store/authStore.ts` line 30 (`localhost:8000`) vs `frontend/src/store/graphStore.ts` line 4 (`127.0.0.1:8000`) vs `frontend/src/pages/Chat.tsx` line 100 (`127.0.0.1:8000`)
- **What's wrong:** Different files use different base URLs for the API. While both resolve to the same machine, this creates confusion and potential CORS issues if the browser treats them differently.
- **Customer impact:** Inconsistent behavior across browsers. Some browsers may flag cross-origin requests between `localhost` and `127.0.0.1`.
- **Fix:** Define a single `API_URL` constant in one file (e.g., `frontend/src/config.ts`) and import it everywhere.

---

### 4. No Mobile Responsive Design

- **Location:** All pages — fixed pixel widths, no mobile breakpoints
- **What's wrong:** `StudyMode.tsx` uses `w-[380px]` for the right panel, `KnowledgeGraph.tsx` uses full-width React Flow with no mobile adjustments, `Dashboard.tsx` uses a fixed 260px sidebar. No viewport meta customization or responsive breakpoints are defined.
- **Customer impact:** The app is essentially unusable on phones and tablets. Students who try to study on mobile get a broken layout.
- **Fix:** Add responsive breakpoints in Tailwind config. Use `md:` and `lg:` prefixes for fixed widths. Stack panels vertically on mobile. Make the sidebar collapsible/overlay on small screens.

---

### 5. No Accessibility — Keyboard Navigation Broken on Graph

- **Location:** `frontend/src/components/graph/KnowledgeGraph.tsx` (React Flow canvas)
- **What's wrong:** React Flow nodes are clickable but not focusable via keyboard. There are no `tabIndex`, `role="button"`, or `onKeyDown` handlers.
- **Customer impact:** The core study feature (clicking nodes to navigate concepts) is completely inaccessible to keyboard-only and screen reader users.
- **Fix:** Add `tabIndex={0}`, `role="button"`, and keyboard event handlers to nodes. Provide an alternative list-based navigation view (the NodeInfo component's connected concepts list is already keyboard-navigable).

---

### 6. "Forgot Password" Link Goes Nowhere

- **Location:** `frontend/src/pages/Login.tsx` line 104 (`<Link to="#">`)
- **What's wrong:** The "forgot password?" link points to `#`, which does nothing. FastAPI Users has a password reset flow but no frontend page for it.
- **Customer impact:** Users who forget their password are locked out with no recovery path. They must contact support or create a new account.
- **Fix:** Either implement a password reset page using FastAPI Users' reset endpoints, or remove the link and show a "Contact your professor to reset your password" message.

---

### 7. Dashboard Sidebar Links Are Dead

- **Location:** `frontend/src/pages/Dashboard.tsx` lines 92–94
- **What's wrong:** The sidebar has "Analytics" and "Settings" links that are just `<div>` elements with no `onClick` handlers or navigation. They're visual placeholders.
- **Customer impact:** Users click "Analytics" or "Settings" expecting functionality and nothing happens. This creates frustration and erodes trust in the product.
- **Fix:** Either remove these links until the pages exist, or add "Coming Soon" tooltips/modals when clicked.

---

### 8. No Guided Onboarding Flow After Signup

- **Location:** `frontend/src/pages/ProfessorOnboarding.tsx` and `StudentOnboarding.tsx`
- **What's wrong:** After signup, users are redirected to `/onboarding/{role}`, but the onboarding pages only collect basic profile info (name, institution). There's no guided tour, no explanation of features, no "create your first course" or "join your first course" flow.
- **Customer impact:** New users land on a blank dashboard with no guidance. They don't know how to create a course, upload documents, or generate graphs.
- **Fix:** Add a step-by-step onboarding wizard: (1) Create first course, (2) Upload first document, (3) Generate first graph, (4) Enter Study Mode. Show a progress indicator.

---

## SUMMARY COUNTS

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 Critical | 10 | Runtime errors, security, data loss, broken APIs |
| 🟠 Half-Baked | 8 | Dead code, incomplete features, 404 routes |
| 🟡 Missing | 9 | Validation, rate limiting, auth guards, confirmations |
| 🔵 UX Gaps | 8 | Empty states, loading indicators, accessibility, mobile |
| **Total** | **35** | |

---

## TOP 5 PRIORITY FIXES

### 1. Fix Double Prefix on `/api/study-plans` and `/api/tests` Routers
**Impact:** Unblocks 25% of the product's features (Study Plans + Tests).
**Effort:** 2 minutes — remove the `prefix="..."` line from `study_plans.py` and `tests.py`.

### 2. Require Auth on `/chat/` Endpoint
**Impact:** Prevents unlimited free LLM access to anyone on the network.
**Effort:** 1 line change — change `optional=True` to required auth in `chat.py` line 35.

### 3. Move Document Processing to Celery
**Impact:** Fixes silent document loss, adds retry logic, makes processing durable across restarts.
**Effort:** Replace `asyncio.create_task(_process_document_async(...))` with `process_document.delay(str(doc_id))` in `documents.py`.

### 4. Fix `TakeTest.tsx` Result Route (404 After Submission)
**Impact:** Students submit tests and currently land on a 404 page.
**Effort:** Add a `TestResult` page + route in `App.tsx`, or redirect to `/dashboard` with a score toast.

### 5. Fix Hardcoded Session ID in `Chat.tsx`
**Impact:** Fixes analytics attribution, prevents data collision between users.
**Effort:** Replace the hardcoded UUID with `crypto.randomUUID()` on component mount.

---

## LAUNCH READINESS ASSESSMENT

### Verdict: **NOT LAUNCH-READY**

This is a **functional prototype** with impressive architectural choices — the RAG pipeline, knowledge graph generation, Socratic tutoring, and analytics infrastructure are all well-designed. However, there are **structural bugs that make core features completely unreachable**:

- **~25% of the product is broken** due to the double-prefix router bug (Study Plans and Tests).
- **Document processing is fragile** — uploads can silently fail with no recovery path.
- **The LLM endpoint is unauthenticated** — a production deployment would be immediately abused.
- **Students submitting tests see 404 pages.**
- **No mobile support whatsoever.**

### What's Well-Implemented

- The RAG retrieval pipeline (`rag.py` + `reranker.py`) is solid with proper fallback handling.
- The analytics service architecture (`analytics.py`) is well-designed with fire-and-forget tracking.
- The graph generation prompts in `advanced_graph_generator.py` show careful prompt engineering.
- The React Flow visualization with dagre layout is polished.
- The Zustand state management is clean and consistent.
- The document deduplication logic and the Celery worker design show good engineering judgment.
- The TutorService's RAG integration with source resolution is well-structured.

### Estimated Effort to Launch-Ready

**3–5 days of focused bug-fixing** (no new features required). The issues are well-understood and fixes are specific. The codebase doesn't need a rewrite — it needs surgical fixes to the issues listed above.

### Recommended Launch Checklist

- [ ] Fix double-prefix on study_plans.py and tests.py routers
- [ ] Require auth on /chat/ endpoint
- [ ] Move document processing to Celery
- [ ] Fix TakeTest result route (404 after submission)
- [ ] Fix hardcoded session ID in Chat.tsx
- [ ] Validate JWT keys are not defaults at startup
- [ ] Add rate limiting to graph generation and test generation endpoints
- [ ] Add toast notifications (replace all alert() calls)
- [ ] Add CORS origins from .env instead of hardcoded localhost
- [ ] Add password strength validation (8+ chars)
- [ ] Add mobile responsive breakpoints to StudyMode, Dashboard, CourseDetail
- [ ] Add empty state guidance to StudyMode when no graph exists
- [ ] Add confirmation dialog for destructive actions (delete study plan)
- [ ] Fix "Forgot Password" link (implement or remove)
- [ ] Remove or implement dead sidebar links (Analytics, Settings)
