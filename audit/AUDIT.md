# Multi-Stage Code Audit

This document collects findings from our multi-stage code audit, adapting the structure inspired by Architecture Decision Records (ADRs). As we progress through each stage, findings and necessary architectural decisions will be recorded here.

## Audit Stages

- [x] **Architecture**: Evaluating system design, component boundaries, and technology choices.
- [x] **Completeness**: Checking for missing features, unimplemented edge cases, and test coverage.
- [ ] **Security**: Identifying vulnerabilities, broken authentication, and data privacy risks.
- [ ] **Performance**: Analyzing bottlenecks, load times, and resource efficiency.
- [x] **Consistency**: Reviewing code style, UX/UI patterns, and naming conventions.

---

## Findings

### Stage 1: Architecture

**Findings:**
1. **Separation of Concerns & Layered Architecture**: The FastAPI backend has folders for `api/`, `services/`, and `repositories/`, implying a layered architecture. However, in practice, this structure is leaky. `CourseService` and others bypass the `repositories` layer entirely (which only contains a single unused `base.py`) and use `beanie` ORM models directly to query the database (e.g. `await Course.insert()`). This couples business logic directly to the ORM implementation.
2. **Celery Task Isolation**: Celery tasks (e.g. `process_document` in `worker.py`) are not properly isolated from request-response code. The task manually instantiates a raw MongoDB connection (`AsyncIOMotorClient`) and runs raw queries (e.g. `db["documents"].update_one`), bypassing both the service layer and `beanie` models. This duplicates database logic and creates maintenance risks.
3. **Frontend Dependencies**: The `designer_frontend` directory does not exist in the repository, so there are no circular or leaky dependencies between `frontend` and `designer_frontend`. The frontend architecture consists solely of the React application in `frontend/`.

**Recommendations:**
- Enforce the Repository pattern consistently to decouple Services from `beanie` ORM models.
- Refactor Celery workers to use the same Services/Repositories as the API, rather than writing raw Motor queries.

### Stage 2: Completeness

**Findings (Gaps & Stubs):**
1. **Unimplemented API Endpoints**: The frontend `api/tests.ts` defines methods for `generateMock` (`/tests/mock/generate`) and `submitMock` (`/tests/mock/{id}/submit`). However, these endpoints do not exist in `backend/app/api/student/tests.py`. Even though the backend includes models for `MockTest` and logic in `test_generator.py`, the routes are missing, leaving a broken feature.
2. **Frontend Logic Stubs**: In `frontend/src/pages/student/Dashboard.tsx` (Lines 122-124), the "Join Class" functionality for students is completely stubbed with a `// student logic` comment and executes no API calls, making the feature non-functional.
3. **Unimplemented Error Paths**: Widespread use of silent `pass` in `except` blocks across backend services (e.g., `analytics_service.py`, `tutor.py`, `test_service.py`, `test_generator.py`). This swallows exceptions silently without logging or error handling, creating brittle failure modes.

**Recommendations:**
- Implement the missing `/tests/mock/*` endpoints in the backend to match the frontend spec and utilize the existing `TestGenerator` logic.
- Complete the "Join Class" frontend logic by wiring it up to the `join_course` API.
- Replace all silent `pass` exception handlers with proper `logging.error(...)` and bubble up HTTPExceptions where the API should return an error.

### Stage 3: Security
*Pending audit...*

### Stage 4: Performance
*Pending audit...*

### Stage 5: Consistency

**Findings:**
1. **Backend Service Module Naming**: There is a split naming convention for service modules. Half the files use the `_service.py` suffix (e.g., `course_service.py`, `document_service.py`, `test_service.py`), while others omit it (e.g., `tutor.py`, `llm.py`, `rag.py`). This causes confusion, notably with both `analytics.py` (containing `AnalyticsService`) and `analytics_service.py` (containing `DashboardAnalyticsService`) existing simultaneously.
2. **Backend Class Naming**: Even when files omit the `_service.py` suffix, their classes retain it (e.g., `tutor.py` contains `TutorService`, `analytics.py` contains `AnalyticsService`).
3. **Frontend Component Divergence**: The student and professor views diverge significantly in component naming for the exact same conceptual resources:
   - Student Dashboard is `Dashboard.tsx`, but Professor Dashboard is `AnalyticsDashboard.tsx`.
   - Student Assignments are in `Assignments.tsx`, but the Professor view for creating/managing them is `ProfessorTests.tsx` (mixing the terminology "Assignments" vs "Tests").
