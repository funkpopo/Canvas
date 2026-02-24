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

Primary config file:

- `backend/config/settings.yaml`

Production example:

- `backend/config/settings.production.example.yaml`

All runtime configuration is loaded from config files only.

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
