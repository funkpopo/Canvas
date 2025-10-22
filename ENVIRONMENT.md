# 环境配置说明

本文档说明如何在不同环境中配置Canvas项目，包括开发环境和生产环境的设置。

## 文件说明

- **.env.example**: 环境变量模板文件，包含所有可配置项的说明
- **.env**: 开发环境配置文件（已配置SQLite + 无Redis）
- **.env.prod**: 生产环境配置文件示例（已配置MySQL + Redis）

## 环境要求

### 开发环境
- **数据库**: SQLite（无需额外安装）
- **缓存**: 不使用Redis
- **配置**: 复制 \.env.example\ 为 \.env\ 并修改相应配置

### 生产环境/Docker部署
- **数据库**: MySQL 8.0+
- **缓存**: Redis 7.0+
- **配置**: 复制 \.env.prod\ 为生产环境的配置文件

## 快速开始

### 开发环境

1. 复制环境配置文件：
   ```bash
   cp .env.example .env
   ```

2. 启动开发服务器：
   ```bash
   cd backend
   python run.py
   ```

### Docker生产环境

1. 复制生产环境配置：
   ```bash
   cp .env.prod .env.production
   ```

2. 修改生产环境的敏感配置（如数据库密码、JWT密钥等）

3. 使用生产环境配置启动：
   ```bash
   docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```
## 环境变量说明

### 数据库配置
- \DATABASE_TYPE\: 数据库类型 (sqlite/mysql)
- \DATABASE_HOST\: 数据库主机
- \DATABASE_PORT\: 数据库端口
- \DATABASE_NAME\: 数据库名
- \DATABASE_USER\: 数据库用户名
- \DATABASE_PASSWORD\: 数据库密码

### Redis配置
- \REDIS_ENABLED\: 是否启用Redis (true/false)
- \REDIS_HOST\: Redis主机
- \REDIS_PORT\: Redis端口
- \REDIS_PASSWORD\: Redis密码
- \REDIS_DB\: Redis数据库编号

### 安全配置
- \JWT_SECRET_KEY\: JWT签名密钥（生产环境必须修改）
- \JWT_ACCESS_TOKEN_EXPIRE_MINUTES\: JWT过期时间（分钟）
- \SESSION_SECRET_KEY\: 会话密钥（生产环境必须修改）

### 应用配置
- \ENVIRONMENT\: 环境标识 (development/production)
- \APP_PORT\: 应用端口
- \API_URL\: API基础URL
- \CORS_ORIGINS\: 允许的CORS源，用逗号分隔
- \LOG_LEVEL\: 日志级别 (DEBUG/INFO/WARNING/ERROR)
- \DEBUG\: 调试模式 (true/false)

## 注意事项

1. **安全**: 生产环境必须修改所有默认密码和密钥
2. **备份**: 重要配置文件请妥善备份
3. **版本控制**: 不要将包含敏感信息的 \.env\ 文件提交到版本控制系统
4. **权限**: 确保配置文件有正确的读写权限

## 故障排除

### 环境变量不生效
- 确保 \.env\ 文件在项目根目录
- 检查文件权限
- 重启应用服务器

### 数据库连接失败
- 检查数据库服务是否运行
- 验证连接参数
- 检查防火墙设置

### Redis连接失败
- 确认Redis服务状态
- 检查网络连接
- 验证认证信息
