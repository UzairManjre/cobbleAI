# Graph Report - .  (2026-04-30)

## Corpus Check
- 169 files · ~130,392 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 894 nodes · 1912 edges · 75 communities detected
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 1006 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Chat API|Chat API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Frontend Layout|Frontend Layout]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Chat API|Chat API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Courses API|Courses API]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Dashboard Analytics|Dashboard Analytics]]
- [[_COMMUNITY_Chat API|Chat API]]
- [[_COMMUNITY_Designer Frontend|Designer Frontend]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Frontend Layout|Frontend Layout]]
- [[_COMMUNITY_Chat API|Chat API]]
- [[_COMMUNITY_Designer Frontend|Designer Frontend]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Designer Frontend|Designer Frontend]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Student Features|Student Features]]
- [[_COMMUNITY_Chat API|Chat API]]
- [[_COMMUNITY_Frontend Layout|Frontend Layout]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Analytics Aggregation|Analytics Aggregation]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Chat API|Chat API]]
- [[_COMMUNITY_Courses API|Courses API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Database Services|Database Services]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Courses API|Courses API]]
- [[_COMMUNITY_Courses API|Courses API]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Frontend Infrastructure|Frontend Infrastructure]]
- [[_COMMUNITY_Student Features|Student Features]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Frontend Infrastructure|Frontend Infrastructure]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]
- [[_COMMUNITY_Tests API|Tests API]]
- [[_COMMUNITY_Frontend Layout|Frontend Layout]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Student Features|Student Features]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Documents API|Documents API]]
- [[_COMMUNITY_Database Services|Database Services]]
- [[_COMMUNITY_Study Plan Pages|Study Plan Pages]]

## God Nodes (most connected - your core abstractions)
1. `User` - 76 edges
2. `KnowledgeGraph` - 70 edges
3. `Course` - 63 edges
4. `LLMAdapter` - 57 edges
5. `DocumentModel` - 54 edges
6. `MCQOption` - 33 edges
7. `Question` - 33 edges
8. `React` - 32 edges
9. `StudySession` - 31 edges
10. `TestEvaluator` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Receive analytics events from the frontend.     Fire-and-forget — never blocks t` --uses--> `User`  [INFERRED]
  backend\app\api\analytics.py → backend\app\models\user.py
- `Get aggregated data for the professor's dashboard.` --uses--> `User`  [INFERRED]
  backend\app\api\analytics.py → backend\app\models\user.py
- `Extract text from PDF bytes.` --uses--> `DocumentModel`  [INFERRED]
  backend\app\services\doc_extractor.py → backend\app\models\document.py
- `Split text into overlapping chunks by words.` --uses--> `DocumentModel`  [INFERRED]
  backend\app\services\doc_extractor.py → backend\app\models\document.py
- `Get all ready documents for a course.` --uses--> `DocumentModel`  [INFERRED]
  backend\app\services\doc_extractor.py → backend\app\models\document.py

