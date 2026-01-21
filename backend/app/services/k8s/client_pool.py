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

        # 分段锁：每个集群独立的锁，减少高并发时的锁竞争
        self._cluster_locks: Dict[int, threading.RLock] = {}
        # 元数据锁：仅用于保护 _pools 和 _cluster_locks 字典本身的修改
        self._meta_lock = threading.Lock()

        # 清理线程
        self._cleanup_thread = None
        self._stop_cleanup = threading.Event()

    def _get_cluster_lock(self, cluster_id: int) -> threading.RLock:
        """获取指定集群的锁，如果不存在则创建"""
        with self._meta_lock:
            if cluster_id not in self._cluster_locks:
                self._cluster_locks[cluster_id] = threading.RLock()
            return self._cluster_locks[cluster_id]

    def _get_or_create_pool(self, cluster_id: int) -> List[Dict[str, Any]]:
        """获取或创建指定集群的连接池"""
        with self._meta_lock:
            if cluster_id not in self._pools:
                self._pools[cluster_id] = []
            return self._pools[cluster_id]

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

        cluster_lock = self._get_cluster_lock(cluster_id)

        # 先在锁内快速挑选一个可用连接（不做昂贵的API校验）
        with cluster_lock:
            pool = self._get_or_create_pool(cluster_id)

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
                with cluster_lock:
                    pool = self._get_or_create_pool(cluster_id)
                    for info in list(pool):
                        if info.get("client") is candidate_client:
                            info["last_health_check"] = checked_at
                            info["last_health_ok"] = False
                            self._close_connection(info)
                            pool.remove(info)
                            break
                return self.get_client(cluster)

            # 更新健康检查时间
            with cluster_lock:
                pool = self._get_or_create_pool(cluster_id)
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
        cluster_id = cluster.id
        cluster_lock = self._get_cluster_lock(cluster_id)

        with cluster_lock:
            pool = self._pools.get(cluster_id)
            if not pool:
                return

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
        cluster_lock = self._get_cluster_lock(cluster_id)

        with cluster_lock:
            with self._meta_lock:
                if cluster_id in self._pools:
                    pool = self._pools[cluster_id]
                    # 关闭所有连接
                    for connection_info in pool:
                        self._close_connection(connection_info)
                    del self._pools[cluster_id]
                # 清理集群锁
                if cluster_id in self._cluster_locks:
                    del self._cluster_locks[cluster_id]

    def cleanup_expired_connections(self) -> None:
        """清理过期的连接"""
        # 获取所有集群ID的快照
        with self._meta_lock:
            cluster_ids = list(self._pools.keys())

        clusters_to_remove = []
        current_time = time.time()

        for cluster_id in cluster_ids:
            cluster_lock = self._get_cluster_lock(cluster_id)
            with cluster_lock:
                pool = self._pools.get(cluster_id)
                if pool is None:
                    continue

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
        with self._meta_lock:
            for cluster_id in clusters_to_remove:
                self._pools.pop(cluster_id, None)
                self._cluster_locks.pop(cluster_id, None)

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
        with self._meta_lock:
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


def create_one_off_k8s_client(cluster: Cluster) -> Tuple[Optional[client.ApiClient], List[str]]:
    """
    创建一个“非池化”的一次性 Kubernetes ApiClient。

    适用场景：长连接/监听器（watch）、一次性探测（test connection）等，
    不应占用/污染连接池，也不应被复用。

    Returns:
        (client_instance, temp_files)
    """
    return _client_pool._create_new_connection(cluster)


def close_one_off_k8s_client(client_instance: Optional[client.ApiClient], temp_files: Optional[List[str]] = None) -> None:
    """关闭一次性客户端并清理其关联的临时文件（如 CA cert）。"""
    if not client_instance:
        return
    KubernetesClientPool._close_connection({"client": client_instance, "temp_files": temp_files or []})


class KubernetesOneOffClientContext:
    """一次性 Kubernetes 客户端上下文：创建/关闭 + 临时文件清理。"""

    def __init__(self, cluster: Cluster):
        self.cluster = cluster
        self.client_instance: Optional[client.ApiClient] = None
        self._temp_files: List[str] = []

    def __enter__(self) -> Optional[client.ApiClient]:
        self.client_instance, self._temp_files = create_one_off_k8s_client(self.cluster)
        return self.client_instance

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        close_one_off_k8s_client(self.client_instance, self._temp_files)
        self.client_instance = None
        self._temp_files = []


def create_k8s_client(cluster: Cluster) -> Optional[client.ApiClient]:
    """
    根据集群配置从连接池获取Kubernetes客户端

    注意：该客户端来自连接池，业务代码不要直接 `.close()`。
    建议使用 KubernetesClientContext 上下文管理器自动“借/还”。
    若使用此函数手动获取，请在使用完毕后调用 return_k8s_client 归还。

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
        # 测试连接属于“一次性探测”场景，避免占用/污染连接池。
        with KubernetesOneOffClientContext(cluster) as client_instance:
            if not client_instance:
                return {"success": False, "message": "无法创建Kubernetes客户端"}

            version_api = client.VersionApi(client_instance)
            version = version_api.get_code()

            return {
                "success": True,
                "message": "连接成功",
                "version": f"{version.major}.{version.minor}",
            }

    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


def get_client_pool() -> KubernetesClientPool:
    """获取全局连接池实例"""
    return _client_pool