4. **Frontend Architecture Divergence**: `Dashboard.tsx` bundles both student and professor views into one file using an `if (role === 'student') return ... else return ...` pattern. Conversely, other features split the views into distinct components (e.g., `MyClasses.tsx` for professors).
5. **Dead CSS Files**: Some frontend components have companion `.css` files (`Dashboard.css`, `MyClasses.css`, `Assignments.css`), while others do not (`StudyMode.tsx`). Since the UI now uses Tailwind CSS exclusively, these companion `.css` files are unimported dead code.
6. **designer_frontend**: As noted in Stage 1, the `designer_frontend/` directory does not exist, so it was excluded from this consistency audit.

**Recommendations:**
- Unify backend service naming to strictly use the `_service.py` suffix and merge overlapping domains (e.g., merge `analytics.py` and `analytics_service.py`).
- Align frontend component naming across roles (e.g., use `StudentDashboard.tsx` and `ProfessorDashboard.tsx`).
- Delete all unused companion `.css` files in `frontend/src/pages/` and `frontend/src/components/` to enforce the Tailwind-only pattern.

### Stage 6: Testing & Correctness Risks

**Findings:**
1. **Untested Critical Paths**: 
   - **RAG & Celery**: While there are full-system API tests (e.g., `test_system.py`, `test_graph_gen.py`), the core extraction and chunking pipeline (`worker.py`, `pdf_extractor.py`, `chunking.py`) lacks isolated unit tests.
   - **Auth**: The JWT-based authentication in `auth.py` and the frontend `useAuthStore.ts` do not have dedicated tests verifying token expiration, invalid signatures, or role-based access control (RBAC) bypass attempts.
2. **Fragile Logic - Empty Documents (Silent Failure)**: In `worker.py`, if a document yields empty text (e.g., an image-only PDF without OCR), `split_into_chunks` returns an empty array. The pipeline passes this to `embed_and_store` which upserts 0 chunks to Qdrant, and the worker marks the document as `ready` with `chunk_count=0`. This is a silent failure; the professor believes the document is ready, but students querying it will receive no context.
3. **Fragile Logic - Concurrent Student Sessions**: The `TestAttempt` model and testing flow lack concurrency controls. A student could open a test in two separate browser tabs. The frontend `TakeTest.tsx` auto-saves progress periodically. These concurrent auto-saves can race against each other, leading to older state overwriting newer state without versioning or conflict detection.

**Recommendations:**
- Introduce a suite of isolated unit tests using Pytest for the RAG chunking logic and Celery worker.
- Add an explicit validation step in `worker.py`: if `pushed_count == 0`, mark the document as `failed` with an explicit error message (e.g., "No extractable text found").
- Implement optimistic concurrency control (e.g., a version token or timestamp check) for `TestAttempt` auto-saves to prevent dual-tab overwriting.

### Stage 7: Performance

**Findings:**
1. **Synchronous/Thread Pool Overhead in Async Paths**: In `rag.py`, vector embeddings (`embedder.encode`) and Qdrant searches (`qdrant_sync.query_points`) are pushed to `run_in_executor`. While this avoids blocking the main event loop, using thread pools for network I/O bounds is less efficient than using native async drivers.
2. **N+1 Query Patterns**: In `analytics_service.py` (`get_dashboard`), there are sequential N+1 network calls to Qdrant:
   - A `for coll in collections:` loop that queries `await qdrant_client.get_collection(coll.name)` to fetch chunk stats one by one.
   - A `for cid in course_ids:` loop that queries `await qdrant_tsne.scroll(...)` to fetch vectors sequentially. 
3. **Unnecessary React Re-renders (Thrashing)**: In `TakeTest.tsx`, the `answers` dictionary holds every keystroke for text answers. The auto-save `useEffect` depends on `[answers]`, meaning the interval is destroyed and recreated on every keystroke. Furthermore, typing causes the entire page (timer, progress bar, other questions) to re-render, which could freeze the UI on large exams.
4. **Suboptimal Qdrant Query Patterns**: In `rag.py` (Multi-Query Expansion), the system generates 3 query variations and fires 4 separate `query_points` requests in parallel using `asyncio.gather`. This results in 4 separate network round-trips to the vector database.