## Hyperedges (group relationships)
- **CobbleAI Project Asset Hierarchy** — favicon_svg, designer_frontend_app, cobbleai_project [EXTRACTED 1.00]
- **Social Media Icons Collection** — icons_bluesky-icon, icons_discord-icon, icons_github-icon, icons_x-icon, icons_social-icon [INFERRED 0.80]
- **Document Processing Pipeline** — process_all, reprocess_docs, reprocess_documents, reprocess_failed, test_pipeline, app_worker [INFERRED 0.80]
- **Database Diagnostics** — check_docs, check_failed, check_qdrant, debug_sources [INFERRED 0.85]
- **Graph Generation Testing** — test_graph_advanced, test_graph_gen, test_pipeline [INFERRED 0.80]
- **Knowledge Graph Lifecycle Flow** — graph_KnowledgeGraph, graphs_router, study_plans_router, tests_router, documents_router [EXTRACTED 1.00]
- **Study Plan Generation Flow** — study_plan_StudyPlan, study_plans_router, course_Course, graph_KnowledgeGraph, document_DocumentModel [EXTRACTED 1.00]
- **Document Processing Flow** — document_DocumentModel, documents_router, storage_get_s3_client, graph_KnowledgeGraph [EXTRACTED 1.00]
- **LLM Adapter Consumers** — study_plan_generator_StudyPlanGenerator, triplet_extractor_TripletExtractor, test_generator_TestGenerator, tutor_TutorService [EXTRACTED 1.00]
- **RAG Pipeline Participants** — tutor_TutorService, rag_retrieve_context, reranker_Reranker [EXTRACTED 1.00]
- **Frontend Layout Components** — Layout_jsx_Layout, Sidebar_jsx_Sidebar, Topbar_jsx_Topbar [EXTRACTED 1.00]
- **Knowledge Graph Feature** — knowledge_graph, node_info, tutor_chat [INFERRED 0.90]
- **Professor Layout Feature** — professor_layout, sidebar, topbar [INFERRED 0.90]
- **Study Mode Flow** — CourseDetail_CourseDetail, StudyMode_StudyMode, graphStore_graphStore [INFERRED 0.80]
- **Test Management Flow** — ProfessorTests_ProfessorTests, TakeTest_TakeTest, authStore_authStore [INFERRED 0.80]
- **Document Processing Pipeline Documentation** — AUDIT_REPORT_AUDIT_REPORT, COBBLEAI_PROJECT_REPORT_COBBLEAI_PROJECT_REPORT, cobble_ai_plan_v2 (1)_643a0042_cobble_ai_plan_v2 [INFERRED 0.80]
- **CobbleAI Backend Stack** — project_documentation_cobbleai, project_documentation_fastapi, project_documentation_mongodb, project_documentation_qdrant, project_documentation_redis [EXTRACTED 1.00]
- **CobbleAI Frontend Stack** — project_documentation_cobbleai, project_documentation_react, project_documentation_typescript [EXTRACTED 1.00]
- **RAG Pipeline** — fixes_applied_rag, project_documentation_qdrant, project_documentation_ollama [EXTRACTED 1.00]
- **Vite Production Build Process** — vite_build, vite, tsc, frontend_build_log, frontend_index_html [EXTRACTED 1.00]
- **React TypeScript Vite Template Components** — frontend_readme_md, react, typescript, vite, vite_plugin_react, vite_plugin_react_swc [EXTRACTED 1.00]
- **Index HTML Embedded Resources** — frontend_index_html, root_div, main_tsx, favicon_svg [EXTRACTED 1.00]

## Communities

### Community 0 - "Chat API"
Cohesion: 0.03
Nodes (64): chat_interaction(), _is_valid_uuid(), Check if a string is a valid UUID, Fire-and-forget event tracking that never breaks the route handler., Core Chat Orchestrator with RAG - Retrieves context from course documents., _safe_track_event(), AskRequest, generate_graph() (+56 more)

### Community 1 - "Documents API"
Cohesion: 0.1
Nodes (68): _generate_graph_for_course(), Process document synchronously in thread pool, Fire-and-forget event tracking that never breaks the route handler., Process a document asynchronously, Manually trigger processing for all pending documents, Remove duplicate documents from the database, keeping only the most recent versi, Auto-generate knowledge graph from course documents after processing.      Uses, ask_question() (+60 more)

### Community 2 - "Frontend Layout"
Cohesion: 0.03
Nodes (13): cleanupDuplicates(), fetchDocuments(), generateGraph(), handleUpload(), fetchCourses(), handleCreateCourse(), handleJoinCourse(), handleGenerateQuestions() (+5 more)

### Community 3 - "Tests API"
Cohesion: 0.13
Nodes (52): create_test(), CreateTestRequest, generate_mock_test(), generate_test_questions(), GenerateMockTestRequest, GenerateTestRequest, get_attempt(), get_course_tests() (+44 more)

### Community 4 - "Analytics Aggregation"
Cohesion: 0.07
Nodes (35): AnalyticsAggregate, AnalyticsAggregate — Pre-computed roll-up tables for fast dashboard queries.  Up, Settings, AnalyticsEvent, AnalyticsEvent — Immutable append-only event log.  The core warehouse table. Eve, Settings, EventCategory, Analytics models module.  All analytics-related Beanie documents live here for h (+27 more)

### Community 5 - "Chat API"
Cohesion: 0.07
Nodes (35): AggregateType, AuthEvent, ChatEvent, CourseEvent, DocumentEvent, GraphEvent, LLMEvent, NavigationEvent (+27 more)

### Community 6 - "Documents API"
Cohesion: 0.08
Nodes (33): get_db(), get_doc_metadata(), process_document(), Celery task to process a document (PDF -> Text -> Chunks -> Qdrant)., update_doc_status(), cleanup_stale_documents(), Clean up database entries for documents whose files don't exist in MinIO storage, Remove documents from DB that don't have files in MinIO (+25 more)

