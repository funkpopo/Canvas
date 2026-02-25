# Canvas

A full-stack Kubernetes management console for multi-cluster operations, built with a Go backend and a Next.js frontend.

[中文文档](README_zh.md)

## Why Canvas

Canvas focuses on a practical operator workflow:

- One console for clusters, workloads, networking, storage, and access control
- Clean UI with role-aware operations (admin vs. viewer)
- Backend APIs designed for automation and UI consistency

## Feature Overview

| Domain | Core capabilities |
| --- | --- |
| Cluster Management | Add/edit/delete clusters, switch active cluster, test endpoint reachability, support `kubeconfig` and `token` auth modes |
| Workloads | Manage Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, HPAs; support scale/restart/delete and YAML-based operations |
| Networking | Manage Services, Ingresses, NetworkPolicies; inspect cluster Events |
| Configuration | Manage ConfigMaps, Secrets, ResourceQuotas |
| Storage | Manage StorageClasses, PVs, PVCs; browse and read files from persistent volumes |
| Security & Access | JWT access/refresh tokens, user management, cluster/namespace-level permission assignment, Kubernetes RBAC browsing |
| Ops & Governance | Audit logs, alert rules/events, metrics-server health check and installation, cluster/node metrics APIs |
| Dashboard UX | Web dashboard, cluster selector, EN/ZH i18n, theme switch, WebSocket connection state with polling fallback |

## Tech Stack

### Backend (`backend/`)

- Go 1.25+
- chi (routing) + middleware stack
- GORM (SQLite/MySQL)
- JWT auth + refresh token persistence
- Kubernetes `client-go` + Gorilla WebSocket

### Frontend (`frontend/`)

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Radix UI/shadcn-style components
- TanStack Query + Zustand
- Built-in API rewrite proxy and runtime JSON config

## Architecture at a Glance

1. Browser requests `/api/*` from Next.js.
2. Next.js rewrites these calls to the Go backend (configurable via `frontend/config/settings.json`).
3. Go backend authenticates requests, enforces permissions, and talks to Kubernetes APIs and local DB.
4. UI receives normalized JSON responses for list/detail/action flows.

## Repository Structure

```text
Canvas/
├─ backend/                  # Go API server
│  ├─ cmd/server/            # entrypoint
│  ├─ config/                # runtime YAML config
│  └─ internal/              # handlers, middleware, models, k8s service
├─ frontend/                 # Next.js web app
│  ├─ app/(dashboard)/       # major feature pages
│  ├─ components/            # reusable UI and forms
│  ├─ config/                # runtime JSON config
│  └─ lib/                   # API client, auth/cluster state, utilities
├─ README.md
└─ README_zh.md
```

## Quick Start

### 1) Prerequisites

- Go `1.25+`
- Node.js `20+` and npm
- Kubernetes cluster API endpoints reachable from the backend host

### 2) Configure backend

Edit `backend/config/settings.yaml`:

- server host/port
- database type (`sqlite` or `mysql`)
- JWT secret and default admin password
- allowed CORS origins

For production reference: `backend/config/settings.production.example.yaml`

### 3) Configure frontend

Edit `frontend/config/settings.json`:

- `apiBasePath` (usually `/api`)
- `apiProxyTarget` (backend API target for Next rewrites)
- optional `websocket.url` / `websocket.port`

For production reference: `frontend/config/settings.production.example.json`

### 4) Run backend

```bash
cd backend
go mod tidy
go run ./cmd/server
```

Backend default: `http://localhost:8000`

### 5) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default: `http://localhost:3000`

### 6) Login

On first startup, Canvas auto-creates an admin account:

- Username: `admin`
- Password: `admin123` (or the value from `default_admin_password`)

## Docker Deployment

### 1) Prepare environment variables

```bash
cp .env.example .env
```

Key fields in `.env`:

- `DB_TYPE=sqlite` or `DB_TYPE=mysql` (choose database mode)
- `FRONTEND_PORT`, `BACKEND_PORT`, `MYSQL_PORT` (host ports)
- MySQL credentials (`MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`) when using MySQL

### 2) Start with SQLite (default)

```bash
docker compose up -d --build
```

### 3) Start with MySQL

Use either of these:

```bash
docker compose --profile mysql up -d --build
```

or set `COMPOSE_PROFILES=mysql` in `.env`, then run:

```bash
docker compose up -d --build
```

### 4) Notes

- Backend image writes `backend/config/settings.yaml` on startup from container env vars.
- If you change `BACKEND_PORT`, rebuild (`--build`) so frontend WebSocket config is regenerated.

## Frontend Scripts

Run in `frontend/`:

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run start` - start built app
- `npm run lint` - lint and auto-fix
- `npm run type-check` - TypeScript checking
- `npm run format` - format project files

## Backend API Scope (High-Level)

- System: `/`, `/health`
- Auth: login, refresh, profile, logout
- Users & permissions: users, cluster/namespace grants
- Cluster resources: nodes, namespaces, pods, deployments, services, configmaps, secrets
- Policy & quotas: resource quotas, network policies, RBAC
- Workloads: jobs, cronjobs, daemonsets, statefulsets, HPAs, ingresses
- Ops: audit logs, alerts, metrics, monitoring stats, WebSocket stats

## Production Checklist

Before deploying to production:

1. Change `jwt_secret_key` and admin default password.
2. Set strict CORS origins.
3. Use MySQL (optional but recommended for multi-user production).
4. Put frontend/backend behind HTTPS and configure `wss://` WebSocket URL.
5. Review RBAC and app-level user permissions.

## License

This project is licensed under the terms of MIT.
