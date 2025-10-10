# Canvas — Kubernetes Management Console

A monorepo for a lightweight Kubernetes management console with a FastAPI backend and a Next.js (App Router) frontend. It lets you add/manage multiple clusters, browse nodes/pods/namespaces/deployments/storage, and view dashboard stats. Authentication uses JWT with a seeded admin user for local development.

## Overview

- Backend (`backend`): FastAPI + SQLAlchemy (SQLite) + Kubernetes Python client
- Frontend (`frontend`): Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Radix UI
- Data: SQLite database (auto-created on first run); default admin seeded

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+ and npm (or yarn/pnpm)

### Backend (API)

```bash
cd backend
# optional: python -m venv .venv && source .venv/bin/activate (Linux/Mac)
#           python -m venv .venv && .venv\Scripts\activate    (Windows)
pip install -r requirements.txt
python run.py
# API at http://localhost:8000 , docs at http://localhost:8000/docs
```

Notes:
- Default admin user is created on first run: `admin` / `admin123`.
- CORS allows `http://localhost:3000` by default (see `backend/app/main.py`).
- The SQLite path is relative to the working directory. Run from `backend/` so the DB lives at `backend/canvas.db`.
- Change `SECRET_KEY` in `backend/app/auth.py` for production use.

### Frontend (Web)

```bash
cd frontend
npm install
npm run dev
# App at http://localhost:3000
```

---

For a Chinese version of this document, see: `README_zh.md`.

