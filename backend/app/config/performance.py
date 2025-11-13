"""
性能优化配置文件
包含数据库、缓存、连接池等性能相关的配置
"""
import os
from typing import Optional


class PerformanceConfig:
    """性能配置类"""

    # ========== 数据库连接池配置 ==========
    # MySQL连接池配置
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "50"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "100"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    DB_POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", "3600"))
    DB_POOL_PRE_PING: bool = os.getenv("DB_POOL_PRE_PING", "true").lower() == "true"

    # SQLite连接池配置
    SQLITE_POOL_SIZE: int = int(os.getenv("SQLITE_POOL_SIZE", "20"))
    SQLITE_MAX_OVERFLOW: int = int(os.getenv("SQLITE_MAX_OVERFLOW", "40"))

    # ========== Kubernetes连接池配置 ==========
    K8S_MAX_CONNECTIONS_PER_CLUSTER: int = int(os.getenv("K8S_MAX_CONNECTIONS_PER_CLUSTER", "10"))
    K8S_CONNECTION_TIMEOUT: int = int(os.getenv("K8S_CONNECTION_TIMEOUT", "600"))
    K8S_CLEANUP_INTERVAL: int = int(os.getenv("K8S_CLEANUP_INTERVAL", "60"))

    # ========== Redis缓存配置 ==========
    REDIS_ENABLED: bool = os.getenv("REDIS_ENABLED", "false").lower() == "true"
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    REDIS_MAX_CONNECTIONS: int = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))

    # 缓存TTL配置（秒）
    CACHE_TTL_CLUSTER_INFO: int = int(os.getenv("CACHE_TTL_CLUSTER_INFO", "300"))  # 5分钟
    CACHE_TTL_NAMESPACE_LIST: int = int(os.getenv("CACHE_TTL_NAMESPACE_LIST", "60"))  # 1分钟
    CACHE_TTL_POD_LIST: int = int(os.getenv("CACHE_TTL_POD_LIST", "30"))  # 30秒
    CACHE_TTL_METRICS: int = int(os.getenv("CACHE_TTL_METRICS", "15"))  # 15秒

    # ========== API性能配置 ==========
    # 请求限流配置
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    RATE_LIMIT_BURST: int = int(os.getenv("RATE_LIMIT_BURST", "10"))

    # 分页配置
    DEFAULT_PAGE_SIZE: int = int(os.getenv("DEFAULT_PAGE_SIZE", "50"))
    MAX_PAGE_SIZE: int = int(os.getenv("MAX_PAGE_SIZE", "200"))

    # 请求超时配置
    API_REQUEST_TIMEOUT: int = int(os.getenv("API_REQUEST_TIMEOUT", "30"))
    K8S_API_TIMEOUT: int = int(os.getenv("K8S_API_TIMEOUT", "10"))

    # ========== 异步任务配置 ==========
    # Celery配置
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    CELERY_WORKER_CONCURRENCY: int = int(os.getenv("CELERY_WORKER_CONCURRENCY", "4"))
    CELERY_TASK_TIME_LIMIT: int = int(os.getenv("CELERY_TASK_TIME_LIMIT", "300"))

    # ========== WebSocket配置 ==========
    WS_MAX_CONNECTIONS: int = int(os.getenv("WS_MAX_CONNECTIONS", "1000"))
    WS_HEARTBEAT_INTERVAL: int = int(os.getenv("WS_HEARTBEAT_INTERVAL", "30"))
    WS_MESSAGE_QUEUE_SIZE: int = int(os.getenv("WS_MESSAGE_QUEUE_SIZE", "100"))

    # ========== 日志配置 ==========
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_SQL_QUERIES: bool = os.getenv("LOG_SQL_QUERIES", "false").lower() == "true"
    LOG_REQUEST_DETAILS: bool = os.getenv("LOG_REQUEST_DETAILS", "false").lower() == "true"

    # ========== 监控配置 ==========
    METRICS_ENABLED: bool = os.getenv("METRICS_ENABLED", "true").lower() == "true"
    METRICS_PORT: int = int(os.getenv("METRICS_PORT", "9090"))
    ENABLE_PROFILING: bool = os.getenv("ENABLE_PROFILING", "false").lower() == "true"

    # ========== 资源限制配置 ==========
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))
    MAX_YAML_SIZE_KB: int = int(os.getenv("MAX_YAML_SIZE_KB", "1024"))
    MAX_LOG_LINES: int = int(os.getenv("MAX_LOG_LINES", "1000"))

    @classmethod
    def get_config_dict(cls) -> dict:
        """获取所有配置的字典形式"""
        return {
            key: getattr(cls, key)
            for key in dir(cls)
            if not key.startswith('_') and key.isupper()
        }

    @classmethod
    def print_config(cls):
        """打印当前配置（用于调试）"""
        print("=" * 60)
        print("性能优化配置")
        print("=" * 60)
        for key, value in cls.get_config_dict().items():
            # 隐藏敏感信息
            if 'PASSWORD' in key or 'SECRET' in key:
                value = '***'
            print(f"{key:40} = {value}")
        print("=" * 60)


# 创建全局配置实例
perf_config = PerformanceConfig()
