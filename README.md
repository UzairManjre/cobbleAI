# 🎓 Cobble AI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Qdrant](https://img.shields.io/badge/Qdrant-EF3A5D?style=flat&logo=qdrant&logoColor=white)](https://qdrant.tech/)

**Cobble AI** is a locally hosted AI tutor for university courses. It turns course materials (PDF, DOCX, PPTX) and lecture recordings (MP4, WebM, MOV, MP3, M4A, WAV) into a concept map, a cited tutor, quizzes and instructor insights. Everything, including the language model, runs on campus hardware.

CobbleAI 2.0 makes it a measured research system: every tutor answer is logged with the evidence it used, and the evaluation harness reproduces each reported number from those logs. See [docs/COBBLEAI_2_0.md](docs/COBBLEAI_2_0.md) for architecture and operations, and [docs/CHANGELOG_2_0.md](docs/CHANGELOG_2_0.md) for everything that changed from v1.

---

## ✨ Features

**Students**
- **Cited tutor that declines when unsure.** Answers cite the page, slide or lecture moment they come from. When the materials don't support an answer, the tutor says so instead of guessing.
- **Hint ladder:** nudge → guiding question → worked step → full answer, within limits the instructor sets. Assessment mode switches reveals off during a test.
- **Ask a lecture:** auto chapters and notes, captions and a downloadable transcript. Citations jump the video to the right second.
- **Teach it back:** explain a concept and the tutor plays a curious classmate.
- **Quizzes with confidence check-ins**, a calibration chart, study plans, and Teach / Review / Test modes on the concept map.

**Instructors**
- **Concept map with provenance:** every concept and relationship carries the source quote it came from. Unsupported edges are dashed, and a sampled edge audit reports precision.
- **Grading review queue:** short answers are graded against a rubric with evidence and a confidence score. Uncertain grades wait for review, and instructor–AI agreement (QWK, MAE) is reported.
- **Insights:** weekly question clusters with likely misconceptions, a coverage-gap report, most-asked slides and lecture moments, a confusion heatmap on the lecture timeline, struggling-concept flags with their reasons, an FAQ drafted from student questions, and one-click weekly and term reports (PDF/CSV).
- **Tutor policy controls**, plus a review list of answers students flagged.

## 🛠️ Technology Stack

| Tier      | Technologies |
| --------- | ------------ |
| Frontend  | React 19, Vite, TypeScript, Tailwind CSS, Zustand, React Flow, recharts / nivo |
| Backend   | Python 3.12, FastAPI, Celery (default + `media` queues, beat), Redis, MongoDB (Beanie ODM), JWT auth |
| AI models | Local LLM via Ollama (default Gemma 4 E2B), `all-MiniLM-L6-v2` embeddings, `ms-marco-MiniLM-L-6-v2` cross-encoder, faster-whisper, EasyOCR |
| Data      | Qdrant ≥ 1.10 (dense + BM25 sparse vectors), MongoDB, MinIO (S3 object storage) |

## 🚀 Quick Start (Local Setup)

You need Docker, Python 3.12, Node.js and [Ollama](https://ollama.com) with the configured model pulled. An NVIDIA GPU is recommended for lecture transcription (see [GPU setup](docs/COBBLEAI_2_0.md#gpu-setup-cuda)).

```bash
bash start_cobble.sh
```

The script starts MongoDB, Redis, Qdrant and MinIO in Docker, then the API, the Celery worker, the **media worker** (lecture transcription), the beat scheduler and the Vite dev server. Open `http://localhost:5173`.

Upgrading an existing v1 install? Re-index documents into the v2 collections once:

```bash
cd backend && python -m scripts.migrate_qdrant_v2 --dry-run   # then without --dry-run
```

Tests: `cd backend && python -m pytest` (offline: no services needed) and `cd frontend && npm run build && npx vitest run`.

## 📁 Repository Structure

```text
cobbleAI/
├── backend/
│   ├── app/            # FastAPI app: api/, models/, services/, tasks/ (Celery)
│   ├── eval/           # Evaluation harness: gold sets, configs, metrics, CLI (python -m eval.cli)
│   ├── scripts/        # Migrations and maintenance (migrate_qdrant_v2, export_research_logs, ...)
│   └── tests/          # pytest suite (mongomock, in-memory Qdrant, scripted LLM)
├── frontend/           # React application
├── docs/               # Architecture notes, project report, research appendix
├── docker-compose.yml  # Local infrastructure
└── start_cobble.sh     # One-command local setup
```

## 📜 License

This project is licensed under the [MIT License](LICENSE).
