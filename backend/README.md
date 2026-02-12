# Canvas Backend (Go)

This directory is the production backend for Canvas.

## Stack

- Router: `chi`
- ORM: `GORM` (SQLite/MySQL)
- Auth: JWT access token + refresh token
- Kubernetes: `client-go`

## Run

```bash
cd backend
go mod tidy
go run ./cmd/server
```

Default address: `http://localhost:8000`.

## Configuration

Environment variables:

- `HOST`, `APP_PORT`, `BACKEND_PORT`
- `DATABASE_TYPE` (`sqlite` or `mysql`)
- `SQLITE_DB_PATH`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- `JWT_SECRET_KEY` / `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `CORS_ORIGINS`
- `DEFAULT_ADMIN_PASSWORD`

## Implemented API Scope

- System: `/`, `/health`
- Auth / Users / Clusters / Stats
- Permissions / Audit Logs / WebSocket stats
- Kubernetes resources: nodes, namespaces, pods, deployments, services, configmaps, secrets,
  resource-quotas, network-policies, events, jobs, storage
- Workloads: cronjobs, daemonsets, statefulsets, HPAs, ingresses
- RBAC and Metrics (including metrics-server installation)
- Alerts (rules/events/stats)
- Monitoring stats (`/api/monitoring/stats`)

## Notes

- Default admin user is auto-created on first startup: `admin` / `admin123`.
- Migration record is maintained in the repository root `plan.md`.
