# Canvas

Canvas 是一个轻量级的 Kubernetes 仪表盘与运维工具包。它提供面向应用的实时集群视图，覆盖 Pods、工作负载、服务、存储、事件等常用场景。项目包含 FastAPI 后端与 Next.js（React + TypeScript）前端。

## 功能特性

- 集群总览：节点就绪率、Pod 健康度等
- 节点、命名空间、工作负载（Deployment/StatefulSet/DaemonSet/Job/CronJob）
- Pod：日志流、交互式终端（通过 WebSocket 的 kubectl exec）、YAML 查看
- 服务、Ingress、NetworkPolicy 快捷操作
- 存储：StorageClass、PVC、PV 与基础 PVC 浏览
- 实时事件流与近期活动时间线
- CRD 发现与通用资源浏览
- 关键操作审计
- 可选 Helm 集成（服务端）用于 Release 管理与 Chart 搜索
- 内置中英文与明暗主题

## 仓库结构

- `backend/` — FastAPI 应用、Kubernetes 客户端、SQLite（SQLAlchemy）
- `frontend/` — Next.js 应用（App Router、TypeScript、Tailwind）

## 环境要求

- Python 3.11+（推荐 3.12）
- Node.js 20+（Next.js 15）
- 可访问的 Kubernetes 集群（kubeconfig、API Server + Token，或集群内运行）
- 可选：如启用 Helm 集成需安装 Helm CLI

## 快速开始（开发）

1）后端

```bash
python -m venv .venv
./.venv/Scripts/activate  # Windows PowerShell
# source .venv/bin/activate  # macOS/Linux
pip install -r backend/requirements.txt

# 从仓库根目录启动，数据库将位于 ./canvas.db
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

2）前端

```bash
cd frontend
npm install
# 如后端地址不同请设置
set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1  # Windows
# export NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1  # macOS/Linux
npm run dev
```

打开 http://localhost:3000

## 配置说明

后端通过环境变量配置（默认值见 `backend/app/config.py`）：

- `APP_ENV` — `development` | `production` | `test`（默认 `development`）
- `LOG_LEVEL` — 如 `INFO`、`DEBUG`
- `ALLOWED_ORIGINS` — CORS 允许来源（JSON 列表或逗号分隔）；默认允许 `http://localhost:3000`
- `DATABASE_URL` — 例如 `sqlite+aiosqlite:///./canvas.db`
- Kubernetes 访问（任选其一）：
  - `KUBE_CONFIG_PATH` — kubeconfig 文件路径
  - `KUBE_CONTEXT` — kubeconfig 的 context 名称
  - 或在前端 UI（Clusters → Manage）保存：API Server、Token、CA 数据
  - 集群内部署：将优先使用 ServiceAccount
- 流式与安全限制：
  - `STREAM_MAX_CONCURRENT_LOGS`、`STREAM_MAX_CONCURRENT_EXEC`、`LOG_STREAM_MAX_SECONDS`、`EXEC_SESSION_MAX_SECONDS`
- 敏感信息加密（可选）：
  - `FERNET_KEY` — 设置后，凭据将以加密形式存储在 SQLite 中。
    生成命令：`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- Helm 集成（可选）：
  - `HELM_ENABLED=true` 与 `HELM_BINARY=helm`

前端：

- `NEXT_PUBLIC_API_BASE_URL` — 默认 `http://localhost:8000/api/v1`

## 生产部署

- 构建前端：`cd frontend && npm run build && npm run start`
- 后端建议置于反向代理（nginx/Traefik 等）之后并由进程管理器托管：

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

在代理层更新 `ALLOWED_ORIGINS` 与 TLS/安全头配置。后端提供以下 WebSocket：

- `/ws/deployments` — 实时部署更新
- `/ws/pods/{namespace}/{name}/exec` — 交互式终端会话

## 数据存储

- 默认 SQLite 位于 `./canvas.db`（相对当前工作目录）。若希望固定在仓库根目录，请从根目录启动并使用 `--app-dir backend`。

## 安全提示

- 生产环境务必设置 `FERNET_KEY` 以加密保存的凭据。
- 使用环境变量限制 exec 与日志流的并发和持续时间。
- 启用 Helm 集成前请确保后端主机受信任。