**Recommendations:**
- **Qdrant Client & Batching**: Switch from `qdrant_sync` in a thread pool to `AsyncQdrantClient`. Replace the 4 parallel requests in `rag.py` with a single `query_batch_points` request to execute all searches in one network round-trip.
- **Batch Metadata Fetching**: In `analytics_service.py`, redesign the Qdrant stats collection to avoid N+1 requests, or cache cluster-level telemetry asynchronously rather than fetching it sequentially on every dashboard load.
- **Frontend State Decoupling**: In `TakeTest.tsx`, debounce the text inputs locally or use `useRef` for the auto-save payload so that keystrokes don't trigger global `setAnswers` state thrashing and interval resets.

### Stage 8: Security

**Findings:**
1. **Unauthenticated Endpoint**: In `backend/app/api/professor/graphs.py`, the `@router.get("/generate-from-docs-stream/{course_id}")` endpoint accepts `user_id` as a path/query parameter and entirely lacks the `Depends(current_active_user)` dependency. This exposes course knowledge graph generation to unauthenticated access.
2. **Inconsistent Role Enforcement (RBAC)**:
   - `api/professor/courses.py` uses a strict `@Depends(require_role("professor"))` decorator.
   - `api/professor/documents.py` performs manual `if user.role != "professor"` checks inside the endpoint logic.
   - `api/professor/tests.py` completely lacks role checks at the API boundary. It relies on the underlying `TestService` to enforce course ownership (`course.professor_id == user.id`), which could lead to Broken Object Level Authorization (BOLA) if ownership checks are missed on new endpoints.
3. **Hardcoded Secrets**: In `app/core/config.py`, the system correctly implements `validate_jwt_keys()` to prevent default JWT keys in production. However, `AWS_SECRET_ACCESS_KEY` defaults to `"minioadmin"` and `SECRET_KEY` defaults to `"temp_secret_key"` with no validation, risking these defaults bleeding into production if environment variables are missing.
4. **File Uploads (Input Validation)**: `DocumentService.upload_documents` implements robust checks for allowed MIME types (PDF, DOCX, PPTX) and enforces a 50MB file size limit. It mitigates path traversal by storing files in S3 using a generated UUID (`doc_id`). However, it stores the raw, un-sanitized `file.filename` in the database, which poses a Cross-Site Scripting (XSS) risk if rendered unsafely on the frontend.

**Recommendations:**
- **Standardize Role Checks**: Extract the `require_role` dependency into `app/api/auth.py` and apply it consistently across all `professor` and `student` routers.
- **Secure SSE Endpoint**: Add authentication (`Depends(current_active_user)`) to the `/generate-from-docs-stream` endpoint.
- **Strict Secrets Validation**: Expand `config.py` validation to throw a `RuntimeError` if `AWS_SECRET_ACCESS_KEY` or `SECRET_KEY` hold their default placeholder values in a production environment.
- **Sanitize Filenames**: Sanitize `file.filename` using `werkzeug.utils.secure_filename` or a custom regex before storing it in MongoDB.

### Stage 9: Frontend Design

**Findings:**
1. **Conflicting Color Systems**: The `frontend/src/index.css` contains two competing design systems due to a partial merge of a "designer frontend". The root defines both `--bg-primary` (and related semantic colors) and `--designer-bg` (with different accent colors like `--designer-accent-green` which is surprisingly mapped to a blue hex code). This creates severe visual incoherence across the app.
2. **Typography Inconsistency**: Although the `Outfit` font is imported in `index.css` (as requested for the minimalist redesign), the global `body` tag still defaults to `font-family: 'Inter', system-ui, -apple-system, sans-serif;`. This means `Outfit` is either unused or only applied sporadically, breaking typography hierarchy.
3. **Broken/Unfinished Screens (Hardcoded Light Mode Colors)**: A search of the `pages/` directory reveals dozens of components using hardcoded light-mode Tailwind classes such as `bg-gray-50`, `bg-blue-100`, `text-emerald-900`, etc. (Prominently in `StudyPlan.tsx`, `StudyMode.tsx`, `Chat.tsx`, and `Dashboard.tsx`). Against the new dark-mode minimalist background (`#0A0A0A`), these light-themed utility classes will render these screens completely broken and visually jarring.
4. **Layout Divergence**: `AppLayout.css` and `Topbar.css` have been updated to use the `.designer-*` variables and floating styles, but the content pages themselves don't fully respect the new minimalist dark aesthetic.

