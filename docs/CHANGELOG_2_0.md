# CobbleAI 2.0: what changed

This is the change log for the move from v1 to 2.0 (branch `feature/cobbleai-2.0`). It lists what is new for each kind of user, what changed underneath, which v1 bugs were fixed, what an end-to-end verification found and fixed, and what is still missing. For how to run, configure and evaluate the system, see [COBBLEAI_2_0.md](COBBLEAI_2_0.md).

2.0 is built from the two CobbleAI 2.0 project definition documents. They cover the five core upgrades (A evaluation harness, B learner model, C grader, D provenance graph, E lecture video and audio) and every feature tagged "Build and evaluate" or "Build lightweight". Features tagged "Next" or "Later", and stretch goals F and G, only have data hooks so far.

## Before you upgrade

- **New processes.** Lecture recordings run on their own Celery queue, so start a media worker (`celery -A app.core.celery_app worker -Q media --pool=solo -n media@%h`) next to the default worker. Periodic jobs need Celery beat. `start_cobble.sh` now starts both.
- **Docker.** MinIO's image was removed from Docker Hub in September 2026, so `docker-compose.yml` uses `cgr.dev/chainguard/minio`, the same server with the same settings. Qdrant is pinned to `v1.20.0`; hybrid retrieval needs 1.10 or newer.
- **Python dependencies.** New: `faster-whisper`, `easyocr`, `scikit-learn`, `scipy`, `jiwer`, `pyyaml`, `rapidfuzz` and `reportlab`. Beanie is pinned below 2 (this codebase uses Motor). `requirements-dev.txt` holds the test tools, and `requirements.lock` pins the versions the release was verified with.
- **GPU.** Transcription uses CUDA when it can. Install `nvidia-cublas-cu12` and `nvidia-cudnn-cu12` (9.x) in the backend venv, and a CUDA build of PyTorch for GPU OCR. Without them everything still works on the CPU, just slower. See [GPU setup](COBBLEAI_2_0.md#gpu-setup-cuda).
- **Frontend.** New dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/dom` and `jsdom`. `npm test` runs the unit tests.
- **Data.** All database changes are additive, so old graphs, sessions, attempts and documents load unchanged. Run `python -m scripts.migrate_qdrant_v2` once to re-index existing documents into the new collections; until then, search falls back to the old ones. Regenerate a course's concept map to give it sources.
- **Rollback.** Each upgrade sits behind a flag in `backend/.env` (`HYBRID_RETRIEVAL`, `CITE_OR_DECLINE`, `LEARNER_MODEL_V2`, `GRADER_V2`, `LECTURE_PIPELINE`, `FRAME_CAPTIONING`). Turning a flag off restores the v1 behaviour.

## New for students

- **A tutor that cites or declines.** Answers cite their sources as chips with a page, slide or timestamp. A PDF chip opens the file at that page, and a lecture chip opens the recording at that second. When the course materials don't cover a question, the tutor says so and lists what it searched, instead of answering from general knowledge.
- **Hint ladder.** Students choose how much help they get: a nudge, a guiding question, a worked step or the full answer. Levels above the instructor's limit are disabled.
- **Teach it back.** The student explains a concept, and the tutor plays a curious classmate: it asks a follow-up question and cites the slide for any claim that conflicts with the notes.
- **Answer feedback.** Each answer has "helpful", "wrong" and "not in my notes" buttons. The last two reach the instructor.
- **Read aloud.** Answers can be read out, using only voices installed on the device, so no text leaves the computer.
- **Lecture view.** A recording plays with captions, alongside chapters (each with a summary and timestamped notes) and a transcript where clicking a line jumps to it. Uncertain transcript lines are shaded. The transcript can be downloaded, and students can ask questions about that lecture alone.
- **Confidence check-ins.** Before each test answer is submitted, students rate their confidence from 1 to 4. A calibration chart (confidence vs accuracy) appears on the result page and the dashboard.
- **Test results page.** A finished test opens its result page once the instructor releases results (or immediately, if the test is set up that way).
- **Course FAQ.** Answers the instructor has published appear on the course page.
- **Per-topic study plan.** Besides the course-wide plan, a student can generate a deep dive on one topic.
- **Research consent.** Onboarding asks whether the student's anonymised activity may be used for research. The answer is optional and can be changed at any time. Saying no changes nothing in the app.

## New for professors

- **Lecture uploads.** mp4, webm, mov, mp3, m4a and wav files can be uploaded, with a progress bar. They are processed locally into a transcript, keyframes, slide text (OCR), keyframe descriptions, captions and chapters with notes. Parts of a recording can be excluded (for example classroom Q&A). Excluded parts disappear from search, captions and transcript, and the chapters are rewritten without them.
- **Tutor policy.** A card on the course page sets:
  - the highest hint level and whether full answers are allowed;
  - assessment mode, which blocks full answers and can switch on automatically while a student has a test in progress;
  - which documents the tutor may use.

  Concepts can override the course settings. The server enforces the policy, and every answer records the policy it ran under.
- **Concept map with sources.** Every concept and relation carries a quote and its source (page, slide or timestamp), checked against the source text. Relations without support are drawn dashed. An edge audit panel samples relations for review and reports precision with a confidence interval.
- **Grading review queue.**
  - Short answers and essays are graded against a rubric, with evidence and a confidence score.
  - Low-confidence grades go to a queue, sorted by confidence, where the instructor approves or overrides each one.
  - An agreement report compares the AI with the instructor (quadratic weighted kappa, mean error, exact agreement, overall and by Bloom level, with confidence intervals). The queue exports to CSV.
- **Rubrics for assignments.** The assignment grading page has a rubric editor and a button that drafts AI grades for review.
- **Releasing results.** The test wizard has a "Show results right after submission" checkbox, and each test card has a **Release Results** button.
- **Bloom levels.** Generated questions carry a cognitive level, editable in the wizard and the preview.
- **Course insights page**:
  - weekly clusters of student questions, each labelled with its topic and likely misconception;
  - a coverage-gap report showing where the notes or lectures don't answer what students ask;
  - question counts per slide, page and lecture moment, with links;
  - weekly FAQ drafting: answers are drafted with citations from the top clusters, then edited and published on one screen;
  - one-click weekly and end-of-term reports (PDF and CSV).
- **Confusion heatmap.** Lecture timelines show where students replay, rewind, pause or ask questions, in 10-second bins with the transcript and keyframe for each.
- **Concept struggle flags with reasons.** Each flag shows its probability and the signals behind it. Instructors can label concept difficulty (with a second rater, for agreement) and fit the model on those labels.
- **Honest analytics.** The analytics dashboard shows measured values only. Panels without data say "not measured".

## For researchers (`backend/eval`)

- `python -m eval.cli` runs every study in the research plan:
  - **S1** retrieval ablations;
  - **S2** simulated students and judge-vs-human agreement;
  - **S3** knowledge tracing (BKT vs PFA on ASSISTments);
  - **S4** the confusion model;
  - **S5** grading on Mohler and ASAP-SAS;
  - **S6** lecture retrieval and transcript WER;
  - gold-set validation and LLM-drafted gold candidates, for human review only.
- Metrics:
  - retrieval: Recall@k, MRR, nDCG@5, page and timestamp hits;
  - generation: faithfulness, context precision and answer relevancy, scored by a local judge;
  - tutoring: correct declines and answer leakage;
  - agreement: kappa, MAE and exact agreement.

  Each metric comes with a bootstrap 95% confidence interval.
- Every run writes its config, environment (git commit, models, flags), inputs, outputs and metrics to `eval/runs/`, and `report` rebuilds every table from those files alone.
- Every tutor answer is logged as a `TutorRun`: the question, retrieval scores, chosen sources, prompt version, model, hint level, policy and decision.
- `scripts/export_research_logs.py` exports consenting users only. It replaces every id with a salted pseudonym (including ids inside event data) and redacts names from free text.

## Under the hood

- **Ingestion.** Files are split into located segments: PDF pages, slides with speaker notes, Word paragraphs and tables, transcript windows, keyframe text and chapter summaries. Each chunk keeps its page, slide or timestamp.
- **Search index.** Per-course collections `course_<id>_v2` hold a dense vector plus a BM25 sparse vector, with payloads that record where each chunk came from. Point ids are stable, so re-processing a file is idempotent.
- **Hybrid retrieval** (`app/services/retrieval`):
  1. optional query expansion;
  2. dense and BM25 candidates;
  3. a chapter prior;
  4. per-signal normalisation;
  5. cross-encoder reranking.

  Named presets keep experiments reproducible, and the `v1` preset reproduces the old ranking exactly. `retrieve_context()` still works for old callers.
- **One tutor engine** (`tutor_engine.py`, `tutor_stream.py`) serves concept study sessions, course-wide questions, lecture questions and the old `/api/chat` route. Prompts live in `core/prompts.py` and carry a version. The stream keeps the v1 frames and adds `meta` and `citations`.
- **Grader v2** (`grading_v2.py`) takes three samples and combines their spread, the model's stated confidence and retrieval support into one confidence score. Grading errors go to review instead of scoring 0.
- **Graph generation** asks for evidence for every concept and relation and verifies it with fuzzy matching and the cross-encoder. Node ids are stable across regenerations, and the enrichment pass can no longer drop concepts.
- **Learner model** (`app/services/learner`): Bayesian Knowledge Tracing per student and concept, and a logistic confusion model with per-signal contributions. It falls back to the labelled v1 heuristic until a model is fitted.
- **Lecture pipeline** (`app/services/media`), on the `media` queue:
  - faster-whisper transcription with a course-vocabulary prompt;
  - slide-change detection with PyAV;
  - EasyOCR on keyframes, plus optional descriptions from the vision model;
  - LLM chapters with a fallback;
  - WebVTT captions.
- **Housekeeping.**
  - One Beanie model registry (`app/models/registry.py`) for the API and the workers.
  - One shared embedding model.
  - Files are served through short-lived links to MinIO (seekable for video).
  - Uploads are streamed instead of read into memory.

## v1 bugs fixed

- **Repositories and graphs.**
  - Repository `create()`/`update()` were missing, but sessions and tests called them.
  - Code treated graph nodes as dicts, which broke asking, navigation, tests and study plans.
  - Graphs were sent with alias field names the frontend did not read.
  - One unknown relation type failed the whole graph.
- **Grading.**
  - The grading models were not registered with the database.
  - Regrade fields and statuses were wrong.
  - A 0.0 override was dropped.
- **Retrieval and documents.**
  - Qdrant results came back without their text.
  - Retrieval errors were sent to the LLM as "context".
  - Deleting a document removed vectors from the wrong collection.
- **Chat and study plans.**
  - `/api/chat` crashed on an undefined variable, and the test-mode prompt raised a KeyError.
  - Study plans lost their `graph_id`.
- **Analytics.**
  - Events lost their node, graph and course ids.
  - The frontend never sent events (wrong token key).
  - Timezone mix-ups crashed the aggregation tasks.
  - The daily aggregates were keyed by the wrong date and split by hour.
- **Integrity.**
  - Starting a test sent the correct answers to the student.
  - `evaluate_fast.py` hard-coded its hits@5.
  - The analytics dashboard showed random, floored or hard-coded numbers.
- **Frontend.**
  - Wrong API paths broke grading, chat, the student graph, study plans and the professor test list.
  - Tests had no result page.
  - Several links led nowhere.
  - Resumed attempts lost their answers.
  - The mind map tooltip allowed HTML injection.
  - Switching concepts mid-answer mixed up the replies.
  - An answer still streaming kept running after the student moved on.
- **Workers.** Errors that would fail again were retried anyway, and the result backend URL could be malformed (every "0" in the Redis URL was replaced).

## Fixes from the end-to-end verification (2026-10-29)

The finished build was checked three ways:

- two independent code reviews;
- about 110 live checks against Docker, Ollama and an RTX 3080, using a real PDF, slide deck and narrated lecture video;
- a browser pass over 10 screens as professor and student.

These problems were found and fixed. Each fix has a regression test where one made sense.

- **Would have stopped the app.**
  - The MinIO image no longer exists on Docker Hub.
  - Transcription always crashed, because faster-whisper passes PyAV 19 an option it rejects. Audio is now decoded by our own code.
  - A missing GPU library crashed transcription instead of falling back to the CPU.
- **Wrong results.**
  - Every PDF citation pointed to page 1; pages are now indexed separately, and documents indexed the old way are re-indexed.
  - Slides that differ only in their text weren't detected as new slides.
  - All chapter notes carried the same timestamp.
  - Keyframe descriptions came back empty, and question clusters fell back to keyword labels, because the model spent its whole response length "thinking".
  - Some generated questions had no Bloom level, and most weren't linked to a concept.
- **Answer leaks and test integrity.**
  - Starting a test sent students the rubric points and grading test cases.
  - Scores showed before the instructor released them.
  - A student could resubmit after results were released.
  - A late auto-save could overwrite a submitted attempt.
  - Attempts waiting for review didn't count toward the attempt limit.
  - Professors couldn't open, edit or grade a test after its due date.
- **Tutor policy.**
  - A student could widen the instructor's document scope.
  - The old `/api/chat` route ignored the hint limit and assessment mode.
  - An answer cut off by a closed browser tab was not saved.
- **Activity data.**
  - Analytics events were accepted for courses the user isn't in.
  - Instructor previews and FAQ drafting counted as student struggle.
  - Clicking a transcript line counted as a rewind.
  - Time spent on a concept was never recorded.
- **Privacy.**
  - Excluded lecture parts still appeared in chapter summaries and notes.
  - The research export kept raw ids inside event data.
- **Features that went nowhere.**
  - Nothing in the interface released test results.
  - The per-topic study plan had no backend routes.
  - The assignment grading page couldn't create a rubric or start an AI draft.
  - The professor's study-plan card returned errors.
  - Duplicate cleanup always failed.
  - `/login` showed a blank page.
- **Research numbers.**
  - One judge error crashed a whole evaluation run.
  - The three S6 lecture conditions ran on different questions.
  - The ASAP grading study gave the grader a placeholder question; it now refuses to run without the real prompts and rubrics.
  - The edge-precision estimate was biased by how edges were sampled.
  - Kappa showed 0.00 when it can't be measured (it now shows "—").
  - Re-reviewing an answer counted twice in the learner model.

Measured on the RTX 3080: transcription runs at 0.23× real time on CUDA (0.92× on the CPU), and a full lecture takes 52 s instead of 170 s.

## Removed

- `backend/evaluate_fast.py` and `backend/run_offline_rag_benchmark.py`, replaced by the evaluation harness.
- Made-up analytics values (random numbers, floors and a hard-coded Sankey chart).
- The tutor's "this isn't covered, but here's what I know" fallback.
- The professor study-plan route; study plans are for students.
- The unused `processAllPending` frontend call.

## Tests and quality gates

- **Backend:** 168 tests run offline, against an in-memory MongoDB and Qdrant and a scripted LLM (`python -m pytest` in `backend/`). New suites cover:
  - v1 flows, ingestion and study plans;
  - hybrid retrieval;
  - the tutor engine;
  - lectures;
  - graph provenance;
  - the learner model;
  - grader v2;
  - insights;
  - the evaluation harness;
  - research export.

  A test-wide guard stops any test from sending a task to a live Celery broker.
- **Frontend:** the production build passes, 12 unit tests pass (stream parsing, HTML escaping and saved test answers), and lint reports 168 problems against a 171 baseline.

## Not done yet

- Word-level transcript timestamps.
- Teach-back outcomes and published assignment grades feeding the knowledge-tracing model.
- The calibrated confusion model in the 6-hourly concept-metrics job, which still uses the heuristic.
- Logging every retrieval candidate and the random seed in `TutorRun`.
- Tuning the decline threshold, which needs a real dev split of gold questions.
- With `GRADER_V2` off, grading errors still score 0, matching v1.
- The v1 project report still mentions `minio/minio` and `qdrant:latest`; it is kept as a historical record.
