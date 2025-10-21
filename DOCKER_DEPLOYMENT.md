# Canvas Docker部署指南

## 概述

Canvas Kubernetes Management Console支持Docker容器化部署，提供完整的开发和生产环境配置。

## 架构

- **后端**: FastAPI + SQLite/MySQL
- **前端**: Next.js（内置服务器 + API代理）
- **数据库**: SQLite（默认）或 MySQL 8.0
- **缓存**: Redis（可选）

### Next.js API代理

前端通过Next.js内置的`rewrites`功能代理所有`/api/*`请求到后端服务，无需额外反向代理层。这种设计简化了部署架构并提高了性能。

## 快速开始

### 开发环境

1. **使用SQLite（默认）**:
   ```bash
   docker-compose up --build
   ```

2. **使用MySQL**:
   ```bash
   docker-compose --profile mysql up --build
   ```

3. **包含Redis缓存**:
   ```bash
   docker-compose --profile mysql --profile redis up --build
   ```

### 生产环境

1. **设置环境变量**:
   ```bash
   cp .env.docker.example .env
   # 编辑 .env 文件设置数据库密码等
   ```

2. **启动生产环境**:
   ```bash
   docker-compose -f docker-compose.prod.yml up --build -d
   ```

## 服务说明

### 开发环境 (docker-compose.yml)

| 服务 | 端口 | 说明 |
|------|------|------|
| backend | 8000 | FastAPI后端API |
| frontend | 3000 | Next.js前端（内置服务器） |
| mysql | 3306 | MySQL数据库（profile: mysql） |
| redis | 6379 | Redis缓存（profile: redis） |

### 生产环境 (docker-compose.prod.yml)

| 服务 | 端口 | 说明 |
|------|------|------|
| backend | - | FastAPI后端服务 |
| frontend | 3000 | Next.js前端服务（内置服务器） |
| mysql | - | MySQL数据库 |
| redis | - | Redis缓存 |

## 环境变量

### 数据库配置

```bash
# SQLite（默认）
DATABASE_TYPE=sqlite

# MySQL
DATABASE_TYPE=mysql
DATABASE_HOST=mysql
DATABASE_PORT=3306
DATABASE_NAME=canvas
DATABASE_USER=canvas
DATABASE_PASSWORD=your_password
```

### CORS配置

```bash
CORS_ORIGINS=http://localhost:3000,http://frontend:3000
```

注意：由于前端通过Next.js代理访问后端API，CORS配置主要用于开发环境或直接API访问。

## 数据持久化

### SQLite
- 数据库文件挂载到 `./backend/canvas.db`
- 支持开发和生产环境

### MySQL
- 数据卷: `mysql_data`
- 自动创建数据库和用户
- 支持备份和恢复

## 访问应用

- **开发环境**: http://localhost:3000 (前端，通过Next.js代理访问后端API)
- **生产环境**: http://localhost:3000 (前端，通过Next.js代理访问后端API)

## 默认用户

- **用户名**: admin
- **密码**: admin123

## 备份和恢复

### SQLite备份
```bash
# 停止服务
docker-compose down

# 备份数据库文件
cp backend/canvas.db backup/canvas.db

# 恢复
cp backup/canvas.db backend/canvas.db
```

### MySQL备份
```bash
# 备份
docker exec canvas-mysql-prod mysqldump -u canvas -p canvas > backup.sql

# 恢复
docker exec -i canvas-mysql-prod mysql -u canvas -p canvas < backup.sql
```

## 故障排除

### 常见问题

1. **端口冲突**
   - 修改 `docker-compose.yml` 中的端口映射

2. **数据库连接失败**
   - 检查环境变量配置
   - 确认MySQL服务已启动

3. **前端无法访问API**
   - 检查CORS配置
   - 确认后端服务健康状态

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 服务健康检查

```bash
# 后端健康检查
curl http://localhost:8000/health

# 前端健康检查（通过Next.js代理）
curl http://localhost:3000/api/health
```

## 自定义配置

### 添加SSL证书

对于生产环境，建议在前端服务器或负载均衡器层面配置SSL，而不是在Next.js应用层面。

### 修改Next.js配置

- 编辑 `frontend/next.config.ts` 中的API代理配置
- 重启前端服务: `docker-compose restart frontend`

## 性能优化

### 生产环境建议

1. **资源限制**: 在compose文件中添加资源限制
2. **日志轮转**: 配置Next.js应用的日志轮转
3. **监控**: 添加Prometheus和Grafana监控
4. **备份**: 设置定期数据库备份

### 扩展建议

1. **负载均衡**: 添加多个后端实例
2. **数据库集群**: 使用MySQL主从复制
3. **缓存集群**: Redis集群部署
4. **CDN**: 前端静态资源CDN加速
