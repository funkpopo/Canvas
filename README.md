# Canvas — Kubernetes Management Console

A monorepo for a lightweight Kubernetes management console with a Go backend and a Next.js (App Router) frontend. It supports multi-cluster management, Kubernetes resource browsing, RBAC, jobs/storage operations, metrics, and alerts.

## Overview

- Backend (`backend`): Go (chi + GORM + JWT + Kubernetes client)
- Frontend (`frontend`): Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Radix UI
- Data: SQLite (default) or MySQL

## Getting Started

### Prerequisites

- Go 1.26+
- Node.js 20+ and npm (or yarn/pnpm)

### Backend (API)

```bash
cd backend
go mod tidy
go run ./cmd/server
# API at http://localhost:8000
```

Notes:
- Default admin user is auto-created on first run: `admin` / `admin123`.
- Default CORS includes `http://localhost:3000`.
- SQLite is used by default; set `SQLITE_DB_PATH` if needed.

Common environment variables:
- `HOST`, `APP_PORT`, `BACKEND_PORT`
- `DATABASE_TYPE` (`sqlite` or `mysql`)
- `SQLITE_DB_PATH`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- `JWT_SECRET_KEY` / `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `CORS_ORIGINS`
- `DEFAULT_ADMIN_PASSWORD`

### Frontend (Web)

```bash
cd frontend
npm install
npm run dev
# App at http://localhost:3000
```

## Migration Notes

- Python backend has been fully replaced by Go backend.
- Migration execution log and completion checklist: `plan.md`.

---

For a Chinese version of this document, see: `README_zh.md`.
