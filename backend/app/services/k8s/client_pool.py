"""
Kubernetes客户端连接池管理模块
提供连接池管理、客户端创建和上下文管理功能
"""

import time
import threading
import tempfile
from typing import Dict, Any, Optional, List, Tuple

from kubernetes import client, config
import yaml

from ...models import Cluster
from ...core.logging import get_logger


logger = get_logger(__name__)


class KubernetesClientPool:
    """Kubernetes客户端连接池管理器"""

    def __init__(
        self,
        max_connections_per_cluster: int = 10,
        connection_timeout: int = 600,
        health_check_interval: int = 60,
    ):
        """
        初始化连接池管理器

        Args:
            max_connections_per_cluster: 每个集群的最大连接数 (提升到10)
            connection_timeout: 连接超时时间（秒，提升到10分钟）
            health_check_interval: 连接健康检查间隔（秒）。避免每次借用都调用K8s API。
        """
        self.max_connections_per_cluster = max_connections_per_cluster
        self.connection_timeout = connection_timeout
        self.health_check_interval = health_check_interval

        # 连接池存储: cluster_id -> 连接列表
        self._pools: Dict[int, List[Dict[str, Any]]] = {}

        # 锁保护并发访问
        self._lock = threading.RLock()

        # 清理线程
        self._cleanup_thread = None
        self._stop_cleanup = threading.Event()

    def get_client(self, cluster: Cluster) -> Optional[client.ApiClient]:
        """
        从连接池获取客户端连接

        Args:
            cluster: 集群配置

        Returns:
            可用的Kubernetes客户端，如果无法获取则返回None
        """
        cluster_id = cluster.id
        current_time = time.time()

        candidate_client: Optional[client.ApiClient] = None
        candidate_needs_health_check = False

        # 先在锁内快速挑选一个可用连接（不做昂贵的API校验）
        with self._lock:
            pool = self._pools.setdefault(cluster_id, [])

            # 清理超时连接（只做时间判断，避免锁内做K8s API调用）
            for connection_info in list(pool):
                if current_time - connection_info["last_used"] > self.connection_timeout:
                    self._close_connection(connection_info)
                    pool.remove(connection_info)

            # 取一个候选连接
            if pool:
                connection_info = pool[0]
                connection_info["last_used"] = current_time
                candidate_client = connection_info["client"]
                last_check = float(connection_info.get("last_health_check", 0) or 0)
                candidate_needs_health_check = (current_time - last_check) > self.health_check_interval

            # 没有可用连接，尝试创建
            if candidate_client is None and len(pool) < self.max_connections_per_cluster:
                client_instance, temp_files = self._create_new_connection(cluster)
                if client_instance:
                    pool.append(
                        {
                            "client": client_instance,
                            "created_at": current_time,
                            "last_used": current_time,
                            "cluster_id": cluster_id,
                            "last_health_check": current_time,
                            "last_health_ok": True,
                            "temp_files": temp_files,
                        }
                    )
                    return client_instance

        if candidate_client is None:
            return None

        # 需要健康检查时，在锁外执行（避免阻塞其它请求）
        if candidate_needs_health_check:
            ok = self._is_connection_valid(candidate_client)
            checked_at = time.time()
            if not ok:
                # 失效连接：从池中移除并关闭，然后递归获取下一个
                with self._lock:
                    pool = self._pools.get(cluster_id, [])
                    for info in list(pool):
                        if info.get("client") is candidate_client:
                            info["last_health_check"] = checked_at
                            info["last_health_ok"] = False
                            self._close_connection(info)
                            pool.remove(info)
                            break
                return self.get_client(cluster)

            # 更新健康检查时间
            with self._lock:
                pool = self._pools.get(cluster_id, [])
                for info in pool:
                    if info.get("client") is candidate_client:
                        info["last_health_check"] = checked_at
                        info["last_health_ok"] = True
                        break

        return candidate_client

    def return_client(self, cluster: Cluster, client_instance: client.ApiClient) -> None:
        """
        将客户端连接返回到连接池

        Args:
            cluster: 集群配置
            client_instance: 要返回的客户端连接
        """
        with self._lock:
            cluster_id = cluster.id
            if cluster_id not in self._pools:
                return

            pool = self._pools[cluster_id]
            current_time = time.time()

            # 更新连接的最后使用时间
            for connection_info in pool:
                if connection_info['client'] is client_instance:
                    connection_info['last_used'] = current_time
                    break

    def remove_cluster(self, cluster_id: int) -> None:
        """
        移除集群的所有连接

        Args:
            cluster_id: 集群ID
        """
        with self._lock:
            if cluster_id in self._pools:
                pool = self._pools[cluster_id]
                # 关闭所有连接
                for connection_info in pool:
                    self._close_connection(connection_info)
                del self._pools[cluster_id]

    def cleanup_expired_connections(self) -> None:
        """清理过期的连接"""
        with self._lock:
            current_time = time.time()
            clusters_to_remove = []

            for cluster_id, pool in self._pools.items():
                valid_connections = []

                for connection_info in pool:
                    # 仅基于时间清理，避免清理线程触发大量 K8s API 调用
                    if current_time - connection_info["last_used"] > self.connection_timeout:
                        self._close_connection(connection_info)
                    else:
                        valid_connections.append(connection_info)

                if valid_connections:
                    self._pools[cluster_id] = valid_connections
                else:
                    clusters_to_remove.append(cluster_id)

            # 移除空连接池
            for cluster_id in clusters_to_remove:
                del self._pools[cluster_id]

    def start_cleanup_thread(self) -> None:
        """启动清理线程"""
        if self._cleanup_thread is None or not self._cleanup_thread.is_alive():
            self._stop_cleanup.clear()
            self._cleanup_thread = threading.Thread(
                target=self._cleanup_worker,
                daemon=True,
                name="K8sConnectionPoolCleanup"
            )
            self._cleanup_thread.start()

    def stop_cleanup_thread(self) -> None:
        """停止清理线程"""
        if self._cleanup_thread:
            self._stop_cleanup.set()
            self._cleanup_thread.join(timeout=5)

    def _cleanup_worker(self) -> None:
        """清理工作线程"""
        while not self._stop_cleanup.wait(60):  # 每60秒清理一次
            try:
                self.cleanup_expired_connections()
            except Exception as e:
                logger.exception("连接池清理出错: %s", e)

    def _create_new_connection(self, cluster: Cluster) -> Tuple[Optional[client.ApiClient], List[str]]:
        """
        创建新的集群连接

        Args:
            cluster: 集群配置

        Returns:
            新创建的客户端连接
        """
        try:
            if cluster.auth_type == "kubeconfig":
                if not cluster.kubeconfig_content:
                    raise ValueError("kubeconfig内容为空")

                # 直接从 dict 创建客户端，避免频繁创建/删除临时文件造成I/O开销
                config_dict = yaml.safe_load(cluster.kubeconfig_content)
                return config.new_client_from_config_dict(config_dict), []

            elif cluster.auth_type == "token":
                if not cluster.token:
                    raise ValueError("token为空")

                # 使用token认证
                configuration = client.Configuration()
                configuration.host = cluster.endpoint
                configuration.verify_ssl = True

                temp_files: List[str] = []
                if cluster.ca_cert:
                    # 如果提供了CA证书，创建临时文件并保留到连接释放时再清理
                    with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as f:
                        f.write(cluster.ca_cert)
                        ca_cert_path = f.name
                    configuration.ssl_ca_cert = ca_cert_path
                    temp_files.append(ca_cert_path)

                configuration.api_key = {"authorization": f"Bearer {cluster.token}"}
                return client.ApiClient(configuration), temp_files

            else:
                raise ValueError(f"不支持的认证类型: {cluster.auth_type}")

        except Exception as e:
            logger.exception("创建Kubernetes客户端失败: %s", e)
            return None, []

    def _is_connection_valid(self, client_instance: client.ApiClient) -> bool:
        """
        检查连接是否有效

        Args:
            client_instance: 要检查的客户端连接

        Returns:
            连接是否有效
        """
        try:
            # 尝试简单的API调用来验证连接
            version_api = client.VersionApi(client_instance)
            version_api.get_code()
            return True
        except:
            return False

    @staticmethod
    def _close_connection(connection_info: Dict[str, Any]) -> None:
        """关闭连接并清理其关联的临时文件。"""
        try:
            connection_info.get("client").close()
        except Exception:
            pass

        for path in connection_info.get("temp_files") or []:
            try:
                # 延迟清理临时文件（CA证书等）
                import os

                os.unlink(path)
            except Exception:
                pass

    def get_pool_stats(self) -> Dict[str, Any]:
        """
        获取连接池统计信息

        Returns:
            连接池统计信息
        """
        with self._lock:
            stats = {
                'total_clusters': len(self._pools),
                'total_connections': 0,
                'connections_per_cluster': {}
            }

            for cluster_id, pool in self._pools.items():
                stats['connections_per_cluster'][str(cluster_id)] = len(pool)
                stats['total_connections'] += len(pool)

            return stats


