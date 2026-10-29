# 🎓 Cobble AI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Qdrant](https://img.shields.io/badge/Qdrant-EF3A5D?style=flat&logo=qdrant&logoColor=white)](https://qdrant.tech/)

**Cobble AI** is a locally hosted AI tutor for university courses. It turns course materials (PDF, DOCX, PPTX) and lecture recordings (MP4, WebM, MOV, MP3, M4A, WAV) into a concept map, a cited tutor, quizzes and instructor insights. Everything runs on campus hardware, including the language model, speech-to-text and OCR, so course content and student activity never leave it.

**CobbleAI 2.0** turns the tutor into a measured research system. Every answer is logged with the evidence it used, and an evaluation harness rebuilds every reported number from those logs.

- [docs/CHANGELOG_2_0.md](docs/CHANGELOG_2_0.md) lists everything that changed from v1.
- [docs/COBBLEAI_2_0.md](docs/COBBLEAI_2_0.md) covers architecture and operations.

---

## 🆕 What's new in 2.0

- **Lecture recordings** are transcribed, captioned, split into chapters with notes, and searchable down to the second.
- **The tutor cites or declines.** Every answer points to the page, slide or lecture moment it came from. When the materials don't cover a question, the tutor says so instead of guessing.
- **Instructors set the tutor's limits.** A hint ladder caps how much help students get, and assessment mode blocks full answers during tests.
- **AI grading with review:** rubric-based grading with evidence and a confidence score. Uncertain grades wait for the instructor, and instructor–AI agreement is measured.
- **Concept maps with sources:** every concept and relationship is backed by a quote from the materials.
- **A learner model:** per-concept mastery (knowledge tracing) and struggle flags that explain their reasons.
- **Course insights:** clusters of student questions, gaps in coverage, an FAQ drafted from student questions, and PDF/CSV reports.
- **Hybrid search:** dense vectors plus BM25 keyword search, with reranking.
- **Research tooling:** an evaluation harness for all seven studies in the research plan, opt-in research consent, and pseudonymised exports.
- **Many v1 fixes.** See the [change log](docs/CHANGELOG_2_0.md#v1-bugs-fixed).

## ✨ Features

**Students**
- **Cited tutor on every concept.** Teach, Review and Test modes on the concept map, plus a course-wide chat. Citation chips open the PDF at the page or the lecture at the second.
- **Hint ladder:** nudge → guiding question → worked step → full answer, within the limits the instructor sets.
- **Lecture view:** video with captions, chapters with summaries and timestamped notes, and a clickable transcript you can download. You can also ask questions about one lecture alone.
- **Teach it back:** explain a concept, and the tutor plays a curious classmate who asks follow-up questions and points out claims that conflict with the notes.
- **Answer feedback** ("helpful", "wrong", "not in my notes"), and **read aloud** using on-device voices only.
- **Quizzes with confidence check-ins,** a result page, and a calibration chart comparing confidence with accuracy.
- **Study plans** for the whole course or a single topic, and a published FAQ on the course page.

**Instructors**
- **Course materials:** upload documents and recordings (with an upload progress bar), and exclude parts of a recording, such as classroom Q&A, from search, captions and summaries.
- **Tutor policy:** the highest hint level, whether full answers are allowed, assessment mode (automatic while a test is in progress), and which documents the tutor may use, with per-concept overrides.
- **Concept map with provenance:** each concept and relationship shows its source quote. Unsupported relationships are dashed, and a sampled edge audit reports precision with a confidence interval.
- **Tests:** generated questions carry Bloom levels. Results appear right after submission or when you click **Release Results**.
- **Grading review queue:** grades are sorted by confidence, each with its evidence. Approve or override each one, then export to CSV. An agreement report shows instructor–AI agreement (QWK, MAE, exact agreement), with a breakdown by Bloom level. Assignments get a rubric editor and AI-drafted grades.
- **Insights:**
  - weekly question clusters with likely misconceptions;
  - a coverage-gap report;
  - the most-asked slides and lecture moments;
  - a confusion heatmap on each lecture's timeline;
  - struggling-concept flags with their reasons;
  - an FAQ drafted from student questions;
  - one-click weekly and term reports (PDF/CSV).
- **Analytics dashboard** with measured values only. Panels without data say "not measured".

**Researchers**
- `python -m eval.cli` runs the retrieval, pedagogy, knowledge-tracing, confusion, grading and lecture studies (S1–S6) with bootstrap confidence intervals. Each run is saved so it can be reproduced.
- Every tutor answer is logged as a `TutorRun` with its retrieval scores, sources, prompt version, model, hint level and policy.
- Research consent is opt-in and revocable. Exports cover consenting users only, under salted pseudonyms.

## 🧭 How it works

```text
documents ─┐                                  ┌─ tutor engine ── cite or decline, hint ladder, policy ─→ answer + citations
           ├─ located segments ─→ Qdrant v2 ──┤                                                           │
lectures ──┘   (page / slide /     dense+BM25 ├─ concept map with provenance                             TutorRun log
  │             timestamp)                     └─ insights, FAQ drafts                                       │
  └─ media worker: transcript (faster-whisper), keyframes + OCR, captions, chapters                    eval harness, learner model
```

- The **default Celery worker** processes documents and analytics.
- The **media worker** runs long lecture jobs on its own queue, so a transcription never blocks document processing.
- **Beat** runs the periodic jobs: daily aggregates, concept metrics, dropout risk and weekly question insights.

## 🛠️ Technology Stack

| Tier      | Technologies |
| --------- | ------------ |
| Frontend  | React 19, Vite, TypeScript, Tailwind CSS, Zustand, React Flow, recharts / nivo, Vitest |
| Backend   | Python 3.12, FastAPI, Celery (default + `media` queues, beat), Redis, MongoDB (Beanie ODM), JWT auth |
| AI models | Local LLM via Ollama (default `gemma4:e2b`), `all-MiniLM-L6-v2` embeddings, `ms-marco-MiniLM-L-6-v2` cross-encoder, faster-whisper, EasyOCR |
| Data      | Qdrant v1.20 (dense + BM25 sparse vectors), MongoDB 6, MinIO (S3 object storage, Chainguard image) |

## 🚀 Getting Started

### Prerequisites

- Docker
- Python 3.12
- Node.js and npm
- [Ollama](https://ollama.com), with the model named in `LLM_MODEL` pulled (`ollama pull gemma4:e2b` for the default)
- Optional but recommended: an NVIDIA GPU with a CUDA 12 driver, for lecture transcription. Without one, lectures are transcribed on the CPU, about four times slower.

### 1. Configure

```bash
cp backend/.env.example backend/.env
```

Fill in the values in `backend/.env`, and generate your own JWT key pair as the comments in the file describe. The server refuses to start with the placeholder keys. Every 2.0 setting has a working default (see Configuration below). Never commit `backend/.env`.

### 2a. Start everything with one command (macOS / Linux)

```bash
bash start_cobble.sh
```

The script:

1. starts MongoDB, Redis, Qdrant and MinIO in Docker;
2. installs the backend into `backend/venv`;
3. starts the API, the Celery worker, the **media worker** and the beat scheduler;
4. installs and starts the Vite dev server.

Open `http://localhost:5173`.

### 2b. Start each part by hand (any OS, including Windows)

```bash
docker compose up -d                       # MongoDB, Redis, Qdrant, MinIO

cd backend
python -m venv .venv
source .venv/bin/activate                  # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
```

Then run each process in its own terminal, from `backend/` with the venv active:

| Process | Command |
|---|---|
| API | `uvicorn app.main:app --port 8000` |
| Worker (documents, analytics) | `celery -A app.core.celery_app worker --pool=solo` |
| Media worker (lectures; one per GPU) | `celery -A app.core.celery_app worker -Q media --pool=solo -n media@%h` |
| Beat (periodic jobs) | `celery -A app.core.celery_app beat` |
| Frontend (from `frontend/`) | `npm install && npm run dev` |

| Service | Address |
|---|---|
| App | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Qdrant | `localhost:6333` |
| MinIO API | `localhost:9002` |
| MinIO console | `localhost:9001` |

`requirements.lock` pins the exact versions this release was verified with. Use `pip install -r requirements.txt -c requirements.lock` to reproduce them.

### 3. GPU setup (optional)

```bash
pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12>=9,<10"     # libraries faster-whisper needs on CUDA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128   # GPU OCR; install before requirements.txt
```

With the default `WHISPER_DEVICE=auto`, CUDA is used when it works. If a library is missing, the whole transcription falls back to the CPU instead of failing. On an RTX 3080, a lecture transcribes at 0.23× real time (0.92× on the CPU). Details are in [GPU setup](docs/COBBLEAI_2_0.md#gpu-setup-cuda).

### 4. Upgrading a v1 install

All database changes are additive, so existing courses, graphs, sessions and attempts keep working. Re-index documents into the v2 search collections once:

```bash
cd backend
python -m scripts.migrate_qdrant_v2 --dry-run    # see what would be re-indexed
python -m scripts.migrate_qdrant_v2              # idempotent; safe to re-run
```

Until then, search falls back to the old collections. To give an existing concept map sources, regenerate it from the course page.

## ⚙️ Configuration

Settings live in `backend/.env` (defaults in `backend/app/core/config.py`). Each 2.0 upgrade has a flag that doubles as an ablation switch and an instant rollback to v1 behaviour:

| Flag | Default | When off |
|---|---|---|
| `HYBRID_RETRIEVAL` | `true` | exact v1 retrieval |
| `CITE_OR_DECLINE` | `true` | the tutor never declines |
| `LEARNER_MODEL_V2` | `true` | no mastery updates |
| `GRADER_V2` | `true` | v1 single-pass grading |
| `LECTURE_PIPELINE` | `true` | media uploads are rejected |
| `FRAME_CAPTIONING` | `true` | keyframes get OCR only |

Other useful settings:

- `LLM_MODEL`, and `CAPTION_MODEL` (an image-capable model for keyframe descriptions; empty means `LLM_MODEL`);
- `WHISPER_MODEL` (default `medium`), `WHISPER_DEVICE` and `WHISPER_COMPUTE_TYPE`;
- `MAX_MEDIA_SIZE_MB` (default 2048);
- `GRADER_REVIEW_THRESHOLD`;
- `S3_PUBLIC_ENDPOINT_URL`, if browsers reach MinIO at a different address than the API does.

The full list is in [docs/COBBLEAI_2_0.md](docs/COBBLEAI_2_0.md#feature-flags-backendenv).

## 🧪 Testing

```bash
cd backend && python -m pytest                 # offline: in-memory MongoDB and Qdrant, scripted LLM; no services needed
cd frontend && npm run build && npm test       # type-check + production build, then Vitest unit tests
cd frontend && npm run lint
```

The backend suite covers:

- the v1 flows;
- ingestion and hybrid retrieval;
- the tutor engine;
- lectures;
- graph provenance;
- the learner model and grader;
- insights;
- the evaluation harness;
- the research export.

No test can send a task to a live Celery broker.

## 🔬 Evaluation and research

From `backend/`:

```bash
python -m eval.cli validate-gold eval/gold/<course>.jsonl
python -m eval.cli run --config eval/configs/s1_full_v1.yaml        # v1 baseline
python -m eval.cli run --config eval/configs/s1_hybrid.yaml         # 2.0 retrieval
python -m eval.cli report eval/runs/<run1> eval/runs/<run2>         # each metric with a 95% CI
```

- Every run writes its config, environment, inputs, outputs and metrics to `eval/runs/` (git-ignored).
- Generation metrics are scored by a local judge (`JUDGE_BASE_URL`, `JUDGE_MODEL`), so nothing leaves campus.
- **Gold questions** go in `eval/gold/`; see [eval/gold/README.md](backend/eval/gold/README.md) for the authoring rules.
- **Public datasets** (ASSISTments, Mohler, ASAP-SAS, EduVidQA) go in `eval/data/`, after you check each licence; see [eval/data/README.md](backend/eval/data/README.md).

Research exports include only students who consented:

```bash
RESEARCH_EXPORT_SALT=<long secret> python -m scripts.export_research_logs --out exports/pilot --course <id>
```

## 📚 Documentation

| Document | What it covers |
|---|---|
| [docs/CHANGELOG_2_0.md](docs/CHANGELOG_2_0.md) | Everything that changed from v1, the bugs fixed, and what isn't done yet |
| [docs/COBBLEAI_2_0.md](docs/COBBLEAI_2_0.md) | Architecture, processes, GPU setup, flags, migration, eval harness, API additions, privacy rules |
| [docs/COBBLEAI_PROJECT_REPORT.md](docs/COBBLEAI_PROJECT_REPORT.md) | The v1 project report (historical; where it disagrees with the 2.0 docs, the 2.0 docs are current) |
| [docs/cobbleai_research_paper_appendix.md](docs/cobbleai_research_paper_appendix.md) | Research paper appendix |
| `docs/CobbleAI_SRS.docx`, `docs/CobbleAI_SDS.docx` | Requirements and design specifications |

## 📁 Repository Structure

```text
cobbleAI/
├── backend/
│   ├── app/
│   │   ├── api/        # REST and streaming endpoints (common/, professor/, student/)
│   │   ├── models/     # Beanie documents; registry.py lists them for the API and the workers
│   │   ├── services/   # ingestion/, retrieval/, media/, learner/, insights/, tutor engine, grading
│   │   └── tasks/      # Celery tasks (documents, media, analytics, insights)
│   ├── eval/           # Evaluation harness: gold sets, configs, metrics, CLI
│   ├── scripts/        # Migrations and maintenance (migrate_qdrant_v2, export_research_logs, ...)
│   └── tests/          # pytest suite
├── frontend/           # React application
├── docs/               # Change log, architecture notes, project report, specifications
├── docker-compose.yml  # MongoDB, Redis, Qdrant, MinIO
└── start_cobble.sh     # One-command local setup (macOS / Linux)
```

## 🩺 Troubleshooting

- **`pull access denied for minio/minio`.** That image was removed from Docker Hub in September 2026. `docker-compose.yml` already uses `cgr.dev/chainguard/minio`, so pull again with the current compose file.
- **Qdrant errors about sparse vectors.** Hybrid search needs Qdrant 1.10 or newer, and the compose file pins `v1.20.0`. The API prints the server version at startup and warns if it is too old.
- **A lecture stays in "processing".** Check that the media worker is running; lectures never go to the default worker.
- **Transcription is slow.** It has probably fallen back to the CPU. Install the cuBLAS and cuDNN packages above, and check the media worker log.
- **Empty keyframe descriptions.** Set `CAPTION_MODEL` to an Ollama model that accepts images, or turn off `FRAME_CAPTIONING`.

## 📜 License

This project is licensed under the [MIT License](LICENSE).
