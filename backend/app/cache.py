"""
Redis缓存管理模块
提供统一的缓存接口，支持热点数据缓存和API响应缓存
"""
import os
import json
import pickle
from typing import Any, Optional, Callable
from functools import wraps
import redis
from redis.connection import ConnectionPool
from .core.logging import get_logger

logger = get_logger(__name__)

# Redis配置
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() == "true"

# 默认缓存时间（秒）
DEFAULT_CACHE_TTL = 300  # 5分钟
CLUSTER_LIST_TTL = 600  # 集群列表10分钟
USER_INFO_TTL = 1800  # 用户信息30分钟
K8S_RESOURCE_TTL = 60  # Kubernetes资源列表1分钟


class CacheManager:
    """Redis缓存管理器"""

    def __init__(self):
        self.enabled = REDIS_ENABLED
        self.pool = None
        self.client = None

        if self.enabled:
            try:
                self.pool = ConnectionPool(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    db=REDIS_DB,
                    password=REDIS_PASSWORD,
                    max_connections=50,
                    socket_timeout=5,
                    socket_connect_timeout=5,
                    decode_responses=False  # 使用bytes以支持pickle
                )
                self.client = redis.Redis(connection_pool=self.pool)
                # 测试连接
                self.client.ping()
                logger.info("Redis缓存已启用: %s:%s", REDIS_HOST, REDIS_PORT)
            except Exception as e:
                logger.warning("Redis连接失败，缓存功能已禁用: %s", e)
                self.enabled = False
                self.client = None

    def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        if not self.enabled or not self.client:
            return None

        try:
            value = self.client.get(key)
            if value is None:
                return None

            # 尝试反序列化
            try:
                return pickle.loads(value)
            except:
                # 如果pickle失败，尝试JSON
                try:
                    return json.loads(value.decode('utf-8'))
                except:
                    return value.decode('utf-8')
        except Exception as e:
            logger.warning("获取缓存失败: key=%s error=%s", key, e)
            return None

    def set(self, key: str, value: Any, ttl: int = DEFAULT_CACHE_TTL) -> bool:
        """设置缓存"""
        if not self.enabled or not self.client:
            return False

        try:
            # 使用pickle序列化（支持更多Python对象）
            serialized = pickle.dumps(value)
            self.client.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.warning("设置缓存失败: key=%s error=%s", key, e)
            return False

    def delete(self, key: str) -> bool:
        """删除缓存"""
        if not self.enabled or not self.client:
            return False

        try:
            self.client.delete(key)
            return True
        except Exception as e:
            logger.warning("删除缓存失败: key=%s error=%s", key, e)
            return False

    def delete_pattern(self, pattern: str) -> int:
        """删除匹配模式的所有缓存键"""
        if not self.enabled or not self.client:
            return 0

        try:
            keys = self.client.keys(pattern)
            if keys:
                return self.client.delete(*keys)
            return 0
        except Exception as e:
            logger.warning("批量删除缓存失败: pattern=%s error=%s", pattern, e)
            return 0

    def exists(self, key: str) -> bool:
        """检查缓存是否存在"""
        if not self.enabled or not self.client:
            return False

        try:
            return bool(self.client.exists(key))
        except Exception as e:
            logger.warning("检查缓存存在性失败: key=%s error=%s", key, e)
            return False

    def clear_all(self) -> bool:
        """清空所有缓存"""
        if not self.enabled or not self.client:
            return False

        try:
            self.client.flushdb()
            logger.info("已清空所有缓存")
            return True
        except Exception as e:
            logger.error("清空缓存失败: %s", e)
            return False


# 全局缓存管理器实例
cache_manager = CacheManager()


def cached(ttl: int = DEFAULT_CACHE_TTL, key_prefix: str = ""):
    """
    缓存装饰器

    Args:
        ttl: 缓存时间（秒）
        key_prefix: 缓存键前缀
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = f"{key_prefix}:{func.__name__}"

            # 添加参数到缓存键（忽略复杂对象）
            for arg in args:
                if isinstance(arg, (str, int, float, bool)):
                    cache_key += f":{arg}"

            for k, v in sorted(kwargs.items()):
                if isinstance(v, (str, int, float, bool)):
                    cache_key += f":{k}={v}"

            # 尝试从缓存获取
            cached_value = cache_manager.get(cache_key)
            if cached_value is not None:
                logger.debug("缓存命中: %s", cache_key)
                return cached_value

            # 执行函数
            result = func(*args, **kwargs)

            # 缓存结果
            if result is not None:
                cache_manager.set(cache_key, result, ttl)
                logger.debug("已缓存结果: %s", cache_key)

            return result

        return wrapper
    return decorator


def invalidate_cache(pattern: str):
    """
    使缓存失效

    Args:
        pattern: 缓存键模式（支持通配符*）
    """
    count = cache_manager.delete_pattern(pattern)
    logger.info("已清除缓存: pattern=%s count=%d", pattern, count)
    return count


# 便捷函数
def cache_cluster_list(cluster_list: list, user_id: int):
    """缓存集群列表"""
    key = f"cluster_list:user:{user_id}"
    cache_manager.set(key, cluster_list, CLUSTER_LIST_TTL)


def get_cached_cluster_list(user_id: int):
    """获取缓存的集群列表"""
    key = f"cluster_list:user:{user_id}"
    return cache_manager.get(key)


def invalidate_cluster_cache(user_id: int = None):
    """使集群缓存失效"""
    if user_id:
        pattern = f"cluster_list:user:{user_id}"
    else:
        pattern = "cluster_list:*"
    return invalidate_cache(pattern)


def cache_user_info(user_info: dict, user_id: int):
    """缓存用户信息"""
    key = f"user_info:{user_id}"
    cache_manager.set(key, user_info, USER_INFO_TTL)


def get_cached_user_info(user_id: int):
    """获取缓存的用户信息"""
    key = f"user_info:{user_id}"
    return cache_manager.get(key)


def invalidate_user_cache(user_id: int):
    """使用户缓存失效"""
    pattern = f"user_info:{user_id}"
    return invalidate_cache(pattern)


def cache_k8s_resource(resource_type: str, cluster_id: int, namespace: str, data: Any):
    """缓存Kubernetes资源列表"""
    key = f"k8s:{resource_type}:cluster:{cluster_id}:ns:{namespace}"
    cache_manager.set(key, data, K8S_RESOURCE_TTL)


def get_cached_k8s_resource(resource_type: str, cluster_id: int, namespace: str):
    """获取缓存的Kubernetes资源列表"""
    key = f"k8s:{resource_type}:cluster:{cluster_id}:ns:{namespace}"
    return cache_manager.get(key)


def invalidate_k8s_cache(cluster_id: int = None, namespace: str = None):
    """使Kubernetes资源缓存失效"""
    if cluster_id and namespace:
        pattern = f"k8s:*:cluster:{cluster_id}:ns:{namespace}"
    elif cluster_id:
        pattern = f"k8s:*:cluster:{cluster_id}:*"
    else:
        pattern = "k8s:*"
    return invalidate_cache(pattern)
