# Canvas — Kubernetes 管理控制台

一个包含 FastAPI 后端与 Next.js 前端的单仓库（monorepo）。用于管理多个 Kubernetes 集群，支持查看节点、命名空间、Pod、Deployment、存储等资源，并提供仪表盘统计。认证基于 JWT，本地开发会自动创建默认管理员用户。

## 概览

- 后端（`backend`）：FastAPI + SQLAlchemy（SQLite）+ Kubernetes Python client
- 前端（`frontend`）：Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Radix UI
- 数据：SQLite（首次运行自动创建）；默认管理员自动初始化

## 快速开始

### 依赖

- Python 3.12+
- Node.js 20+ 与 npm（或 yarn/pnpm）

### 启动后端（API）

```bash
cd backend
# 可选：python -m venv .venv && source .venv/bin/activate（Linux/Mac）
#       python -m venv .venv && .venv\Scripts\activate（Windows）
pip install -r requirements.txt
python run.py
# API: http://localhost:8000 ，文档: http://localhost:8000/docs
```

注意：
- 首次启动会创建默认管理员：`admin` / `admin123`。
- 默认 CORS 允许 `http://localhost:3000`（见 `backend/app/main.py`）。
- SQLite 路径相对当前工作目录，建议从 `backend/` 目录运行，数据库文件为 `backend/canvas.db`。
- 生产环境请修改 `backend/app/auth.py` 中的 `SECRET_KEY`。

### 启动前端（Web）

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

## 生产建议

- 使用 Alembic 做迁移，避免启动时直接 `create_all`。
- 将卷文件浏览改为真实且可审计的实现。
- 为前后端增加 Dockerfile 与 CI/CD。
- 增加测试（单元/集成）与 Lint。

---

英文版说明见：`README.md`。

