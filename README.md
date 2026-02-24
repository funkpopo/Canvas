# Canvas — Kubernetes Management Console

Canvas is a monorepo with a Go backend and a Next.js frontend for multi-cluster Kubernetes operations.

## Architecture

- Backend (`backend`): Go + chi + GORM + JWT + Kubernetes client-go
- Frontend (`frontend`): Next.js App Router + React + TypeScript + Tailwind CSS
- Database: SQLite by default, MySQL supported

## Configuration (without `.env`)

Canvas now uses explicit config files instead of `.env` templates:

- Backend: `backend/config/settings.yaml`
- Frontend: `frontend/config/settings.json`

Configuration values are read from config files only. Environment variable overrides are not used.

## Quick Start

### Backend

```bash
cd backend
go mod tidy
go run ./cmd/server
```

Default API endpoint: `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default web endpoint: `http://localhost:3000`

## Notes

- First startup auto-creates admin account: `admin` / `admin123`
- Production config example: `backend/config/settings.production.example.yaml`
- Frontend production config example: `frontend/config/settings.production.example.json`

For Chinese documentation, see `README_zh.md`.