**Recommendations:**
- **Unify the CSS Variables**: Completely eliminate the `.designer-*` prefix and merge the two variable palettes into a single, cohesive dark theme (e.g., using `--bg-primary: #000000`, `--bg-secondary: #0A0A0A`, and a single unified accent color).
- **Apply Global Typography**: Update the `body` selector in `index.css` to use `Outfit` globally to ensure typography is consistent.
- **Scrub Hardcoded Colors**: Audit and rewrite `StudyPlan.tsx`, `StudyMode.tsx`, `Chat.tsx`, and `Dashboard.tsx` to remove `bg-gray-100` and `text-emerald-900` style classes, replacing them with semantic CSS variables (e.g., `var(--bg-elevated)` and `var(--text-secondary)`).

### Stage 10: UX Quality

**Findings:**
1. **Mode Clarity**: It is not clear to the student when they are in "Review Mode" vs "Teach Mode". `StudyMode.tsx` merges both into a single "Study Mode" view with a toggle (`💬 Focus Tutor Chat`) that simply collapses the graph. The cognitive boundary between exploring the graph and engaging in Socratic dialogue is blurred.
2. **Concept Map State Communication**: The `KnowledgeGraph.tsx` nodes completely fail to communicate learning progression. Nodes only display `difficulty` (Foundation, Core Theory, Advanced) and a temporary `isVisited` state. There are no visual indicators for critical learning states such as **Locked** (prerequisites not met), **Unlocked** (ready to learn), or **Mastered** (completed successfully). 
3. **Visual Coherence (Chat vs. Graph)**: There is no coherent visual language tying the `TutorChat` to the active `ConceptNode`. The chat window lacks a clear header indicating which concept is currently being discussed (e.g., "Chatting about: Quantum Superposition"). Furthermore, the chat doesn't inherit any semantic colors from the active node (such as the green/blue/yellow difficulty indicators) to create a visual bridge.
4. **Test Mode Divergence**: `TakeTest.tsx` employs a completely different UX paradigm compared to `StudyMode.tsx`. While `StudyMode.tsx` uses a brutalist light theme with thick `3px` black borders and `#FCFCFC` backgrounds, `TakeTest.tsx` uses a sleek, ultra-minimalist `#000000` dark theme with 1px borders and floating translucent glassmorphism bars. They look like two entirely different applications.

**Recommendations:**
- **Separate Core Modes**: Split `StudyMode.tsx` into distinct, clearly labeled experiences. Introduce a dedicated "Review Mode" for graph exploration and a dedicated "Teach Mode" for focused, full-screen Socratic chatting about a specific node.
- **Implement Progression States in Graph**: Update `ConceptNode` to visually distinguish between Locked (e.g., dimmed/padlock icon), Unlocked (e.g., glowing border), and Mastered (e.g., checkmark/filled background).
- **Bridge the Visual Gap**: Add a prominent contextual header to `TutorChat` that displays the current node's title, description, and difficulty color.
- **Unify the UX Paradigm**: Bring `StudyMode.tsx` and `KnowledgeGraph.tsx` into the new ultra-minimalist dark theme (`#000000`) established by `TakeTest.tsx` to ensure the entire application feels like a single, high-end product.

---

### Stage 11: Frontend Implementation Gaps

**Findings:**
1. **Mock Endpoints**: `frontend/src/api/tests.ts` binds `generateMock` and `submitMock` directly to `/tests/mock/...` endpoints, bypassing actual test generation/submission business logic.
2. **Hardcoded Landing Page Data**: `frontend/src/pages/common/NewLanding.tsx` is heavily populated with hardcoded static statistics ("1 Billion Tokens Analyzed"), placeholder professor spotlights ("DR. SANJAY KUMAR", "YOGESH CHAUDHARI"), and un-wired social media SVG buttons.
3. **Stubbed Student Dashboard**: In `frontend/src/pages/student/Dashboard.tsx` (Line 122), the branch for `if (role === 'student')` only contains a `// student logic` comment, meaning students cannot currently join a class through the UI.
4. **Unimplemented Action Buttons**: `frontend/src/pages/professor/MyClasses.tsx` (Line 122) triggers a raw `alert("Feature coming soon!");` instead of executing any real functionality for secondary actions.
5. **Missing/Unstyled Error States**: `frontend/src/pages/common/CourseDetail.tsx` (and other files) fall back to native browser `alert()` prompts for error handling (e.g., "Cleanup failed") instead of using styled toast notifications or inline error states, disrupting the UX.

**Recommendations:**
- Wire the test generation functions to their real corresponding backend endpoints instead of the mock pathways.
- Make the landing page stats and spotlights dynamic, or at least replace the lorem-ipsum style placeholders with real verified product copy.
- Implement the missing "Join Class" student flow in `Dashboard.tsx`.
- Replace all raw browser `alert()` usages with a centralized, styled Toast/Notification system that matches the design system.