### Community 7 - "Courses API"
Cohesion: 0.1
Nodes (29): create_course(), create_invite(), get_course(), get_course_students(), get_professor_students(), join_course(), list_courses(), Get all students enrolled in a course. (+21 more)

### Community 8 - "Analytics Aggregation"
Cohesion: 0.07
Nodes (30): AnalyticsUserProfile — Persistent per-student learning profile.  Grows over time, Settings, redirect_legacy_api_prefix(), BaseSettings, Fail fast if JWT keys are still the example placeholders., Settings, _utcnow(), Automated tests for critical infrastructure fixes.  Run with:     cd backend (+22 more)

### Community 9 - "Analytics Aggregation"
Cohesion: 0.09
Nodes (21): Celery, init_worker_process(), MinIO, MongoDB, Qdrant, Redis, compute_daily_aggregates(), detect_dropout_risk() (+13 more)

### Community 10 - "Dashboard Analytics"
Cohesion: 0.08
Nodes (18): get_dashboard_data(), Receive analytics events from the frontend.     Fire-and-forget — never blocks t, Get aggregated data for the professor's dashboard., track_event_endpoint(), TrackEventRequest, get_user_manager(), UserManager, lifespan() (+10 more)

### Community 11 - "Chat API"
Cohesion: 0.14
Nodes (25): Analytics API Router, Current Active User Dependency, FastAPI Users Instance, Celery App Instance, Chat API Router, Settings Instance, Course Model, Courses API Router (+17 more)

### Community 12 - "Designer Frontend"
Cohesion: 0.08
Nodes (23): Assets Directory, CobbleAI Project, CobbleAI Designer Frontend Application, ESLint, CobbleAI Favicon, CobbleAI Designer Frontend Favicon, Frontend Application, Frontend Build Log (+15 more)

### Community 13 - "Study Plan Pages"
Cohesion: 0.17
Nodes (2): handleGenerateTopicPlan(), handleLoadTopicPlan()

### Community 14 - "Analytics Aggregation"
Cohesion: 0.2
Nodes (1): AnalyticsTracker

### Community 15 - "Documents API"
Cohesion: 0.18
Nodes (11): MongoDB, Qdrant, RAG, CobbleAI, FastAPI, MongoDB, Ollama, Qdrant (+3 more)

### Community 16 - "Tests API"
Cohesion: 0.24
Nodes (10): GraphGenerator, LLMAdapter, PDF Extractor Module, retrieve_context, Reranker, StudyPlanGenerator, TestEvaluator, TestGenerator (+2 more)

### Community 17 - "Tests API"
Cohesion: 0.28
Nodes (9): Dashboard Page, Login Page, Professor Onboarding Page, Professor Tests Page, Signup Page, Student Onboarding Page, Study Plan Page, Take Test Page (+1 more)

### Community 18 - "Documents API"
Cohesion: 0.48
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Social Icon, Icons SVG File, X (Twitter) Icon

### Community 19 - "Documents API"
Cohesion: 0.29
Nodes (7): Bluesky Social Media Icon, Discord Social Media Icon, Documentation Icon, GitHub Social Media Icon, CobbleAI Frontend Icon Set, Generic Social Media Icon, X (Formerly Twitter) Social Media Icon

### Community 20 - "Frontend Layout"
Cohesion: 0.29
Nodes (7): App, Assignments, Classes, Layout, Sidebar, Topbar, Main Entry

### Community 21 - "Chat API"
Cohesion: 0.4
Nodes (6): Chat Page, Course Detail Page, MindMap Page, Study Mode Page, Analytics Utility, Graph Store (Zustand)

### Community 22 - "Designer Frontend"
Cohesion: 0.4
Nodes (5): CobbleAI Frontend, Designer Frontend Project, Vite Build Tool, Vite Logo (SVG Icon), Vite Logo

### Community 23 - "Analytics Aggregation"
Cohesion: 0.83
Nodes (3): fetch_data(), generate_dashboard(), main()

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (1): Reranker

### Community 25 - "Designer Frontend"
Cohesion: 0.67
Nodes (4): Authentication System, Frontend Assets, Professor Authentication UI Screenshot, Professor Role

### Community 26 - "Documents API"
Cohesion: 0.5
Nodes (4): API Client, Auth API Client, Courses API Client, Documents API Client

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (4): CobbleAI Audit Report, CobbleAI Project Report, CobbleAI Plan v2, CobbleAI Research Paper Appendix