# 全局连接池实例
_client_pool = KubernetesClientPool()


class KubernetesClientContext:
    """Kubernetes客户端上下文管理器，用于自动管理连接池"""

    def __init__(self, cluster: Cluster):
        self.cluster = cluster
        self.client_instance = None

    def __enter__(self) -> Optional[client.ApiClient]:
        """进入上下文，获取连接"""
        self.client_instance = _client_pool.get_client(self.cluster)
        return self.client_instance

    def __exit__(self, exc_type, exc_val, exc_tb):
        """退出上下文，返回连接到连接池"""
        if self.client_instance:
            _client_pool.return_client(self.cluster, self.client_instance)


def create_k8s_client(cluster: Cluster) -> Optional[client.ApiClient]:
    """
    根据集群配置从连接池获取Kubernetes客户端

    注意：使用此函数获取的客户端在使用完毕后不会自动返回连接池。
    建议使用KubernetesClientContext上下文管理器来自动管理连接。

    Args:
        cluster: 集群配置

    Returns:
        Kubernetes客户端实例，如果无法获取则返回None
    """
    return _client_pool.get_client(cluster)


def return_k8s_client(cluster: Cluster, client_instance: client.ApiClient) -> None:
    """
    将Kubernetes客户端返回到连接池

    Args:
        cluster: 集群配置
        client_instance: 要返回的客户端实例
    """
    _client_pool.return_client(cluster, client_instance)


def test_cluster_connection(cluster: Cluster) -> Dict[str, Any]:
    """测试集群连接"""
    try:
        client_instance = create_k8s_client(cluster)
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        # 尝试获取集群版本信息
        version_api = client.VersionApi(client_instance)
        version = version_api.get_code()

        client_instance.close()
        return {
            "success": True,
            "message": "连接成功",
            "version": f"{version.major}.{version.minor}"
        }

    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


def get_client_pool() -> KubernetesClientPool:
    """获取全局连接池实例"""
    return _client_pool