---

### Stage 12: React Patterns & Consistency

**Findings:**
1. **Missing `designer_frontend`**: The `designer_frontend/` repository does not exist locally; the application appears to have consolidated into a single `frontend/` directory. While this eliminates cross-app duplication, it shifts the focus to internal consistency within the consolidated app.
2. **Hardcoded Role Assumptions in Shared API Client**: `frontend/src/api/client.ts` centralizes API calls and auto-prefixes roles (a good pattern). However, its 401 Unauthorized interceptor hardcodes a redirect to `window.location.href = '/login/professor'`, which breaks the student experience entirely when their session expires.
3. **Lack of Shared UI Primitives**: The `components/` directory has domain-specific folders (`analytics`, `graph`, `auth`) but no `ui/` folder for shared primitives (e.g., `<Button>`, `<Card>`). As a result, complex, ad-hoc Tailwind strings (e.g., `border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]`) are duplicated across dozens of files, violating React DRY best practices and making design system updates extremely brittle.
4. **Inconsistent Zustand Store Patterns**: 
   - `authStore.ts` manually reads from and writes to `localStorage` (via `initialize` and `setAuth`) instead of using Zustand's standard `persist` middleware, leading to potential hydration bugs.
   - None of the stores utilize the `devtools` middleware, making state debugging more difficult.
5. **Component Structure Divergence**: The app mixes architectural patterns. Some pages are monolithic and hooks-heavy with inline conditional role rendering (e.g., `Dashboard.tsx` branches entirely on `if (role === 'student')`), while other areas split the structure into role-specific files (e.g., `ProfessorTests.tsx` vs `Assignments.tsx`).

**Recommendations:**
- Refactor `api/client.ts` to dynamically resolve the user's role from the auth store before deciding whether to redirect to `/login/professor` or `/login/student`.
- Abstract repetitive Tailwind utility classes into a shared UI component library (`components/ui/Button.tsx`, `components/ui/Card.tsx`) to enforce a single source of truth for the design system.
- Standardize Zustand stores: implement the `persist` middleware for `authStore` to handle local storage automatically, and add `devtools` across all stores.
- Unify the component architecture: prefer separate, role-specific pages (e.g., `StudentDashboard.tsx` and `ProfessorDashboard.tsx`) over giant `if/else` monolithic files to improve code splitting and readability.

---

### Stage 13: Styling System (Tailwind)

**Findings:**
1. **Missing `designer_frontend`**: As noted in previous stages, `designer_frontend` does not exist locally. Therefore, cross-app sharing of a `tailwind.config.js` is not applicable. The focus is purely on how the unified `frontend/` utilizes Tailwind.
2. **Empty Tailwind Config**: The `frontend/tailwind.config.js` is virtually empty. It only extends the `fontFamily` to include `Outfit`, but completely lacks any design tokens for colors, spacing, typography scales, or drop shadows.
3. **Widespread Arbitrary Values**: Because `tailwind.config.js` has no tokens, developers have resorted to hardcoding arbitrary values inline. A codebase scan reveals over 600 instances of arbitrary hex colors (e.g., `bg-[#0A0A0A]`, `text-[#888888]`, `bg-[#FF4D5B]`, `border-[#1A1A1A]`) and complex arbitrary drop shadows (`shadow-[4px_4px_0_#0A0A0A]`) scattered throughout the React components. 
4. **Drift & Maintenance Risk**: This complete lack of semantic tokens (like `bg-primary`, `border-muted`, `shadow-brutal`) means the application has zero styling consistency guarantees. A simple request to "make the background slightly lighter" would require a fragile find-and-replace across dozens of files, heavily risking visual drift.

**Recommendations:**
- **Implement a Shared Config Theme**: Populate `frontend/tailwind.config.js` with semantic color tokens (e.g., `background`, `foreground`, `accent`, `muted`), custom box-shadows (e.g., `shadow-brutal`), and standard spacing/radius scales.
- **Remove Arbitrary Brackets**: Undertake a refactoring pass to strip all arbitrary values (e.g., replace `bg-[#0A0A0A]` with `bg-background` or `bg-primary`).

---

### Stage 14: Accessibility Gaps (WCAG)

**Findings:**

1. **Missing Keyboard Navigation in Concept Map**:
   - The interactive nodes in the React Flow graph (`frontend/src/components/graph/KnowledgeGraph.tsx`) are structured as generic `<div>` elements with `cursor-pointer`.
   - They lack `tabIndex={0}`, `role="button"` (or `treeitem`), and keyboard event handlers (`onKeyDown`). Consequently, a student navigating exclusively via keyboard cannot focus or interact with the concept map to launch the chat.

