# CobbleAI 2.0: architecture and operations

This note covers what changed from v1, how to run each part, and how to reproduce the evaluation numbers. The full list of changes, including bug fixes, is in [CHANGELOG_2_0.md](CHANGELOG_2_0.md). Where this note and the v1 project report disagree, this note describes the code as it is.

## What changed from v1

| Area | v1 | 2.0 |
|---|---|---|
| Ingestion | Plain text per file, 400/80-word windows | Located segments: PDF pages, slides (with speaker notes), DOCX paragraphs and tables, transcript windows, keyframe OCR, chapter summaries. Every chunk keeps its page, slide or timestamp. |
| Vector store | `course_<id>`, unnamed dense vector, payload of text, filename and doc id | `course_<id>_v2`, named `dense` vector plus sparse `bm25` (IDF applied by Qdrant), located payload, idempotent `uuid5` point ids. Reads fall back to the legacy collection. |
| Retrieval | Dense top-10, then **0.2 × cosine + 0.8 × raw cross-encoder logit** (earlier docs said 0.3/0.7; the code used 0.2/0.8) | Optional query expansion → dense + BM25 + chapter prior → min-max normalisation → cross-encoder (sigmoid) → final = α·hybrid + (1−α)·support. The `v1` preset reproduces the old pipeline exactly. |
| Tutor | "Answer even if not covered" fallback | Cite or decline, `[S1]` citations, hint ladder, instructor policy, assessment mode, teach-back, answer feedback. Every answer is logged as a `TutorRun`. |
| Grading | Single-pass score, silent 0 on errors | Rubric-driven, 3 self-consistency samples, evidence spans, confidence, review queue, instructor–AI agreement. Errors go to review. |
| Graph | No sources, unstable ids | Evidence quote and source on every concept and edge, fuzzy-verified, `supported` flag, stable ids, edge audit with Wilson CI. |
| Learner model | Heuristic struggle score | BKT mastery per concept, logistic confusion model fitted on instructor labels with per-signal reasons (falls back to the labelled v1 heuristic). |
| Analytics | Some fabricated or floored values | Measured values only; panels show "not measured" when there is no data. |

## Services and processes

| Process | Command (from `backend/`) | Notes |
|---|---|---|
| API | `uvicorn app.main:app --port 8000` | |
| Worker (documents, analytics) | `celery -A app.core.celery_app worker --pool=solo` | Default queue. 300 s limit per document. |
| **Media worker** | `celery -A app.core.celery_app worker -Q media --pool=solo -n media@%h` | Lecture recordings only (`process_lecture`), with long time limits. Run exactly one per GPU. |
| Beat | `celery -A app.core.celery_app beat` | Daily aggregates, user profiles, node metrics every 6 h, dropout risk weekly, **weekly question insights**. |
| Ollama | `ollama serve` | Model from `LLM_MODEL`. Frame captions use `CAPTION_MODEL` (empty = `LLM_MODEL`; it must accept images). |

Qdrant must be **1.10 or newer**, because BM25 uses the IDF modifier; `docker-compose.yml` pins `qdrant/qdrant:v1.20.0`, the version this release was verified on. The API prints the server version at startup and a warning if it is older.

`minio/minio` was removed from Docker Hub in September 2026, so `docker-compose.yml` uses Chainguard's build of the same server (`cgr.dev/chainguard/minio`, same command and environment variables).

## GPU setup (CUDA)

The lecture pipeline uses faster-whisper (CTranslate2) and EasyOCR (PyTorch).

1. Install an NVIDIA driver that supports CUDA 12.
2. CTranslate2 needs **cuDNN 9 and cuBLAS for CUDA 12** on the library path. The simplest route is `pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12>=9,<10"` in the backend venv; on Windows the transcriber adds those wheels' `bin` directories to the DLL search path itself. If CUDA fails at load time or on the first decode, the whole transcription is retried on the CPU (int8), so a missing library slows a lecture down instead of failing it.
3. Install a CUDA build of PyTorch **before** `pip install -r requirements.txt`, for example `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128`. The lock file pins versions, not the CUDA variant.
4. Settings: `WHISPER_DEVICE=auto` uses CUDA when available and falls back to CPU (int8). `WHISPER_MODEL=medium` and `WHISPER_COMPUTE_TYPE=int8_float16` fit alongside a small Ollama model on an 8 GB card. The Whisper model is unloaded after each lecture so the GPU is free for the LLM.
5. Audio is decoded by our own PyAV code, not faster-whisper's (which passes an argument PyAV 14+ rejects).