### Community 28 - "Student Features"
Cohesion: 0.67
Nodes (3): Frontend Module, Student Authentication UI Screenshot, Student Authentication

### Community 29 - "Chat API"
Cohesion: 1.0
Nodes (3): Knowledge Graph Component, Node Info Component, Tutor Chat Component

### Community 30 - "Frontend Layout"
Cohesion: 1.0
Nodes (3): Professor Layout Component, Sidebar Component, Topbar Component

### Community 34 - "Tests API"
Cohesion: 1.0
Nodes (1): Test the advanced interconnected graph generation using urllib

### Community 38 - "Analytics Aggregation"
Cohesion: 1.0
Nodes (2): Analytics Middleware Class, Middleware Init Exports

### Community 39 - "Analytics Aggregation"
Cohesion: 1.0
Nodes (2): compute_daily_aggregates, Tasks Init Module

### Community 40 - "Documents API"
Cohesion: 1.0
Nodes (2): Gemma 4 e2b, Gemma 4 e2b

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): Track Event Endpoint

### Community 74 - "Analytics Aggregation"
Cohesion: 1.0
Nodes (1): Get Dashboard Data Endpoint

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): User Manager Class

### Community 76 - "Chat API"
Cohesion: 1.0
Nodes (1): LLM Client Instance

### Community 77 - "Courses API"
Cohesion: 1.0
Nodes (1): Require Role Dependency

### Community 78 - "Documents API"
Cohesion: 1.0
Nodes (1): Process Document Sync Function

### Community 79 - "Documents API"
Cohesion: 1.0
Nodes (1): Generate Graph For Course Function

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): Settings Class

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (1): Connect To Mongo Function

### Community 82 - "Database Services"
Cohesion: 1.0
Nodes (1): Sync Qdrant Client

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (1): Ensure Bucket Exists Function

### Community 84 - "Courses API"
Cohesion: 1.0
Nodes (1): Enrolment Model

### Community 85 - "Courses API"
Cohesion: 1.0
Nodes (1): Course Invite Model

### Community 86 - "Study Plan Pages"
Cohesion: 1.0
Nodes (1): Study Progress Model

### Community 87 - "Study Plan Pages"
Cohesion: 1.0
Nodes (1): Topic Plan Model

### Community 88 - "Study Plan Pages"
Cohesion: 1.0
Nodes (1): Exercise Model

### Community 89 - "Study Plan Pages"
Cohesion: 1.0
Nodes (1): Topic Study Plan Model

### Community 90 - "Tests API"
Cohesion: 1.0
Nodes (1): Test Critical Fixes Module

### Community 91 - "Tests API"
Cohesion: 1.0
Nodes (1): Tests Init Module

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (1): ESLint Config

### Community 93 - "Frontend Infrastructure"
Cohesion: 1.0
Nodes (1): Vite Config

### Community 94 - "Student Features"
Cohesion: 1.0
Nodes (1): Students Page

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (1): ESLint Config

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (1): Tailwind Config

### Community 97 - "Frontend Infrastructure"
Cohesion: 1.0
Nodes (1): Vite Config

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (1): App Component

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (1): Main Entry

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (1): Graphs API Client

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (1): API Index

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (1): Sessions API Client

### Community 103 - "Study Plan Pages"
Cohesion: 1.0
Nodes (1): Study Plans API Client

### Community 104 - "Tests API"
Cohesion: 1.0
Nodes (1): Tests API Client

### Community 105 - "Frontend Layout"
Cohesion: 1.0
Nodes (1): Auth Layout Component

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (1): Assignments Page

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (1): Landing Page

### Community 108 - "Student Features"
Cohesion: 1.0
Nodes (1): Students Page

### Community 109 - "Documents API"
Cohesion: 1.0
Nodes (1): MinIO

### Community 110 - "Documents API"
Cohesion: 1.0
Nodes (1): TypeScript

### Community 111 - "Database Services"
Cohesion: 1.0
Nodes (1): Redis

### Community 112 - "Study Plan Pages"
Cohesion: 1.0
Nodes (1): SQL

