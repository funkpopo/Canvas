# Canvas

Canvas is a lightweight Kubernetes dashboard and ops toolkit. It provides an application-centric, real-time view of your clusters with practical workflows for pods, workloads, services, storage, events, and more. The project consists of a FastAPI backend and a Next.js (React + TypeScript) frontend.

## Features

- Cluster overview with live readiness and pod health
- Nodes, namespaces, workloads (Deployments/StatefulSets/DaemonSets/Jobs/CronJobs)
- Pods: logs streaming, interactive terminal (kubectl exec via WebSocket), YAML
- Services, Ingresses, NetworkPolicies with quick actions
- Storage: classes, PVCs, PVs, and basic PVC browser
- Events feed and recent activity timeline
- CRD discovery and generic resource browser
- Audit trail for select actions
- Optional Helm integration (server-side) for releases and chart search
- Built‑in i18n (English/Chinese) and dark/light themes

## Repository Structure

- `backend/` — FastAPI app, Kubernetes client, SQLite via SQLAlchemy
- `frontend/` — Next.js app (App Router, TypeScript, Tailwind)

## Requirements

- Python 3.11+ (recommended 3.12)
- Node.js 20+ (Next.js 15)
- Access to a Kubernetes cluster (via kubeconfig, token + API server, or in‑cluster)
- Optional: Helm CLI if enabling Helm integration

## Quickstart (Development)

1) Backend

```bash
python -m venv .venv
./.venv/Scripts/activate  # Windows PowerShell
# source .venv/bin/activate  # macOS/Linux
pip install -r backend/requirements.txt

# Start from repo root so the database (./canvas.db) lives at the root.
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

2) Frontend

```bash
cd frontend
npm install
# Optional if backend URL differs from default
set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1  # Windows
# export NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1  # macOS/Linux
npm run dev
```

Open http://localhost:3000

## Configuration

Backend is configured via environment variables (see defaults in `backend/app/config.py`). Common options:

- `APP_ENV` — `development` | `production` | `test` (default: `development`)
- `LOG_LEVEL` — e.g. `INFO`, `DEBUG`
- `ALLOWED_ORIGINS` — CORS origins (JSON list or comma‑separated). Default allows `http://localhost:3000`.
- `DATABASE_URL` — e.g. `sqlite+aiosqlite:///./canvas.db`
- Kubernetes access (choose one):
  - `KUBE_CONFIG_PATH` — path to kubeconfig file
  - `KUBE_CONTEXT` — kubeconfig context to use
  - or configure a cluster in the UI (Clusters → Manage) with API server, token, CA data
  - in‑cluster: service account will be used when deployed in Kubernetes
- Streaming & safety limits:
  - `STREAM_MAX_CONCURRENT_LOGS`, `STREAM_MAX_CONCURRENT_EXEC`, `LOG_STREAM_MAX_SECONDS`, `EXEC_SESSION_MAX_SECONDS`
- Optional secret encryption for saved cluster credentials:
  - `FERNET_KEY` — if set, sensitive fields are encrypted at rest in SQLite.
    Generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- Optional Helm integration:
  - `HELM_ENABLED=true` and `HELM_BINARY=helm`

Frontend:

- `NEXT_PUBLIC_API_BASE_URL` — default `http://localhost:8000/api/v1`

## Running in Production

- Build frontend: `cd frontend && npm run build && npm run start`
- Run backend behind a reverse proxy (e.g., nginx/Traefik) and a process manager:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

Update `ALLOWED_ORIGINS` and TLS/headers at the proxy. The backend exposes WebSockets at:

- `/ws/deployments` — live deployment updates
- `/ws/pods/{namespace}/{name}/exec` — interactive exec sessions

## Data Storage

- Default SQLite at `./canvas.db` (relative to working directory). To keep the DB at the repo root, start uvicorn from the root and pass `--app-dir backend`.

## Security Notes

- Set `FERNET_KEY` in production to encrypt tokens and kubeconfig data at rest.
- Limit exec and log streaming via the provided env limits.
- Carefully enable Helm only if the server host is trusted.