Measured on an RTX 3080 (10 GB) with `medium`/`int8_float16`: a 55 s test lecture transcribed at a real-time factor of 0.23 (0.92 on the CPU fallback); the whole pipeline (transcript, keyframes, OCR, captions, chapters, indexing) took 52 s.

Slide changes are detected by the share of thumbnail pixels that changed (`SLIDE_CHANGE_THRESHOLD`, default 0.005), so slides that share a template and differ only in their text are caught. Keyframe captions and other short structured LLM calls (cluster labels, query expansion) switch the model's thinking off; a thinking model otherwise spends the whole token budget thinking and returns nothing.

## Feature flags (`backend/.env`)

Each flag doubles as an ablation switch and an instant rollback to v1 behaviour.

| Flag | Default | Off means |
|---|---|---|
| `HYBRID_RETRIEVAL` | true | exact v1 retrieval (the `v1` preset) |
| `RETRIEVAL_PRESET` | `hybrid` | any preset in `app/services/retrieval/config.py` |
| `CITE_OR_DECLINE` | true | the tutor never declines |
| `LEARNER_MODEL_V2` | true | no BKT mastery updates |
| `GRADER_V2` | true | v1 single-pass grading |
| `LECTURE_PIPELINE` | true | media uploads are rejected |
| `FRAME_CAPTIONING` | true | keyframes get OCR only |

Grader settings: `GRADER_SAMPLES=3`, `GRADER_SAMPLE_TEMPERATURE=0.7`, `GRADER_REVIEW_THRESHOLD=0.7`.

Test results: a test shows results right after submission only when "Show results right after submission" is ticked (`show_results_immediately`); otherwise the instructor clicks **Release Results** on the test card. Either way, an attempt with an AI grade still waiting for review stays hidden until it is reviewed. A submitted or graded attempt is final: it cannot be re-submitted, and a late auto-save cannot overwrite it.

## Migrating a v1 install

All data changes are additive: new Mongo fields are optional, and old graphs, sessions and attempts load unchanged.

```bash
python -m scripts.migrate_qdrant_v2 --dry-run          # what would be re-indexed
python -m scripts.migrate_qdrant_v2                    # all ready documents, idempotent
python -m scripts.migrate_qdrant_v2 --course <id>      # one course
python -m scripts.migrate_qdrant_v2 --drop-legacy      # remove course_<id> once you are happy
```

To get provenance on an existing concept map, regenerate the graph from the course page.

## Evaluation harness (`backend/eval`)

Every run writes `eval/runs/<timestamp>_<name>_<hash>/` with `config.json` (the experiment and the fully resolved retrieval config), `env.json` (git commit, models, feature flags, judge, platform), `inputs.jsonl`, `outputs.jsonl` and `metrics.json`. `report` rebuilds every table from those files alone.

```bash
python -m eval.cli validate-gold eval/gold/<course>.jsonl
python -m eval.cli run --config eval/configs/s1_full_v1.yaml        # v1 baseline
python -m eval.cli run --config eval/configs/s1_hybrid.yaml         # 2.0 retrieval
python -m eval.cli report eval/runs/<run1> eval/runs/<run2>         # value [95% CI] per metric
python -m eval.cli simulate --config eval/configs/s2_pedagogy.yaml  # S2 simulated students
python -m eval.cli kt                                               # S3 BKT vs PFA (ASSISTments)
python -m eval.cli confusion-study --course <id>                    # S4
python -m eval.cli grading-study --dataset mohler                   # S5 (or asap)
python -m eval.cli wer --reference ref.txt --hypothesis hyp.txt     # S6 transcript WER
python -m eval.cli draft-gold --course <id> --out drafts.jsonl      # candidates for HUMAN review only
```