## Knowledge Gaps
- **149 isolated node(s):** `Clean up database entries for documents whose files don't exist in MinIO storage`, `Remove documents from DB that don't have files in MinIO`, `Process all pending documents in the database using the fixed pipeline.`, `Test the advanced interconnected graph generation using urllib`, `Test the document processing pipeline with an existing document from the databas` (+144 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Study Plan Pages`** (13 nodes): `StudyPlan.tsx`, `DifficultyBadge()`, `ExerciseIcon()`, `getExerciseProgress()`, `getProgressPercentage()`, `handleCompleteExercise()`, `handleCompleteTopic()`, `handleGeneratePlan()`, `handleGenerateTopicPlan()`, `handleLoadTopicPlan()`, `isExerciseCompleted()`, `isTopicCompleted()`, `loadPlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Analytics Aggregation`** (12 nodes): `analytics.ts`, `AnalyticsTracker`, `.flush()`, `.flushSync()`, `.setEnabled()`, `.track()`, `trackApiErrors()`, `trackPageViews()`, `useComponentDwellTime()`, `useNodeDwellTime()`, `usePageViewTracker()`, `useSessionTracker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (4 nodes): `reranker.py`, `Reranker`, `.__init__()`, `.rerank()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tests API`** (2 nodes): `test_graph_gen.py`, `Test the advanced interconnected graph generation using urllib`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Analytics Aggregation`** (2 nodes): `Analytics Middleware Class`, `Middleware Init Exports`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Analytics Aggregation`** (2 nodes): `compute_daily_aggregates`, `Tasks Init Module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documents API`** (2 nodes): `Gemma 4 e2b`, `Gemma 4 e2b`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `Track Event Endpoint`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Analytics Aggregation`** (1 nodes): `Get Dashboard Data Endpoint`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `User Manager Class`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Chat API`** (1 nodes): `LLM Client Instance`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Courses API`** (1 nodes): `Require Role Dependency`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documents API`** (1 nodes): `Process Document Sync Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documents API`** (1 nodes): `Generate Graph For Course Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `Settings Class`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `Connect To Mongo Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Services`** (1 nodes): `Sync Qdrant Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `Ensure Bucket Exists Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Courses API`** (1 nodes): `Enrolment Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Courses API`** (1 nodes): `Course Invite Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Plan Pages`** (1 nodes): `Study Progress Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Plan Pages`** (1 nodes): `Topic Plan Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Plan Pages`** (1 nodes): `Exercise Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Plan Pages`** (1 nodes): `Topic Study Plan Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tests API`** (1 nodes): `Test Critical Fixes Module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tests API`** (1 nodes): `Tests Init Module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `ESLint Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Infrastructure`** (1 nodes): `Vite Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Student Features`** (1 nodes): `Students Page`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `ESLint Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `Tailwind Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Infrastructure`** (1 nodes): `Vite Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (1 nodes): `App Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `Main Entry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (1 nodes): `Graphs API Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `API Index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `Sessions API Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Plan Pages`** (1 nodes): `Study Plans API Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tests API`** (1 nodes): `Tests API Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Layout`** (1 nodes): `Auth Layout Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `Assignments Page`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `Landing Page`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Student Features`** (1 nodes): `Students Page`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documents API`** (1 nodes): `MinIO`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documents API`** (1 nodes): `TypeScript`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Services`** (1 nodes): `Redis`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Plan Pages`** (1 nodes): `SQL`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `LLMAdapter` connect `Chat API` to `Documents API`, `Tests API`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `User` connect `Documents API` to `Chat API`, `Tests API`, `Analytics Aggregation`, `Courses API`, `Dashboard Analytics`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `Course` connect `Documents API` to `Analytics Aggregation`, `Tests API`, `Analytics Aggregation`, `Courses API`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 73 inferred relationships involving `User` (e.g. with `Debug script to check document IDs and Qdrant payloads` and `Reprocess all documents for a course to fix Qdrant/MongoDB ID mismatch`) actually correct?**
  _`User` has 73 INFERRED edges - model-reasoned connections that need verification._
- **Are the 68 inferred relationships involving `KnowledgeGraph` (e.g. with `Debug script to check document IDs and Qdrant payloads` and `Fire-and-forget event tracking that never breaks the route handler.`) actually correct?**
  _`KnowledgeGraph` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 61 inferred relationships involving `Course` (e.g. with `Debug script to check document IDs and Qdrant payloads` and `Reprocess all documents for a course to fix Qdrant/MongoDB ID mismatch`) actually correct?**
  _`Course` has 61 INFERRED edges - model-reasoned connections that need verification._
- **Are the 51 inferred relationships involving `str` (e.g. with `process_all_pending()` and `reprocess()`) actually correct?**
  _`str` has 51 INFERRED edges - model-reasoned connections that need verification._