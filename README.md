# 🎓 Cobble AI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Qdrant](https://img.shields.io/badge/Qdrant-EF3A5D?style=flat&logo=qdrant&logoColor=white)](https://qdrant.tech/)

**Cobble AI** is an advanced AI-powered educational technology platform built for modern academic workflows. It transforms massive course materials (PDF, DOCX, PPTX) into interactive, multi-modal learning experiences, enabling professors to track student progress and students to learn through an adaptive *Socratic AI Tutor*.

---

## ✨ Features

- **🧠 Auto-Generated Concept Maps:** Instantly generate rich 2D and 3D knowledge graphs from any topic or document using LLMs.
- **💬 Socratic AI Tutor:** Embedded chat agents specific to nodes on a concept map. The AI dynamically adapts to user context, acting as a guide without revealing direct answers.
- **📈 Advanced Professor Dashboard:** Monitor deep student analytics, inactive flags, and precise pacing progress across multiple cohorts.
- **⛓️ Robust RAG Pipeline:** Documents are automatically chunked, embedded using `all-MiniLM-L6-v2`, semantically indexed in Qdrant, and retrieved for hyper-accurate LLM responses.
- **🔀 Multi-Modal Learning:** Switch between Teach Mode (Socratic dialogue), Review Mode (Graph Exploration), and Test Mode (Quizzes).

## 🛠️ Technology Stack

Our architecture is split into a scalable **FastAPI** backend and a responsive **React/Zustand** frontend.

| Tier      | Technologies                                                       |
| --------- | ------------------------------------------------------------------ |
| Frontend  | React 18, Vite, TypeScript, TailwindCSS, Zustand, React Flow (2D), force-graph (3D) |
| Backend   | Python 3, FastAPI, Celery, Redis, MongoDB (Beanie ODM), JWT Auth   |
| AI Models | Qwen 3.5 (2B/32B), sentence-transformers, cross-encoder reranking  |
| Data      | Qdrant (Vector DB), MongoDB (Relational DB), MinIO (S3 Object Storage) |

## 🚀 Quick Start (Local Setup)

Getting Cobble AI running locally requires Docker and a working Python 3.10+ environment.

To make setup as easy as possible, we have provided a universal setup script that will check ports, spin up Docker, configure the Python environment, and start the frontend automatically.

```bash
bash start_cobble.sh
```

Once the script completes, navigate to `http://localhost:5173` to access the Cobble AI application.

## 📁 Repository Structure

```text
cobbleAI/
├── backend/            # FastAPI ML Pipeline & REST APIs
├── frontend/           # Primary React User Application
├── designer_frontend/  # Concept Map specific designer UI
├── docker-compose.yml  # Local infrastructure orchestration
└── README.md
```

## 📜 License

This project is licensed under the [MIT License](LICENSE).