- **Gold sets** live in `eval/gold/`; see `eval/gold/README.md` for the authoring rules. Thresholds are tuned on the `dev` split only, and the `test` split stays frozen.
- **Judge:** generation metrics use any OpenAI-compatible endpoint (`JUDGE_BASE_URL`, `JUDGE_MODEL`, default local Ollama), so nothing leaves campus. `JUDGE_REASONING_EFFORT` (default `none`) stops thinking models from spending the short verdict budgets on reasoning; set it to an empty string for servers that reject the field. Evaluation runs use a fixed tutor policy, not the course's live one, and log it with every output.
- **Public datasets** (ASSISTments, Mohler, ASAP-SAS, EduVidQA) are read from `eval/data/<name>/`. Check each licence, and see `eval/data/README.md` for the data cards. The ASAP-SAS study also needs `eval/data/asap_sas/prompts.json` (each set's question and rubric, copied from the set descriptions) and refuses to run without it.
- Kappa (QWK, Cohen's) is reported as `null` when either rater gave every item the same score: it is 0 or undefined by construction there and says nothing about agreement.
- The graph audit reports `precision` on the judged sample and `precision_estimate` for the whole graph (each sampled stratum weighted by its share of edges), since the stratified sample over-represents rare strata.
- No number is reported unless it was measured. The old `evaluate_fast.py`, with its hard-coded hits@5, has been deleted.

## Research pilot (S7)

- **Consent** is opt-in, versioned and revocable (`GET/PUT /api/consent`). Students are asked during onboarding, and again through a banner if they haven't decided or the wording has changed. Saying no changes nothing in the app.
- **Export** only covers users whose latest decision is consent:

  ```bash
  RESEARCH_EXPORT_SALT=<long secret kept outside the export> \
    python -m scripts.export_research_logs --out exports/pilot --course <id> --since 2026-09-01
  ```

  Ids are salted SHA-256 codes, including the ids inside event payloads (session, message, lecture, document and chunk ids get the same pseudonyms as the columns, so they still join). Names, emails, IP addresses and user agents are never written, and a participant's own name or email is redacted from their questions and from free text in payloads. `backend/exports/` is git-ignored.

## Main API additions

| Area | Endpoints |
|---|---|
| Tutor | `POST /api/tutor/courses/{id}/ask` (SSE: `meta`, `sources`, `chunk`, `citations`, `done`), `GET/PUT …/policy/settings`, `POST /api/tutor/feedback`, `GET /api/tutor/courses/{id}/feedback` |
| Lectures | `GET /api/lectures/course/{id}`, `GET /api/lectures/{id}`, `…/captions.vtt`, `…/transcript.txt`, `PUT …/exclusions`, `GET /api/files/{doc_id}/url` |
| Learner | `GET /api/learner/courses/{id}/concepts`, `PUT …/labels/{node}`, `POST …/fit`, `GET …/mastery`, `GET …/calibration`, `GET /api/learner/lectures/{id}/heatmap` |
| Grading | `GET /api/professor/grading/queue`, `POST …/answers/{attempt}/{question}/review`, `GET …/export.csv`, `GET …/agreement`, `POST /api/professor/tests/{id}/release-results` |
| Study plans | `GET /api/student/study-plans/topics?node_id&course_id`, `POST …/topics/generate` (per-topic deep dive) |
| Graph audit | `POST /api/professor/graph/{id}/audit-sample`, `PATCH …/edges/{edge}/audit`, `GET …/audit-report` |
| Insights | `GET /api/insights/courses/{id}/questions`, `POST …/questions/generate`, `GET …/coverage-gaps`, `GET …/source-counts`, `GET …/reports/{weekly\|term}.{pdf\|csv\|json}` |
| FAQ | `GET /api/faq/courses/{id}` (students see published entries only), `POST …/draft`, `POST /api/faq/courses/{id}`, `PATCH/DELETE /api/faq/{entry}` |
| Consent | `GET/PUT /api/consent` |

## Privacy rules built into the insights

- Question clusters show LLM paraphrases; a label that copies a student's wording is dropped.
- The coverage-gap report, source counts and dashboards show aggregates only.
- Instructor reports name students only in the "students to check on" table, and each name comes with the measured reasons.
- Lecture segments the instructor excludes (for example classroom Q&A) are left out of the index, captions and transcript, and the chapters, summaries and notes are rewritten from the rest of the recording (`rebuild_lecture` task on the media queue). Notes inside an excluded range are hidden immediately.
- Analytics events only count toward a course the user belongs to, and only student activity feeds the heatmap and the struggle signals (instructor previews and FAQ drafting do not). Jumps made by clicking a transcript line, chapter or citation are logged as navigation, not as rewinds.
