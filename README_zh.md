# Canvas — Kubernetes 管理控制台

一个包含 Go 后端与 Next.js 前端的单仓库（monorepo）。支持多集群管理、Kubernetes 资源浏览、RBAC、任务与存储操作、指标与告警等能力。

## 概览

- 后端（`backend`）：Go（chi + GORM + JWT + Kubernetes client）
- 前端（`frontend`）：Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Radix UI
- 数据：默认 SQLite（也支持 MySQL）

## 快速开始

### 依赖

- Go 1.26+
- Node.js 20+ 与 npm（或 yarn/pnpm）

### 启动后端（API）

```bash
cd backend
go mod tidy
go run ./cmd/server
# API: http://localhost:8000
```

说明：
- 首次启动会自动创建默认管理员：`admin` / `admin123`。
- 默认 CORS 已包含 `http://localhost:3000`。
- 默认使用 SQLite；如需自定义请设置 `SQLITE_DB_PATH`。

常用环境变量：
- `HOST`, `APP_PORT`, `BACKEND_PORT`
- `DATABASE_TYPE`（`sqlite` 或 `mysql`）
- `SQLITE_DB_PATH`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- `JWT_SECRET_KEY` / `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `CORS_ORIGINS`
- `DEFAULT_ADMIN_PASSWORD`

### 启动前端（Web）

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

## 迁移说明

- 原 Python 后端已完成迁移并由 Go 后端完全替代。
- 迁移过程与完成清单见：`plan.md`。

---

英文版说明见：`README.md`。
