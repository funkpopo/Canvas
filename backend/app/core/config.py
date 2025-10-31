"""
Core configuration module for Canvas application.
统一管理环境变量和应用配置
"""
import os
from typing import List, Optional
from functools import lru_cache


class Settings:
    """应用配置类"""

    # 应用基础配置
    APP_NAME: str = "Canvas Kubernetes Management API"
    APP_VERSION: str = "1.0.0"
    APP_DESCRIPTION: str = "Kubernetes集群管理后端API"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # 服务器配置
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("APP_PORT", os.getenv("BACKEND_PORT", "8000")))

    # JWT配置
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here-change-in-production")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    SESSION_SECRET_KEY: str = os.getenv("SESSION_SECRET_KEY", SECRET_KEY)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", str(ACCESS_TOKEN_EXPIRE_MINUTES))
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
    SESSION_EXPIRE_DAYS: int = int(os.getenv("SESSION_EXPIRE_DAYS", "30"))

    # 数据库配置
    DATABASE_TYPE: str = os.getenv("DATABASE_TYPE", "sqlite")
    DATABASE_HOST: str = os.getenv("DATABASE_HOST", "localhost")
    DATABASE_PORT: int = int(os.getenv("DATABASE_PORT", "3306"))
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "canvas")
    DATABASE_USER: str = os.getenv("DATABASE_USER", "canvas")
    DATABASE_PASSWORD: str = os.getenv("DATABASE_PASSWORD", "")

    # SQLite配置
    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", "canvas.db")

    # Redis配置
    REDIS_ENABLED: bool = os.getenv("REDIS_ENABLED", "false").lower() == "true"
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_POOL_SIZE: int = int(os.getenv("REDIS_POOL_SIZE", "20"))
    REDIS_POOL_TIMEOUT: int = int(os.getenv("REDIS_POOL_TIMEOUT", "30"))

    # CORS配置
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frontend:3000",
    ]

    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FILE: Optional[str] = os.getenv("LOG_FILE")
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_DATE_FORMAT: str = "%Y-%m-%d %H:%M:%S"
    LOG_JSON: bool = os.getenv("LOG_JSON", "false").lower() == "true"

    # 安全配置
    FORCE_HTTPS: bool = os.getenv("FORCE_HTTPS", "false").lower() == "true"
    ALLOWED_HOSTS: List[str] = []

    # 自动迁移配置
    AUTO_MIGRATE: bool = os.getenv("AUTO_MIGRATE", "true").lower() == "true"

    def __init__(self):
        """初始化配置，从环境变量中加载额外配置"""
        # 加载额外的CORS源
        extra_origins = os.getenv("CORS_ORIGINS", "")
        if extra_origins:
            self.CORS_ORIGINS.extend([origin.strip() for origin in extra_origins.split(",")])

        # 加载允许的主机列表
        allowed_hosts = os.getenv("ALLOWED_HOSTS", "")
        if allowed_hosts:
            self.ALLOWED_HOSTS = [host.strip() for host in allowed_hosts.split(",")]

    @property
    def database_url(self) -> str:
        """获取数据库连接URL"""
        if self.DATABASE_TYPE == "sqlite":
            return f"sqlite:///{self.SQLITE_DB_PATH}"
        elif self.DATABASE_TYPE == "mysql":
            return (
                f"mysql+pymysql://{self.DATABASE_USER}:{self.DATABASE_PASSWORD}"
                f"@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"
            )
        else:
            raise ValueError(f"Unsupported database type: {self.DATABASE_TYPE}")

    @property
    def redis_url(self) -> Optional[str]:
        """获取Redis连接URL"""
        if not self.REDIS_ENABLED:
            return None
        password_part = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{password_part}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    def is_production(self) -> bool:
        """判断是否为生产环境"""
        return self.ENVIRONMENT.lower() == "production"

    def is_development(self) -> bool:
        """判断是否为开发环境"""
        return self.ENVIRONMENT.lower() == "development"


@lru_cache()
def get_settings() -> Settings:
    """获取配置实例（单例模式）"""
    return Settings()


# 全局配置实例
settings = get_settings()
