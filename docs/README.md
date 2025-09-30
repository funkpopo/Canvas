# Canvas Kubernetes — Quick Start

This guide helps you connect a cluster, stream Pod logs, and open an interactive terminal.

## Prerequisites
- Backend: Python 3.11+, `pip install -r backend/requirements.txt`
- Frontend: Node 20+, `npm install` in `frontend`
- A reachable Kubernetes cluster (kubeconfig or API server + token)

## Run locally
- Backend
  - Set optional `FERNET_KEY` to encrypt secrets at rest:
    - `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
  - `cd backend`
  - `uvicorn app.main:app --reload`
- Frontend
  - `cd frontend`
  - `npm run dev`
  - Env vars (optional):
    - `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000/api/v1`)
    - `NEXT_PUBLIC_WS_BASE_URL` (default `ws://localhost:8000`)

## Connect a cluster
1. Open `/clusters/manage` in the UI.
2. Provide either:
   - Inline kubeconfig, or
   - API server, Bearer token, and optional CA data.
3. Save, then open the Dashboard or Pods.

## Pods — Logs & Terminal
- Navigate to Pods, select a Pod to open the detail page.
- Logs tab:
  - Streams container logs with optional follow/tail/since.
- Terminal tab:
  - Interactive `/bin/sh` session via WebSocket.
  - Requires the container image to include a shell.

## Security
- If `FERNET_KEY` is set, `ClusterConfig.kubeconfig`, `token`, and `certificate_authority_data` are encrypted at rest.
- Migrate any existing records: `python -m app.scripts.encrypt_existing`.

## Notes
- WebSocket endpoints:
  - Deployments feed: `/ws/deployments`
  - Pod exec: `/ws/pods/{namespace}/{name}/exec?container=NAME&cmd=/bin/sh`
- Logs endpoint:
  - `GET /api/v1/pods/{ns}/{name}/logs?container=&follow=&tailLines=&sinceSeconds=`