2. **Screen Reader Labels Missing (ARIA)**:
   - **Tutor Chat**: The submit message button and "Thinking Process" dropdown lack `aria-label`, `aria-expanded`, and `aria-controls`. The chat input relies solely on a placeholder without a `<label>` or `aria-label`.
   - **Take Test (Quiz Interface)**: Navigation buttons (Previous/Next arrows) lack `aria-label`s. The top progress bar is purely visual and lacks `role="progressbar"`.
   - **Form Inputs**: Textareas for essay/short-answer questions do not have associated `<label>`s, failing WCAG 3.3.2 (Labels or Instructions).

3. **Poor Semantic State Management**:
   - Multiple-choice and True/False questions use generic `<button>` elements styled to look like radio buttons. However, they lack `role="radio"` and `aria-checked` (or `aria-pressed`). A screen reader will announce them as standard buttons, and visually impaired users will not hear whether an option is currently selected.

4. **Low Contrast Ratios & Missing Focus States**:
   - The dark mode theme in `TakeTest.tsx` uses text colors like `#666666` and `#888888` on `#000000` and `#111111` backgrounds. The `#666666` on `#111111` falls well below the WCAG AA minimum 4.5:1 contrast ratio.
   - Most interactive buttons in the quiz interface (like the multiple-choice options and bottom pagination) do not have explicit `:focus-visible` ring styles defined, making keyboard focus tracking extremely difficult for sighted keyboard users.

**Recommendations:**
- **Keyboard A11y**: Add `tabIndex={0}`, `role="button"`, and `onKeyDown` handlers to the `ConceptNode` component so pressing `Enter`/`Space` triggers the same action as a click.
- **ARIA & Semantics**: Wrap quiz options in native `<fieldset>` and `<input type="radio">` elements (visually hiding the radio button but keeping it accessible), or implement the proper `role="radio"` and `aria-checked` attributes. Add explicit `aria-label`s to all icon-only buttons.
- **Focus & Contrast**: Add a global focus ring utility (e.g., `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white`) to all interactive elements. Lighten the darkest gray text tokens to meet the 4.5:1 ratio.

---

### Stage 15: Responsiveness (Mobile Design)

**Findings:**

1. **Non-existent Designer Mode**: As previously established, there is no dedicated "concept map designer" UI inside the active repository. Both professors and students interact primarily with viewers (`KnowledgeGraphViewer` in analytics and `KnowledgeGraph` in Study Mode).

2. **Study Mode (Teach/Review)**:
   - `frontend/src/pages/student/StudyMode.tsx` heavily assumes a large desktop viewport. The layout consists of a horizontal split where the side panel is hardcoded to a fixed width of `w-[450px]` without any mobile breakpoints (e.g., lacking `md:w-[450px]` or `flex-col md:flex-row`). 
   - If a student opens the Study Mode on a phone, the 450px side panel (containing Node Info and the Chat) will either cause massive horizontal overflow or awkwardly crush the React Flow graph out of frame, rendering the core learning loop unusable on mobile.

3. **Take Test (Quiz Interface)**:
   - `frontend/src/pages/student/TakeTest.tsx` is reasonably responsive. It uses a single-column layout centered with `max-w-3xl` and `px-6`. The floating bottom navigator relies on a flex container that will scale down on mobile viewports.
   - The True/False selector uses `grid-cols-2`, which will be slightly cramped on very small screens (like an iPhone SE), but should generally work without breaking the layout.

4. **Analytics Dashboard (Professor)**:
   - `frontend/src/pages/professor/AnalyticsDashboard.tsx` uses responsive grids (`grid-cols-1 lg:grid-cols-2`) for its data visualization cards, correctly stacking them vertically on mobile devices while letting the graphs stretch.

**Recommendations:**
- **Refactor Study Mode**: Overhaul `StudyMode.tsx` to handle small viewports. On mobile, the UI should likely stack vertically (`flex-col`) with the graph occupying the top half and the chat/info panel taking the bottom half, or it should adopt a tabbed/drawer approach where the user toggles between the Graph map and the active Chat.

---

*Note: For findings that require significant technical decisions or design trade-offs, we will create individual Architecture Decision Records (ADRs) in this directory following the standard ADR templates (e.g., `audit/ADR-0001-update-auth-flow.md`).*
