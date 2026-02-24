# Canvas — Kubernetes 管理控制台

Canvas 是一个前后端同仓项目：Go 后端 + Next.js 前端，用于多集群 Kubernetes 管理。

## 架构概览

- 后端（`backend`）：Go + chi + GORM + JWT + Kubernetes client-go
- 前端（`frontend`）：Next.js App Router + React + TypeScript + Tailwind CSS
- 数据库：默认 SQLite，支持 MySQL

## 配置方式

项目已改为使用显式配置文件：

- 后端配置：`backend/config/settings.yaml`
- 前端配置：`frontend/config/settings.json`

配置项仅从配置文件读取，不再支持环境变量覆盖。

## 快速启动

### 启动后端

```bash
cd backend
go mod tidy
go run ./cmd/server
```

默认地址：`http://localhost:8000`

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 说明

- 首次启动会自动创建管理员账号：`admin` / `admin123`
- 后端生产配置示例：`backend/config/settings.production.example.yaml`
- 前端生产配置示例：`frontend/config/settings.production.example.json`

英文文档见 `README.md`。
