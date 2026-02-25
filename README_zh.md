# Canvas

一个面向多集群场景的 Kubernetes 管理控制台，采用 Go 后端 + Next.js 前端，覆盖日常运维的核心链路。

[English README](README.md)

## 为什么选择 Canvas

Canvas 重点解决“日常可用”的运维体验：

- 一个控制台统一管理集群、工作负载、网络、存储与权限
- 按角色收敛操作边界（管理员与只读用户视角清晰）
- 后端 API 与前端交互模型统一，便于二次集成

## 主要功能总览

| 功能域 | 核心能力 |
| --- | --- |
| 集群管理 | 新增/编辑/删除集群，切换活跃集群，连通性测试，支持 `kubeconfig` 与 `token` 两种认证方式 |
| 工作负载 | 管理 Pods、Deployments、StatefulSets、DaemonSets、Jobs、CronJobs、HPA，支持扩缩容、重启、删除与 YAML 操作 |
| 网络资源 | 管理 Services、Ingresses、NetworkPolicies，查看 Events 事件 |
| 配置管理 | 管理 ConfigMaps、Secrets、ResourceQuotas |
| 存储管理 | 管理 StorageClasses、PV、PVC，并支持持久卷文件浏览与内容读取 |
| 安全与权限 | JWT 访问/刷新令牌、用户管理、集群级与命名空间级授权、Kubernetes RBAC 浏览 |
| 运维治理 | 审计日志、告警规则/事件、metrics-server 健康检查与安装、集群/节点指标接口 |
| 控制台体验 | Dashboard 总览、集群选择器、中英文切换、主题切换、WebSocket 状态与轮询降级 |

## 技术栈

### 后端（`backend/`）

- Go 1.25+
- chi 路由与中间件体系
- GORM（SQLite / MySQL）
- JWT 鉴权与刷新令牌持久化
- Kubernetes `client-go` + Gorilla WebSocket

### 前端（`frontend/`）

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS 4 + Radix UI / shadcn 风格组件
- TanStack Query + Zustand
- 内置 API rewrite 代理与运行时 JSON 配置

## 架构流程（简版）

1. 浏览器向 Next.js 发起 `/api/*` 请求。
2. Next.js 通过 rewrite 将请求转发到 Go 后端（由 `frontend/config/settings.json` 控制）。
3. Go 后端完成鉴权、权限校验，并访问 Kubernetes API 与本地数据库。
4. 前端基于统一响应结构渲染列表、详情与操作反馈。

## 目录结构

```text
Canvas/
├─ backend/                  # Go API 服务
│  ├─ cmd/server/            # 启动入口
│  ├─ config/                # 运行时 YAML 配置
│  └─ internal/              # handlers、middleware、models、k8s 服务
├─ frontend/                 # Next.js Web 控制台
│  ├─ app/(dashboard)/       # 主要功能页面
│  ├─ components/            # 通用组件与表单
│  ├─ config/                # 运行时 JSON 配置
│  └─ lib/                   # API 客户端、鉴权/集群状态、工具函数
├─ README.md
└─ README_zh.md
```

## 快速开始

### 1）环境要求

- Go `1.25+`
- Node.js `20+` 与 npm
- 后端所在机器可访问 Kubernetes API Server

### 2）配置后端

编辑 `backend/config/settings.yaml`，重点关注：

- server 监听地址与端口
- 数据库类型（`sqlite` 或 `mysql`）
- JWT 密钥与默认管理员密码
- CORS 允许来源

生产配置参考：`backend/config/settings.production.example.yaml`

### 3）配置前端

编辑 `frontend/config/settings.json`，重点关注：

- `apiBasePath`（通常为 `/api`）
- `apiProxyTarget`（Next rewrite 目标后端地址）
- 可选 `websocket.url` / `websocket.port`

生产配置参考：`frontend/config/settings.production.example.json`

### 4）启动后端

```bash
cd backend
go mod tidy
go run ./cmd/server
```

默认地址：`http://localhost:8000`

### 5）启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:3000`

### 6）首次登录

首次启动会自动创建管理员账号：

- 用户名：`admin`
- 密码：`admin123`（或配置中的 `default_admin_password`）

## Docker 部署

### 1）准备环境变量

```bash
cp .env.example .env
```

`.env` 重点配置：

- `DB_TYPE=sqlite` 或 `DB_TYPE=mysql`（选择数据库模式）
- `FRONTEND_PORT`、`BACKEND_PORT`、`MYSQL_PORT`（宿主机端口映射）
- 使用 MySQL 时配置 `MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`

### 2）使用 SQLite（默认）

```bash
docker compose up -d --build
```

### 3）使用 MySQL

可任选一种方式：

```bash
docker compose --profile mysql up -d --build
```

或者在 `.env` 里设置 `COMPOSE_PROFILES=mysql`，再执行：

```bash
docker compose up -d --build
```

### 4）说明

- 后端容器启动时会根据环境变量动态写入 `backend/config/settings.yaml`。
- 修改 `BACKEND_PORT` 后请重新构建（`--build`），以更新前端 WebSocket 端口配置。

## 前端常用脚本

在 `frontend/` 目录下执行：

- `npm run dev`：开发模式
- `npm run build`：生产构建
- `npm run start`：启动生产包
- `npm run lint`：代码检查并自动修复
- `npm run type-check`：TypeScript 类型检查
- `npm run format`：代码格式化

## 后端 API 能力（高层）

- 系统：`/`、`/health`
- 鉴权：登录、刷新、当前用户、登出
- 用户与权限：用户管理、集群/命名空间授权
- 集群资源：nodes、namespaces、pods、deployments、services、configmaps、secrets
- 策略与配额：resource quotas、network policies、RBAC
- 工作负载：jobs、cronjobs、daemonsets、statefulsets、HPA、ingress
- 运维能力：audit logs、alerts、metrics、monitoring stats、WebSocket stats

## 生产部署检查清单

上线前建议至少完成以下项：

1. 修改 `jwt_secret_key` 与默认管理员密码。
2. 收紧 CORS 来源。
3. 使用 MySQL（可选，但更适合多用户生产环境）。
4. 使用 HTTPS，并配置 `wss://` WebSocket 地址。
5. 复核 Kubernetes RBAC 与应用内用户权限策略。

## 许可证

本项目遵循 MIT 许可条款。
