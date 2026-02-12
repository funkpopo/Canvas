# Canvas Python -> Go 迁移计划（已完成）

## 目标
- 将原 `backend/` 中基于 FastAPI 的实现迁移为 Go 实现。
- 保持前端 `frontend/` 的 API 调用路径不变（继续使用 `/api/*`）。
- 在迁移完成后下线 Python 后端并完成目录切换。

## 迁移原则
1. **先框架后业务**：先完成 Go 基础设施，再迁移业务路由。
2. **接口兼容优先**：保持 URL、请求字段与主要响应结构兼容。
3. **可分阶段验证**：每阶段完成后均可编译与运行验证。
4. **最终统一切流**：完成全部迁移后删除 Python 后端并重命名目录。

## 阶段执行结果

### Phase 1：Go 后端骨架
- [x] 新建 Go 工程结构与模块定义
- [x] 接入配置加载、日志、CORS、请求 ID、中间件
- [x] 接入数据库（SQLite/MySQL）与基础模型迁移
- [x] 保持基础健康接口：`/`、`/health`

### Phase 2：认证与用户管理
- [x] 迁移 JWT 鉴权与刷新令牌
- [x] 迁移 `auth` 核心接口（`login/register/refresh/me/verify-token`）
- [x] 迁移 `users` 管理接口
- [x] 兼容历史密码格式（passlib scrypt/bcrypt）

### Phase 3：集群管理与首页统计
- [x] 迁移 `clusters`（CRUD、activate、test-connection）
- [x] 迁移 `stats/dashboard`

### Phase 4：K8s 资源路由迁移
- [x] 迁移 `nodes/namespaces/pods/deployments/services`
- [x] 迁移 `configmaps/secrets/resource-quotas/network-policies/events`
- [x] 迁移 `jobs/storage`
- [x] 迁移 `cronjobs/daemonsets/statefulsets/hpas/ingresses`

### Phase 5：高级能力迁移
- [x] 迁移 `permissions/rbac/audit_logs`
- [x] 迁移 `metrics`（health/cluster/node/install metrics-server）
- [x] 迁移 `alerts`（rules/events/stats）
- [x] 迁移 `monitoring/stats`
- [x] 保留 `websocket stats` 接口（`/api/ws/stats`）

### Phase 6：切流与下线 Python
- [x] 更新默认后端为 Go，并同步文档
- [x] 删除原有 Python `backend/`
- [x] 将 `backend-go/` 重命名为 `backend/`

## 本轮实施清单
- [x] 补齐前端使用的剩余 API 路由并接入主路由
- [x] 修复新增 handlers 的编译问题并统一 `gofmt`
- [x] 完成告警模块（alerts）Go 实现
- [x] 完成目录切换（删除旧 backend + 重命名）

## 验证记录
- 已在迁移后的目录 `backend/` 执行：
  - `go mod tidy`
  - `go build ./...`
- 编译通过，Go 后端可作为唯一后端运行。
- 仍建议执行端到端联调：前端关键页面回归 + 真实 Kubernetes 集群读写验证。
