import tempfile
import os
import time
import json
import uuid
import yaml
import threading
import weakref
from typing import Dict, Any, Optional, List
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from kubernetes.stream import stream
from .models import Cluster


class KubernetesClientPool:
    """Kubernetes客户端连接池管理器"""

    def __init__(self, max_connections_per_cluster: int = 5, connection_timeout: int = 300):
        """
        初始化连接池管理器

        Args:
            max_connections_per_cluster: 每个集群的最大连接数
            connection_timeout: 连接超时时间（秒）
        """
        self.max_connections_per_cluster = max_connections_per_cluster
        self.connection_timeout = connection_timeout

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
        with self._lock:
            cluster_id = cluster.id

            # 初始化集群连接池
            if cluster_id not in self._pools:
                self._pools[cluster_id] = []

            pool = self._pools[cluster_id]

            # 查找可用的连接
            current_time = time.time()
            for connection_info in pool:
                # 检查连接是否超时或无效
                if (current_time - connection_info['last_used'] > self.connection_timeout or
                    not self._is_connection_valid(connection_info['client'])):
                    # 移除无效连接
                    try:
                        connection_info['client'].close()
                    except:
                        pass
                    pool.remove(connection_info)
                    continue

                # 找到可用连接
                connection_info['last_used'] = current_time
                return connection_info['client']

            # 如果没有可用连接且未达到最大连接数，创建新连接
            if len(pool) < self.max_connections_per_cluster:
                client_instance = self._create_new_connection(cluster)
                if client_instance:
                    connection_info = {
                        'client': client_instance,
                        'created_at': current_time,
                        'last_used': current_time,
                        'cluster_id': cluster_id
                    }
                    pool.append(connection_info)
                    return client_instance

            return None

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
                    try:
                        connection_info['client'].close()
                    except:
                        pass
                del self._pools[cluster_id]

    def cleanup_expired_connections(self) -> None:
        """清理过期的连接"""
        with self._lock:
            current_time = time.time()
            clusters_to_remove = []

            for cluster_id, pool in self._pools.items():
                valid_connections = []

                for connection_info in pool:
                    # 检查连接是否过期或无效
                    if (current_time - connection_info['last_used'] > self.connection_timeout or
                        not self._is_connection_valid(connection_info['client'])):

                        # 关闭过期连接
                        try:
                            connection_info['client'].close()
                        except:
                            pass
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
                print(f"连接池清理出错: {e}")

    def _create_new_connection(self, cluster: Cluster) -> Optional[client.ApiClient]:
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

                # 创建临时文件存储kubeconfig
                with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                    f.write(cluster.kubeconfig_content)
                    kubeconfig_path = f.name

                try:
                    # 加载kubeconfig
                    config.load_kube_config(config_file=kubeconfig_path)
                    return client.ApiClient()
                finally:
                    # 清理临时文件
                    os.unlink(kubeconfig_path)

            elif cluster.auth_type == "token":
                if not cluster.token:
                    raise ValueError("token为空")

                # 使用token认证
                configuration = client.Configuration()
                configuration.host = cluster.endpoint
                configuration.verify_ssl = True

                if cluster.ca_cert:
                    # 如果提供了CA证书，创建临时文件
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as f:
                        f.write(cluster.ca_cert)
                        ca_cert_path = f.name

                    try:
                        configuration.ssl_ca_cert = ca_cert_path
                    finally:
                        os.unlink(ca_cert_path)

                configuration.api_key = {"authorization": f"Bearer {cluster.token}"}
                return client.ApiClient(configuration)

            else:
                raise ValueError(f"不支持的认证类型: {cluster.auth_type}")

        except Exception as e:
            print(f"创建Kubernetes客户端失败: {e}")
            return None

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

def get_cluster_stats(cluster: Cluster) -> Dict[str, Any]:
    """获取集群统计信息"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {}

        try:
            # 初始化API客户端
            core_v1 = client.CoreV1Api(client_instance)
            apps_v1 = client.AppsV1Api(client_instance)

            stats = {
                'nodes': 0,
                'namespaces': 0,
                'total_pods': 0,
                'running_pods': 0,
                'services': 0
            }

            # 获取节点数量
            try:
                nodes = core_v1.list_node()
                stats['nodes'] = len(nodes.items)
            except ApiException as e:
                print(f"获取节点信息失败: {e}")
                stats['nodes'] = 0

            # 获取命名空间数量
            try:
                namespaces = core_v1.list_namespace()
                stats['namespaces'] = len(namespaces.items)
            except ApiException as e:
                print(f"获取命名空间信息失败: {e}")
                stats['namespaces'] = 0

            # 获取Pod统计
            try:
                pods = core_v1.list_pod_for_all_namespaces()
                total_pods = len(pods.items)
                running_pods = len([p for p in pods.items if p.status.phase == 'Running'])

                stats['total_pods'] = total_pods
                stats['running_pods'] = running_pods
            except ApiException as e:
                print(f"获取Pod信息失败: {e}")
                stats['total_pods'] = 0
                stats['running_pods'] = 0

            # 获取服务数量
            try:
                services = core_v1.list_service_for_all_namespaces()
                stats['services'] = len(services.items)
            except ApiException as e:
                print(f"获取服务信息失败: {e}")
                stats['services'] = 0

            return stats

        except Exception as e:
            print(f"获取集群统计信息失败: {e}")
            return {}

def get_nodes_info(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群节点基本信息"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            nodes = core_v1.list_node()

            # 获取所有Pods用于统计节点上的Pods数量
            pods = core_v1.list_pod_for_all_namespaces()

            # 统计每个节点上的Pods数量
            node_pod_counts = {}
            for pod in pods.items:
                node_name = pod.spec.node_name
                if node_name:
                    node_pod_counts[node_name] = node_pod_counts.get(node_name, 0) + 1

            # 获取节点资源使用情况（从allocatable和capacity计算）
            node_resource_usage = {}
            for node in nodes.items:
                node_name = node.metadata.name

                # 获取CPU和内存使用情况（通过allocatable计算可用资源比例）
                cpu_capacity = node.status.capacity.get("cpu", "0")
                memory_capacity = node.status.capacity.get("memory", "0")
                cpu_allocatable = node.status.allocatable.get("cpu", "0")
                memory_allocatable = node.status.allocatable.get("memory", "0")

                # 计算使用率（简单估算：1 - allocatable/capacity）
                cpu_usage = None
                memory_usage = None

                try:
                    if cpu_capacity and cpu_allocatable:
                        cpu_capacity_val = parse_cpu(cpu_capacity)
                        cpu_allocatable_val = parse_cpu(cpu_allocatable)
                        if cpu_capacity_val > 0:
                            cpu_usage_val = ((cpu_capacity_val - cpu_allocatable_val) / cpu_capacity_val) * 100
                            cpu_usage = f"{cpu_usage_val:.1f}%"
                except:
                    pass

                try:
                    if memory_capacity and memory_allocatable:
                        memory_capacity_val = parse_memory(memory_capacity)
                        memory_allocatable_val = parse_memory(memory_allocatable)
                        if memory_capacity_val > 0:
                            memory_usage_val = ((memory_capacity_val - memory_allocatable_val) / memory_capacity_val) * 100
                            memory_usage = f"{memory_usage_val:.1f}%"
                except:
                    pass

                node_resource_usage[node_name] = {
                    'cpu_usage': cpu_usage,
                    'memory_usage': memory_usage
                }

            node_list = []
            for node in nodes.items:
                node_name = node.metadata.name

                # 获取节点状态
                status = "Unknown"
                for condition in node.status.conditions:
                    if condition.type == "Ready":
                        status = "Ready" if condition.status == "True" else "NotReady"
                        break

                # 获取节点角色
                roles = []
                if node.metadata.labels:
                    if node.metadata.labels.get("node-role.kubernetes.io/master") == "true" or \
                       node.metadata.labels.get("node-role.kubernetes.io/control-plane") == "true":
                        roles.append("master")
                    if node.metadata.labels.get("node-role.kubernetes.io/worker") == "true":
                        roles.append("worker")

                # 获取IP地址
                internal_ip = None
                external_ip = None
                for address in node.status.addresses:
                    if address.type == "InternalIP":
                        internal_ip = address.address
                    elif address.type == "ExternalIP":
                        external_ip = address.address

                # 获取资源容量
                cpu_capacity = node.status.capacity.get("cpu", "0")
                memory_capacity = node.status.capacity.get("memory", "0")
                pods_capacity = node.status.capacity.get("pods", "0")

                # 获取实际Pods数量
                pods_usage = str(node_pod_counts.get(node_name, 0))

                # 计算节点年龄
                from datetime import datetime
                age = "Unknown"
                if node.metadata.creation_timestamp:
                    created = node.metadata.creation_timestamp.replace(tzinfo=None)
                    now = datetime.now()
                    delta = now - created
                    if delta.days > 0:
                        age = f"{delta.days}d"
                    elif delta.seconds // 3600 > 0:
                        age = f"{delta.seconds // 3600}h"
                    elif delta.seconds // 60 > 0:
                        age = f"{delta.seconds // 60}m"
                    else:
                        age = f"{delta.seconds}s"

                node_info = {
                    "name": node.metadata.name,
                    "status": status,
                    "roles": roles,
                    "age": age,
                    "version": node.status.node_info.kubelet_version if node.status.node_info else "Unknown",
                    "internal_ip": internal_ip,
                    "external_ip": external_ip,
                    "cpu_capacity": cpu_capacity,
                    "memory_capacity": memory_capacity,
                    "pods_capacity": pods_capacity,
                    "cpu_usage": node_resource_usage.get(node_name, {}).get('cpu_usage'),
                    "memory_usage": node_resource_usage.get(node_name, {}).get('memory_usage'),
                    "pods_usage": pods_usage
                }
                node_list.append(node_info)

            return node_list

        except Exception as e:
            print(f"获取节点信息失败: {e}")
            return []

# def get_node_details(cluster: Cluster, node_name: str) -> Optional[Dict[str, Any]]:
#     """获取节点详细信息 - 暂时禁用，由于缩进问题"""
#     return None

def get_node_details(cluster: Cluster, node_name: str) -> Optional[Dict[str, Any]]:
    """获取节点详细信息"""
    # 暂时使用旧的实现方式，待后续修复连接池集成
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        node = core_v1.read_node(node_name)

        # 获取节点状态
        status = "Unknown"
        for condition in node.status.conditions:
            if condition.type == "Ready":
                status = "Ready" if condition.status == "True" else "NotReady"
                break

        # 获取节点角色
        roles = []
        if node.metadata.labels:
            if node.metadata.labels.get("node-role.kubernetes.io/master") == "true" or \
               node.metadata.labels.get("node-role.kubernetes.io/control-plane") == "true":
                roles.append("master")
            if node.metadata.labels.get("node-role.kubernetes.io/worker") == "true":
                roles.append("worker")

        # 获取IP地址
        internal_ip = None
        external_ip = None
        for address in node.status.addresses:
            if address.type == "InternalIP":
                internal_ip = address.address
            elif address.type == "ExternalIP":
                external_ip = address.address

        # 获取资源容量
        cpu_capacity = node.status.capacity.get("cpu", "0")
        memory_capacity = node.status.capacity.get("memory", "0")
        pods_capacity = node.status.capacity.get("pods", "0")

        # 计算节点年龄
        from datetime import datetime
        age = "Unknown"
        if node.metadata.creation_timestamp:
            created = node.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取条件状态
        conditions = []
        for condition in node.status.conditions:
            conditions.append({
                "type": condition.type,
                "status": condition.status,
                "last_heartbeat_time": str(condition.last_heartbeat_time) if condition.last_heartbeat_time else None,
                "last_transition_time": str(condition.last_transition_time) if condition.last_transition_time else None,
                "reason": condition.reason,
                "message": condition.message
            })

        # 获取污点
        taints = []
        if node.spec.taints:
            for taint in node.spec.taints:
                taints.append({
                    "key": taint.key,
                    "value": taint.value,
                    "effect": taint.effect
                })

        return {
            "name": node.metadata.name,
            "status": status,
            "roles": roles,
            "age": age,
            "version": node.status.node_info.kubelet_version if node.status.node_info else "Unknown",
            "internal_ip": internal_ip,
            "external_ip": external_ip,
            "cpu_capacity": cpu_capacity,
            "memory_capacity": memory_capacity,
            "pods_capacity": pods_capacity,
            "labels": dict(node.metadata.labels) if node.metadata.labels else {},
            "annotations": dict(node.metadata.annotations) if node.metadata.annotations else {},
            "conditions": conditions,
            "taints": taints,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取节点详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def get_namespaces_info(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群命名空间信息"""
    # 暂时使用旧的实现方式，待后续修复连接池集成
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        # 如果无法创建客户端，返回模拟数据以便演示
        return get_mock_namespaces()

    try:
        core_v1 = client.CoreV1Api(client_instance)
        namespaces = core_v1.list_namespace()

        namespace_list = []
        for ns in namespaces.items:
            # 获取命名空间状态
            status = "Active"
            for condition in ns.status.conditions:
                if condition.type == "NamespaceDeletionContentFailure" or condition.type == "NamespaceDeletionDiscoveryFailure":
                    status = "Terminating"
                    break
                elif condition.type == "NamespaceDeletionGroupVersionParsingFailure":
                    status = "Failed"
                    break

            # 计算命名空间年龄
            from datetime import datetime
            age = "Unknown"
            if ns.metadata.creation_timestamp:
                created = ns.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            namespace_info = {
                "name": ns.metadata.name,
                "status": status,
                "age": age,
                "labels": dict(ns.metadata.labels) if ns.metadata.labels else {},
                "annotations": dict(ns.metadata.annotations) if ns.metadata.annotations else {}
            }
            namespace_list.append(namespace_info)

        return namespace_list

    except Exception as e:
        # 如果连接失败，返回模拟数据
        return get_mock_namespaces()
    finally:
        if client_instance:
            client_instance.close()


def get_mock_namespaces() -> List[Dict[str, Any]]:
    """返回模拟的命名空间数据，包括系统命名空间"""
    from datetime import datetime, timedelta
    import random

    # 系统命名空间
    system_namespaces = [
        {"name": "default", "description": "默认命名空间"},
        {"name": "kube-system", "description": "Kubernetes 系统组件"},
        {"name": "kube-public", "description": "公共资源"},
        {"name": "kube-node-lease", "description": "节点租约"},
    ]

    # 用户命名空间示例
    user_namespaces = [
        {"name": "production", "description": "生产环境"},
        {"name": "staging", "description": "测试环境"},
        {"name": "development", "description": "开发环境"},
        {"name": "monitoring", "description": "监控"},
        {"name": "logging", "description": "日志"},
    ]

    all_namespaces = system_namespaces + user_namespaces
    namespace_list = []

    for ns_info in all_namespaces:
        # 随机生成年龄
        days_ago = random.randint(1, 365)
        created = datetime.now() - timedelta(days=days_ago)

        if days_ago > 30:
            age = f"{days_ago // 30}M"
        elif days_ago > 1:
            age = f"{days_ago}d"
        else:
            age = f"{random.randint(1, 24)}h"

        # 系统命名空间有特定的标签
        labels = {}
        if ns_info["name"] in ["kube-system", "kube-public", "kube-node-lease"]:
            labels["kubernetes.io/metadata.name"] = ns_info["name"]

        namespace_info = {
            "name": ns_info["name"],
            "status": "Active",
            "age": age,
            "labels": labels,
            "annotations": {}
        }
        namespace_list.append(namespace_info)

    return namespace_list

def create_namespace(cluster: Cluster, namespace_name: str, labels: Optional[dict] = None) -> bool:
    """创建命名空间"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 创建命名空间对象
        namespace = client.V1Namespace(
            metadata=client.V1ObjectMeta(
                name=namespace_name,
                labels=labels
            )
        )

        core_v1.create_namespace(namespace)
        return True

    except ApiException as e:
        print(f"创建命名空间失败: {e}")
        return False
    except Exception as e:
        print(f"创建命名空间异常: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_namespace(cluster: Cluster, namespace_name: str) -> bool:
    """删除命名空间"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespace(namespace_name)
        return True

    except ApiException as e:
        print(f"删除命名空间失败: {e}")
        return False
    except Exception as e:
        print(f"删除命名空间异常: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_namespace_resources(cluster: Cluster, namespace_name: str) -> Optional[Dict[str, Any]]:
    """获取命名空间资源使用情况"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取Pods
        pods = core_v1.list_namespaced_pod(namespace_name)
        pod_count = len(pods.items)

        # 获取Services
        services = core_v1.list_namespaced_service(namespace_name)
        service_count = len(services.items)

        # 获取ConfigMaps
        configmaps = core_v1.list_namespaced_config_map(namespace_name)
        configmap_count = len(configmaps.items)

        # 获取Secrets
        secrets = core_v1.list_namespaced_secret(namespace_name)
        secret_count = len(secrets.items)

        # 获取PVCs
        pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace_name)
        pvc_count = len(pvcs.items)

        # 计算资源使用情况（简化的版本）
        cpu_requests = 0
        cpu_limits = 0
        memory_requests = 0
        memory_limits = 0

        for pod in pods.items:
            if pod.spec.containers:
                for container in pod.spec.containers:
                    if container.resources:
                        if container.resources.requests:
                            if container.resources.requests.get('cpu'):
                                cpu_requests += parse_cpu(container.resources.requests['cpu'])
                            if container.resources.requests.get('memory'):
                                memory_requests += parse_memory(container.resources.requests['memory'])

                        if container.resources.limits:
                            if container.resources.limits.get('cpu'):
                                cpu_limits += parse_cpu(container.resources.limits['cpu'])
                            if container.resources.limits.get('memory'):
                                memory_limits += parse_memory(container.resources.limits['memory'])

        return {
            "cpu_requests": f"{cpu_requests:.1f}",
            "cpu_limits": f"{cpu_limits:.1f}",
            "memory_requests": f"{memory_requests}Mi",
            "memory_limits": f"{memory_limits}Mi",
            "pods": pod_count,
            "persistent_volume_claims": pvc_count,
            "config_maps": configmap_count,
            "secrets": secret_count,
            "services": service_count
        }

    except Exception as e:
        print(f"获取命名空间资源信息失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def parse_cpu(cpu_str: str) -> float:
    """解析CPU资源字符串，返回核心数"""
    if cpu_str.endswith('m'):
        return float(cpu_str[:-1]) / 1000
    else:
        return float(cpu_str)

def parse_memory(memory_str: str) -> int:
    """解析内存资源字符串，返回MiB"""
    if memory_str.endswith('Gi'):
        return int(float(memory_str[:-2]) * 1024)
    elif memory_str.endswith('Mi'):
        return int(float(memory_str[:-2]))
    elif memory_str.endswith('Ki'):
        return int(float(memory_str[:-2]) / 1024)
    else:
        # 假设是字节
        return int(int(memory_str) / (1024 * 1024))


def get_pods_info(cluster: Cluster, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
    """获取Pod信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)

        if namespace:
            pods = core_v1.list_namespaced_pod(namespace)
        else:
            pods = core_v1.list_pod_for_all_namespaces()

        pod_list = []
        for pod in pods.items:
            # 获取Pod状态
            status = pod.status.phase

            # 获取容器重启次数
            restarts = 0
            ready_containers = "0/0"
            if pod.status.container_statuses:
                total_containers = len(pod.status.container_statuses)
                ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
                ready_containers = f"{ready_count}/{total_containers}"

                # 计算总重启次数
                restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

            # 计算Pod年龄
            from datetime import datetime
            age = "Unknown"
            if pod.metadata.creation_timestamp:
                created = pod.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            pod_info = {
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": status,
                "node_name": pod.spec.node_name,
                "age": age,
                "restarts": restarts,
                "ready_containers": ready_containers,
                "labels": dict(pod.metadata.labels) if pod.metadata.labels else {}
            }
            pod_list.append(pod_info)

        return pod_list

    except Exception as e:
        print(f"获取Pod信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_pod_details(cluster: Cluster, namespace: str, pod_name: str) -> Optional[Dict[str, Any]]:
    """获取Pod详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pod = core_v1.read_namespaced_pod(pod_name, namespace)

        # 获取Pod状态
        status = pod.status.phase

        # 获取容器信息
        restarts = 0
        ready_containers = "0/0"
        containers = []
        if pod.status.container_statuses:
            total_containers = len(pod.status.container_statuses)
            ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
            ready_containers = f"{ready_count}/{total_containers}"
            restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

            for i, cs in enumerate(pod.status.container_statuses):
                container_spec = pod.spec.containers[i] if i < len(pod.spec.containers) else None
                container_info = {
                    "name": cs.name,
                    "image": cs.image,
                    "ready": cs.ready,
                    "restart_count": cs.restart_count,
                    "state": str(cs.state) if cs.state else "Unknown",
                    "resources": {}
                }
                containers.append(container_info)

        # 获取卷信息
        volumes = []
        if pod.spec.volumes:
            for volume in pod.spec.volumes:
                volume_info = {"name": volume.name, "type": "Unknown"}
                if volume.config_map:
                    volume_info["type"] = "ConfigMap"
                    volume_info["source"] = volume.config_map.name
                elif volume.secret:
                    volume_info["type"] = "Secret"
                    volume_info["source"] = volume.secret.secret_name
                elif volume.persistent_volume_claim:
                    volume_info["type"] = "PVC"
                    volume_info["source"] = volume.persistent_volume_claim.claim_name
                volumes.append(volume_info)

        # 计算Pod年龄
        from datetime import datetime
        age = "Unknown"
        if pod.metadata.creation_timestamp:
            created = pod.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取事件（简化版本）
        events = []
        try:
            events_api = client.EventsV1Api(client_instance)
            pod_events = events_api.list_namespaced_event(namespace, field_selector=f"involvedObject.name={pod_name}")
            for event in pod_events.items[:10]:  # 只获取最近10个事件
                events.append({
                    "type": event.type,
                    "reason": event.reason,
                    "message": event.note,
                    "count": event.count,
                    "last_timestamp": str(event.last_timestamp) if event.last_timestamp else None
                })
        except:
            pass

        return {
            "name": pod.metadata.name,
            "namespace": namespace,
            "status": status,
            "node_name": pod.spec.node_name,
            "age": age,
            "restarts": restarts,
            "ready_containers": ready_containers,
            "labels": dict(pod.metadata.labels) if pod.metadata.labels else {},
            "annotations": dict(pod.metadata.annotations) if pod.metadata.annotations else {},
            "containers": containers,
            "volumes": volumes,
            "events": events,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Pod详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def get_pod_logs(cluster: Cluster, namespace: str, pod_name: str, container: Optional[str] = None, tail_lines: Optional[int] = 100) -> Optional[str]:
    """获取Pod日志"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        logs = core_v1.read_namespaced_pod_log(
            pod_name, namespace,
            container=container,
            tail_lines=tail_lines
        )
        return logs
    except Exception as e:
        print(f"获取Pod日志失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def restart_pod(cluster: Cluster, namespace: str, pod_name: str) -> bool:
    """重启Pod（通过删除Pod实现）"""
    return delete_pod(cluster, namespace, pod_name)


def delete_pod(cluster: Cluster, namespace: str, pod_name: str, force: bool = False) -> bool:
    """删除Pod

    Args:
        cluster: 集群配置
        namespace: 命名空间
        pod_name: Pod名称
        force: 是否强制删除（设置grace_period_seconds=0）
    """
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建删除选项
        delete_options = client.V1DeleteOptions()
        if force:
            delete_options.grace_period_seconds = 0

        core_v1.delete_namespaced_pod(
            name=pod_name,
            namespace=namespace,
            body=delete_options
        )
        return True
    except Exception as e:
        print(f"删除Pod失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_namespace_deployments(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        deployments = apps_v1.list_namespaced_deployment(namespace_name)

        deployment_list = []
        for deployment in deployments.items:
            # 获取部署状态
            replicas = deployment.spec.replicas or 0
            ready_replicas = deployment.status.ready_replicas or 0
            available_replicas = deployment.status.available_replicas or 0
            updated_replicas = deployment.status.updated_replicas or 0

            # 计算部署状态
            status = "Unknown"
            if deployment.status.conditions:
                for condition in deployment.status.conditions:
                    if condition.type == "Available":
                        status = "Available" if condition.status == "True" else "Unavailable"
                        break
                    elif condition.type == "Progressing":
                        status = "Progressing" if condition.status == "True" else "Failed"

            # 获取镜像列表
            images = []
            if deployment.spec.template.spec.containers:
                for container in deployment.spec.template.spec.containers:
                    images.append(container.image)

            # 计算部署年龄
            from datetime import datetime
            age = "Unknown"
            if deployment.metadata.creation_timestamp:
                created = deployment.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            deployment_info = {
                "name": deployment.metadata.name,
                "namespace": deployment.metadata.namespace,
                "replicas": replicas,
                "ready_replicas": ready_replicas,
                "available_replicas": available_replicas,
                "updated_replicas": updated_replicas,
                "age": age,
                "images": images,
                "labels": dict(deployment.metadata.labels) if deployment.metadata.labels else {},
                "status": status
            }
            deployment_list.append(deployment_info)

        return deployment_list

    except Exception as e:
        print(f"获取命名空间部署失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_namespace_services(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        services = core_v1.list_namespaced_service(namespace_name)

        service_list = []
        for service in services.items:
            # 获取服务类型和IP
            service_type = service.spec.type or "ClusterIP"
            cluster_ip = service.spec.cluster_ip
            external_ip = None

            if service.status.load_balancer and service.status.load_balancer.ingress:
                for ingress in service.status.load_balancer.ingress:
                    if ingress.hostname:
                        external_ip = ingress.hostname
                        break
                    elif ingress.ip:
                        external_ip = ingress.ip
                        break

            # 获取端口信息
            ports = []
            if service.spec.ports:
                for port in service.spec.ports:
                    ports.append({
                        "name": port.name,
                        "protocol": port.protocol,
                        "port": port.port,
                        "target_port": port.target_port,
                        "node_port": port.node_port
                    })

            # 计算服务年龄
            from datetime import datetime
            age = "Unknown"
            if service.metadata.creation_timestamp:
                created = service.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            service_info = {
                "name": service.metadata.name,
                "namespace": service.metadata.namespace,
                "type": service_type,
                "cluster_ip": cluster_ip,
                "external_ip": external_ip,
                "ports": ports,
                "selector": dict(service.spec.selector) if service.spec.selector else {},
                "labels": dict(service.metadata.labels) if service.metadata.labels else {},
                "annotations": dict(service.metadata.annotations) if service.metadata.annotations else {},
                "age": age
            }
            service_list.append(service_info)

        return service_list

    except Exception as e:
        print(f"获取命名空间服务失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_namespace_crds(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的自定义资源"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        # 使用CustomObjectsApi获取CRDs
        custom_api = client.CustomObjectsApi(client_instance)

        # 首先获取所有CRDs定义
        api_client = client.ApiextensionsV1Api(client_instance)
        crds = api_client.list_custom_resource_definition()

        crd_list = []
        for crd in crds.items:
            # 检查CRD是否支持命名空间范围
            scope = crd.spec.scope
            if scope == "Namespaced":
                # 尝试获取该CRD的实例
                group = crd.spec.group
                version = crd.spec.versions[0].version if crd.spec.versions else "v1"
                plural = crd.spec.names.plural

                try:
                    # 获取该命名空间中的CRD实例
                    resources = custom_api.list_namespaced_custom_object(
                        group, version, namespace_name, plural
                    )

                    for resource in resources.get('items', []):
                        # 计算年龄
                        from datetime import datetime
                        age = "Unknown"
                        if resource.get('metadata', {}).get('creationTimestamp'):
                            created_str = resource['metadata']['creationTimestamp']
                            try:
                                created = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                                now = datetime.now(created.tzinfo)
                                delta = now - created
                                if delta.days > 0:
                                    age = f"{delta.days}d"
                                elif delta.seconds // 3600 > 0:
                                    age = f"{delta.seconds // 3600}h"
                                elif delta.seconds // 60 > 0:
                                    age = f"{delta.seconds // 60}m"
                                else:
                                    age = f"{delta.seconds}s"
                            except:
                                pass

                        crd_info = {
                            "name": resource.get('metadata', {}).get('name', ''),
                            "namespace": namespace_name,
                            "kind": crd.spec.names.kind,
                            "group": group,
                            "version": version,
                            "age": age,
                            "labels": resource.get('metadata', {}).get('labels', {}),
                            "annotations": resource.get('metadata', {}).get('annotations', {})
                        }
                        crd_list.append(crd_info)

                except Exception as e:
                    # 如果无法获取该CRD的实例，跳过
                    continue

        return crd_list

    except Exception as e:
        print(f"获取命名空间CRD失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_deployment_details(cluster: Cluster, namespace: str, deployment_name: str) -> Optional[Dict[str, Any]]:
    """获取部署详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        # 获取基本信息
        replicas = deployment.spec.replicas or 0
        ready_replicas = deployment.status.ready_replicas or 0
        available_replicas = deployment.status.available_replicas or 0
        updated_replicas = deployment.status.updated_replicas or 0
        unavailable_replicas = deployment.status.unavailable_replicas or 0

        # 计算年龄和创建时间
        from datetime import datetime
        age = "Unknown"
        creation_timestamp = "Unknown"
        if deployment.metadata.creation_timestamp:
            created = deployment.metadata.creation_timestamp.replace(tzinfo=None)
            creation_timestamp = str(created)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取策略信息
        strategy = {}
        if deployment.spec.strategy:
            strategy = {
                "type": deployment.spec.strategy.type,
                "rolling_update": {
                    "max_surge": str(deployment.spec.strategy.rolling_update.max_surge) if deployment.spec.strategy.rolling_update else None,
                    "max_unavailable": str(deployment.spec.strategy.rolling_update.max_unavailable) if deployment.spec.strategy.rolling_update else None
                } if deployment.spec.strategy.rolling_update else None
            }

        # 获取选择器
        selector = {}
        if deployment.spec.selector.match_labels:
            selector = dict(deployment.spec.selector.match_labels)

        # 获取条件
        conditions = []
        if deployment.status.conditions:
            for condition in deployment.status.conditions:
                conditions.append({
                    "type": condition.type,
                    "status": condition.status,
                    "last_update_time": str(condition.last_update_time) if condition.last_update_time else None,
                    "last_transition_time": str(condition.last_transition_time) if condition.last_transition_time else None,
                    "reason": condition.reason,
                    "message": condition.message
                })

        # 转换spec和status为字典格式
        spec_dict = {}
        status_dict = {}

        try:
            # 将Kubernetes对象转换为字典
            spec_dict = client.ApiClient().sanitize_for_serialization(deployment.spec)
        except Exception as e:
            print(f"转换spec失败: {e}")
            spec_dict = {}

        try:
            # 将Kubernetes对象转换为字典
            status_dict = client.ApiClient().sanitize_for_serialization(deployment.status)
        except Exception as e:
            print(f"转换status失败: {e}")
            status_dict = {}

        return {
            "name": deployment.metadata.name,
            "namespace": namespace,
            "replicas": replicas,
            "ready_replicas": ready_replicas,
            "available_replicas": available_replicas,
            "updated_replicas": updated_replicas,
            "unavailable_replicas": unavailable_replicas,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "strategy": strategy,
            "selector": selector,
            "labels": dict(deployment.metadata.labels) if deployment.metadata.labels else {},
            "annotations": dict(deployment.metadata.annotations) if deployment.metadata.annotations else {},
            "conditions": conditions,
            "spec": spec_dict,
            "status": status_dict,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取部署详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def get_deployment_pods(cluster: Cluster, namespace: str, deployment_name: str) -> List[Dict[str, Any]]:
    """获取部署管理的Pods"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        # 首先获取部署的选择器
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        if not deployment.spec.selector.match_labels:
            return []

        selector_labels = deployment.spec.selector.match_labels

        # 构建标签选择器字符串
        selector_parts = []
        for key, value in selector_labels.items():
            selector_parts.append(f"{key}={value}")
        label_selector = ",".join(selector_parts)

        # 使用选择器获取Pods
        core_v1 = client.CoreV1Api(client_instance)
        pods = core_v1.list_namespaced_pod(namespace, label_selector=label_selector)

        pod_list = []
        for pod in pods.items:
            # 获取Pod状态
            status = pod.status.phase

            # 获取容器重启次数
            restarts = 0
            ready_containers = "0/0"
            if pod.status.container_statuses:
                total_containers = len(pod.status.container_statuses)
                ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
                ready_containers = f"{ready_count}/{total_containers}"

                # 计算总重启次数
                restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

            # 计算Pod年龄
            from datetime import datetime
            age = "Unknown"
            if pod.metadata.creation_timestamp:
                created = pod.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            pod_info = {
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": status,
                "node_name": pod.spec.node_name,
                "age": age,
                "restarts": restarts,
                "ready_containers": ready_containers,
                "labels": dict(pod.metadata.labels) if pod.metadata.labels else {}
            }
            pod_list.append(pod_info)

        return pod_list

    except Exception as e:
        print(f"获取部署Pods失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def scale_deployment(cluster: Cluster, namespace: str, deployment_name: str, replicas: int) -> bool:
    """扩容/缩容部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)

        # 创建scale对象
        scale = client.V1Scale(
            spec=client.V1ScaleSpec(replicas=replicas)
        )

        apps_v1.patch_namespaced_deployment_scale(
            deployment_name, namespace, scale
        )
        return True

    except Exception as e:
        print(f"扩容部署失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def restart_deployment(cluster: Cluster, namespace: str, deployment_name: str) -> bool:
    """重启部署（通过更新注解实现）"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)

        # 通过更新注解来触发重启
        from datetime import datetime
        restart_annotation = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": datetime.utcnow().isoformat()
                        }
                    }
                }
            }
        }

        apps_v1.patch_namespaced_deployment(
            deployment_name, namespace, restart_annotation
        )
        return True

    except Exception as e:
        print(f"重启部署失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_deployment(cluster: Cluster, namespace: str, deployment_name: str) -> bool:
    """删除部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        apps_v1.delete_namespaced_deployment(deployment_name, namespace)
        return True
    except Exception as e:
        print(f"删除部署失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_deployment_services(cluster: Cluster, namespace: str, deployment_name: str) -> List[Dict[str, Any]]:
    """获取部署关联的服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        # 首先获取部署的选择器
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        if not deployment.spec.selector.match_labels:
            return []

        deployment_labels = deployment.spec.selector.match_labels

        # 获取所有服务，筛选匹配的选择器
        core_v1 = client.CoreV1Api(client_instance)
        services = core_v1.list_namespaced_service(namespace)

        matching_services = []
        for service in services.items:
            if service.spec.selector:
                # 检查服务选择器是否匹配部署标签
                selector_matches = True
                for key, value in service.spec.selector.items():
                    if deployment_labels.get(key) != value:
                        selector_matches = False
                        break

                if selector_matches:
                    # 获取服务基本信息
                    service_type = service.spec.type or "ClusterIP"
                    cluster_ip = service.spec.cluster_ip
                    external_ip = None

                    if service.status.load_balancer and service.status.load_balancer.ingress:
                        for ingress in service.status.load_balancer.ingress:
                            if ingress.hostname:
                                external_ip = ingress.hostname
                                break
                            elif ingress.ip:
                                external_ip = ingress.ip
                                break

                    # 获取端口信息
                    ports = []
                    if service.spec.ports:
                        for port in service.spec.ports:
                            ports.append({
                                "name": port.name,
                                "protocol": port.protocol,
                                "port": port.port,
                                "target_port": port.target_port,
                                "node_port": port.node_port
                            })

                    service_info = {
                        "name": service.metadata.name,
                        "namespace": service.metadata.namespace,
                        "type": service_type,
                        "cluster_ip": cluster_ip,
                        "external_ip": external_ip,
                        "ports": ports,
                        "selector": dict(service.spec.selector),
                        "labels": dict(service.metadata.labels) if service.metadata.labels else {},
                        "annotations": dict(service.metadata.annotations) if service.metadata.annotations else {}
                    }
                    matching_services.append(service_info)

        return matching_services

    except Exception as e:
        print(f"获取部署服务失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_service_details(cluster: Cluster, namespace: str, service_name: str) -> Optional[Dict[str, Any]]:
    """获取服务详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        service = core_v1.read_namespaced_service(service_name, namespace)

        # 获取服务类型和IP
        service_type = service.spec.type or "ClusterIP"
        cluster_ip = service.spec.cluster_ip
        external_ip = None

        if service.status.load_balancer and service.status.load_balancer.ingress:
            for ingress in service.status.load_balancer.ingress:
                if ingress.hostname:
                    external_ip = ingress.hostname
                    break
                elif ingress.ip:
                    external_ip = ingress.ip
                    break

        # 获取端口信息
        ports = []
        if service.spec.ports:
            for port in service.spec.ports:
                ports.append({
                    "name": port.name,
                    "protocol": port.protocol,
                    "port": port.port,
                    "target_port": port.target_port,
                    "node_port": port.node_port
                })

        # 获取会话亲和性
        session_affinity = service.spec.session_affinity or "None"

        # 获取外部流量策略（仅对LoadBalancer和NodePort有效）
        external_traffic_policy = getattr(service.spec, 'external_traffic_policy', None)

        # 计算服务年龄
        from datetime import datetime
        age = "Unknown"
        if service.metadata.creation_timestamp:
            created = service.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": service.metadata.name,
            "namespace": namespace,
            "type": service_type,
            "cluster_ip": cluster_ip,
            "external_ip": external_ip,
            "ports": ports,
            "selector": dict(service.spec.selector) if service.spec.selector else {},
            "labels": dict(service.metadata.labels) if service.metadata.labels else {},
            "annotations": dict(service.metadata.annotations) if service.metadata.annotations else {},
            "age": age,
            "session_affinity": session_affinity,
            "external_traffic_policy": external_traffic_policy,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取服务详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


# 以下是其他需要实现的函数的存根，暂时返回默认值以避免导入错误
def update_deployment(cluster: Cluster, namespace: str, deployment_name: str, update_data: dict) -> bool:
    """更新部署（暂未实现）"""
    print(f"update_deployment 暂未实现: {namespace}/{deployment_name}")
    return False


def get_deployment_yaml(cluster: Cluster, namespace: str, deployment_name: str) -> Optional[str]:
    """获取部署YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        print(f"无法创建Kubernetes客户端连接: {cluster.name}")
        return None

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        print(f"正在获取部署: {namespace}/{deployment_name} 在集群 {cluster.name}")
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        # 将Kubernetes对象转换为YAML
        import yaml
        from io import StringIO

        # 使用Kubernetes Python客户端的序列化方法
        api_client = client.ApiClient()
        deployment_dict = api_client.sanitize_for_serialization(deployment)

        # 转换为YAML字符串
        yaml_output = StringIO()
        yaml.dump(deployment_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
        yaml_content = yaml_output.getvalue()

        print(f"成功获取部署YAML，长度: {len(yaml_content)} 字符")
        return yaml_content

    except Exception as e:
        print(f"获取部署YAML失败: {namespace}/{deployment_name}, 错误: {e}")
        import traceback
        print(f"详细错误信息: {traceback.format_exc()}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def update_deployment_yaml(cluster: Cluster, namespace: str, deployment_name: str, yaml_content: str) -> bool:
    """更新部署YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        import yaml
        from kubernetes.client.models import V1Deployment

        apps_v1 = client.AppsV1Api(client_instance)

        # 解析YAML内容
        deployment_dict = yaml.safe_load(yaml_content)

        # 创建Deployment对象
        deployment = V1Deployment(
            api_version=deployment_dict.get('apiVersion'),
            kind=deployment_dict.get('kind'),
            metadata=client.V1ObjectMeta(**deployment_dict.get('metadata', {})),
            spec=client.V1DeploymentSpec(**deployment_dict.get('spec', {}))
        )

        # 更新部署
        apps_v1.replace_namespaced_deployment(
            name=deployment_name,
            namespace=namespace,
            body=deployment
        )

        return True

    except Exception as e:
        print(f"更新部署YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_service(cluster: Cluster, namespace: str, service_name: str, update_data: dict) -> bool:
    """更新服务（暂未实现）"""
    print(f"update_service 暂未实现: {namespace}/{service_name}")
    return False


def get_service_yaml(cluster: Cluster, namespace: str, service_name: str) -> Optional[str]:
    """获取服务YAML（暂未实现）"""
    print(f"get_service_yaml 暂未实现: {namespace}/{service_name}")
    return None


def update_service_yaml(cluster: Cluster, namespace: str, service_name: str, yaml_content: str) -> bool:
    """更新服务YAML（暂未实现）"""
    print(f"update_service_yaml 暂未实现: {namespace}/{service_name}")
    return False


def create_service(cluster: Cluster, service_data: dict) -> bool:
    """创建服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建服务对象
        service_spec = client.V1ServiceSpec(
            type=service_data.get('type', 'ClusterIP'),
            selector=service_data.get('selector', {}),
            ports=[]
        )

        # 添加端口
        if service_data.get('ports'):
            for port_data in service_data['ports']:
                port = client.V1ServicePort(
                    name=port_data.get('name'),
                    protocol=port_data.get('protocol', 'TCP'),
                    port=port_data['port'],
                    target_port=port_data.get('target_port', port_data['port']),
                    node_port=port_data.get('node_port')
                )
                service_spec.ports.append(port)

        # 设置负载均衡器IP
        if service_data.get('load_balancer_ip'):
            service_spec.load_balancer_ip = service_data['load_balancer_ip']

        # 设置外部流量策略
        if service_data.get('external_traffic_policy'):
            service_spec.external_traffic_policy = service_data['external_traffic_policy']

        # 设置会话亲和性
        if service_data.get('session_affinity'):
            service_spec.session_affinity = service_data['session_affinity']
            if service_data.get('session_affinity_config'):
                service_spec.session_affinity_config = client.V1SessionAffinityConfig(
                    client_ip=client.V1ClientIPConfig(**service_data['session_affinity_config'])
                )

        service = client.V1Service(
            metadata=client.V1ObjectMeta(
                name=service_data['name'],
                labels=service_data.get('labels'),
                annotations=service_data.get('annotations')
            ),
            spec=service_spec
        )

        core_v1.create_namespaced_service(service_data['namespace'], service)
        return True

    except Exception as e:
        print(f"创建服务失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_service(cluster: Cluster, namespace: str, service_name: str) -> bool:
    """删除服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_service(service_name, namespace)
        return True

    except Exception as e:
        print(f"删除服务失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== ConfigMap相关函数 ==========

def get_namespace_configmaps(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的ConfigMaps"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        print(f"警告: 无法连接到集群 {cluster.name}，返回空列表")
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        configmaps = core_v1.list_namespaced_config_map(namespace)

        configmap_list = []
        for cm in configmaps.items:
            # 获取数据
            data = dict(cm.data) if cm.data else {}

            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if cm.metadata.creation_timestamp:
                created = cm.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            configmap_info = {
                "name": cm.metadata.name,
                "namespace": cm.metadata.namespace,
                "data": data,
                "labels": dict(cm.metadata.labels) if cm.metadata.labels else {},
                "annotations": dict(cm.metadata.annotations) if cm.metadata.annotations else {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            }
            configmap_list.append(configmap_info)

        return configmap_list

    except Exception as e:
        print(f"获取ConfigMaps失败 (集群: {cluster.name}, 命名空间: {namespace}): {e}")
        # 返回空列表而不是抛出异常，让前端能正常工作
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_configmap_details(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[Dict[str, Any]]:
    """获取ConfigMap详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        configmap = core_v1.read_namespaced_config_map(configmap_name, namespace)

        # 获取数据
        data = dict(configmap.data) if configmap.data else {}

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if configmap.metadata.creation_timestamp:
            created = configmap.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": configmap.metadata.name,
            "namespace": configmap.metadata.namespace,
            "data": data,
            "labels": dict(configmap.metadata.labels) if configmap.metadata.labels else {},
            "annotations": dict(configmap.metadata.annotations) if configmap.metadata.annotations else {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取ConfigMap详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_configmap(cluster: Cluster, configmap_data: dict) -> bool:
    """创建ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        configmap = client.V1ConfigMap(
            metadata=client.V1ObjectMeta(
                name=configmap_data['name'],
                labels=configmap_data.get('labels'),
                annotations=configmap_data.get('annotations')
            ),
            data=configmap_data.get('data', {})
        )

        core_v1.create_namespaced_config_map(configmap_data['namespace'], configmap)
        return True

    except Exception as e:
        print(f"创建ConfigMap失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_configmap(cluster: Cluster, namespace: str, configmap_name: str, update_data: dict) -> bool:
    """更新ConfigMap（暂未实现）"""
    print(f"update_configmap 暂未实现: {namespace}/{configmap_name}")
    return False


def delete_configmap(cluster: Cluster, namespace: str, configmap_name: str) -> bool:
    """删除ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_config_map(configmap_name, namespace)
        return True

    except Exception as e:
        print(f"删除ConfigMap失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[str]:
    """获取ConfigMap YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        configmap = core_v1.read_namespaced_config_map(configmap_name, namespace)

        # 转换为YAML格式
        yaml_content = yaml.dump(configmap.to_dict(), default_flow_style=False)
        return yaml_content

    except Exception as e:
        print(f"获取ConfigMap YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_configmap_from_yaml(cluster: Cluster, yaml_content: str) -> bool:
    """通过YAML创建ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        # 解析YAML内容
        configmap_dict = yaml.safe_load(yaml_content)
        if not configmap_dict:
            print("YAML内容无效")
            return False

        # 提取metadata
        metadata = configmap_dict.get('metadata', {})
        name = metadata.get('name')
        namespace = metadata.get('namespace', 'default')

        if not name:
            print("ConfigMap名称不能为空")
            return False

        core_v1 = client.CoreV1Api(client_instance)

        # 创建ConfigMap对象
        configmap = client.V1ConfigMap(
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=namespace,
                labels=metadata.get('labels'),
                annotations=metadata.get('annotations')
            ),
            data=configmap_dict.get('data', {})
        )

        core_v1.create_namespaced_config_map(namespace, configmap)
        return True

    except Exception as e:
        print(f"通过YAML创建ConfigMap失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str, yaml_content: str) -> bool:
    """更新ConfigMap YAML（暂未实现）"""
    print(f"update_configmap_yaml 暂未实现: {namespace}/{configmap_name}")
    return False


# ========== Resource Quota相关函数 ==========

def get_namespace_resource_quotas(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的Resource Quotas"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        quotas = core_v1.list_namespaced_resource_quota(namespace)

        quota_list = []
        for quota in quotas.items:
            # 获取hard限制
            hard = dict(quota.spec.hard) if quota.spec.hard else {}

            # 获取used使用情况
            used = dict(quota.status.used) if quota.status and quota.status.used else {}

            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if quota.metadata.creation_timestamp:
                created = quota.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            quota_info = {
                "name": quota.metadata.name,
                "namespace": quota.metadata.namespace,
                "hard": hard,
                "used": used,
                "labels": dict(quota.metadata.labels) if quota.metadata.labels else {},
                "annotations": dict(quota.metadata.annotations) if quota.metadata.annotations else {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            }
            quota_list.append(quota_info)

        return quota_list

    except Exception as e:
        print(f"获取Resource Quotas失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_resource_quota_details(cluster: Cluster, namespace: str, quota_name: str) -> Optional[Dict[str, Any]]:
    """获取Resource Quota详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        quota = core_v1.read_namespaced_resource_quota(quota_name, namespace)

        # 获取hard限制
        hard = dict(quota.spec.hard) if quota.spec.hard else {}

        # 获取used使用情况
        used = dict(quota.status.used) if quota.status and quota.status.used else {}

        # 获取scopes
        scopes = quota.spec.scopes if quota.spec.scopes else []

        # 获取scope_selector
        scope_selector = []
        if quota.spec.scope_selector:
            for match_expression in quota.spec.scope_selector.match_expressions:
                scope_selector.append({
                    "scope_name": match_expression.scope_name,
                    "operator": match_expression.operator,
                    "values": match_expression.values
                })

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if quota.metadata.creation_timestamp:
            created = quota.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": quota.metadata.name,
            "namespace": quota.metadata.namespace,
            "hard": hard,
            "used": used,
            "scopes": scopes,
            "scope_selector": scope_selector,
            "labels": dict(quota.metadata.labels) if quota.metadata.labels else {},
            "annotations": dict(quota.metadata.annotations) if quota.metadata.annotations else {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Resource Quota详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_resource_quota(cluster: Cluster, quota_data: dict) -> bool:
    """创建Resource Quota"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建Resource Quota对象
        spec = client.V1ResourceQuotaSpec(hard=quota_data.get('hard', {}))

        # 设置scopes
        if quota_data.get('scopes'):
            spec.scopes = quota_data['scopes']

        # 设置scope_selector
        if quota_data.get('scope_selector'):
            scope_selector = client.V1ScopeSelector()
            match_expressions = []
            for selector in quota_data['scope_selector']:
                match_expressions.append(client.V1ScopedResourceSelectorRequirement(
                    scope_name=selector.get('scope_name'),
                    operator=selector.get('operator'),
                    values=selector.get('values', [])
                ))
            scope_selector.match_expressions = match_expressions
            spec.scope_selector = scope_selector

        quota = client.V1ResourceQuota(
            metadata=client.V1ObjectMeta(
                name=quota_data['name'],
                labels=quota_data.get('labels'),
                annotations=quota_data.get('annotations')
            ),
            spec=spec
        )

        core_v1.create_namespaced_resource_quota(quota_data['namespace'], quota)
        return True

    except Exception as e:
        print(f"创建Resource Quota失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_resource_quota(cluster: Cluster, namespace: str, quota_name: str, update_data: dict) -> bool:
    """更新Resource Quota"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取现有的Resource Quota
        existing_quota = core_v1.read_namespaced_resource_quota(quota_name, namespace)

        # 更新spec
        if 'hard' in update_data:
            existing_quota.spec.hard = update_data['hard']
        if 'scopes' in update_data:
            existing_quota.spec.scopes = update_data['scopes']
        if 'scope_selector' in update_data and update_data['scope_selector']:
            scope_selector = client.V1ScopeSelector()
            match_expressions = []
            for selector in update_data['scope_selector']:
                match_expressions.append(client.V1ScopedResourceSelectorRequirement(
                    scope_name=selector.get('scope_name'),
                    operator=selector.get('operator'),
                    values=selector.get('values', [])
                ))
            scope_selector.match_expressions = match_expressions
            existing_quota.spec.scope_selector = scope_selector

        # 更新metadata
        if 'labels' in update_data:
            existing_quota.metadata.labels = update_data['labels']
        if 'annotations' in update_data:
            existing_quota.metadata.annotations = update_data['annotations']

        # 执行更新
        core_v1.replace_namespaced_resource_quota(quota_name, namespace, existing_quota)
        return True

    except Exception as e:
        print(f"更新Resource Quota失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_resource_quota(cluster: Cluster, namespace: str, quota_name: str) -> bool:
    """删除Resource Quota"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_resource_quota(quota_name, namespace)
        return True

    except Exception as e:
        print(f"删除Resource Quota失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Secret相关函数 ==========

def get_namespace_secrets(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的Secrets"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secrets = core_v1.list_namespaced_secret(namespace)

        secret_list = []
        for secret in secrets.items:
            # 获取数据键
            data_keys = list(secret.data.keys()) if secret.data else []

            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if secret.metadata.creation_timestamp:
                created = secret.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            secret_info = {
                "name": secret.metadata.name,
                "namespace": secret.metadata.namespace,
                "type": secret.type if secret.type else "Opaque",
                "data_keys": data_keys,
                "labels": dict(secret.metadata.labels) if secret.metadata.labels else {},
                "annotations": dict(secret.metadata.annotations) if secret.metadata.annotations else {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            }
            secret_list.append(secret_info)

        return secret_list

    except Exception as e:
        print(f"获取Secrets失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_secret_details(cluster: Cluster, namespace: str, secret_name: str) -> Optional[Dict[str, Any]]:
    """获取Secret详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secret = core_v1.read_namespaced_secret(secret_name, namespace)

        # 解码数据（base64解码）
        data = {}
        if secret.data:
            import base64
            for key, value in secret.data.items():
                try:
                    data[key] = base64.b64decode(value).decode('utf-8')
                except:
                    data[key] = "<binary data>"

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if secret.metadata.creation_timestamp:
            created = secret.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": secret.metadata.name,
            "namespace": secret.metadata.namespace,
            "type": secret.type if secret.type else "Opaque",
            "data": data,
            "labels": dict(secret.metadata.labels) if secret.metadata.labels else {},
            "annotations": dict(secret.metadata.annotations) if secret.metadata.annotations else {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Secret详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_secret(cluster: Cluster, secret_data: dict) -> bool:
    """创建Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 编码数据（base64编码）
        data = {}
        if secret_data.get('data'):
            import base64
            for key, value in secret_data['data'].items():
                if isinstance(value, str):
                    data[key] = base64.b64encode(value.encode('utf-8')).decode('utf-8')
                else:
                    data[key] = base64.b64encode(str(value).encode('utf-8')).decode('utf-8')

        secret = client.V1Secret(
            metadata=client.V1ObjectMeta(
                name=secret_data['name'],
                labels=secret_data.get('labels'),
                annotations=secret_data.get('annotations')
            ),
            type=secret_data.get('type', 'Opaque'),
            data=data
        )

        core_v1.create_namespaced_secret(secret_data['namespace'], secret)
        return True

    except Exception as e:
        print(f"创建Secret失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_secret(cluster: Cluster, namespace: str, secret_name: str, update_data: dict) -> bool:
    """更新Secret（暂未实现）"""
    print(f"update_secret 暂未实现: {namespace}/{secret_name}")
    return False


def delete_secret(cluster: Cluster, namespace: str, secret_name: str) -> bool:
    """删除Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_secret(secret_name, namespace)
        return True

    except Exception as e:
        print(f"删除Secret失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_secret_yaml(cluster: Cluster, namespace: str, secret_name: str) -> Optional[str]:
    """获取Secret YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secret = core_v1.read_namespaced_secret(secret_name, namespace)

        # 转换为YAML格式
        yaml_content = yaml.dump(secret.to_dict(), default_flow_style=False)
        return yaml_content

    except Exception as e:
        print(f"获取Secret YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_secret_yaml(cluster: Cluster, yaml_content: str) -> bool:
    """通过YAML创建Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        # 解析YAML内容
        secret_dict = yaml.safe_load(yaml_content)
        if not secret_dict:
            print("YAML内容无效")
            return False

        # 提取metadata
        metadata = secret_dict.get('metadata', {})
        name = metadata.get('name')
        namespace = metadata.get('namespace', 'default')

        if not name:
            print("Secret名称不能为空")
            return False

        core_v1 = client.CoreV1Api(client_instance)

        # 创建Secret对象
        secret = client.V1Secret(
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=namespace,
                labels=metadata.get('labels'),
                annotations=metadata.get('annotations')
            ),
            type=secret_dict.get('type', 'Opaque'),
            data=secret_dict.get('data', {}),
            string_data=secret_dict.get('stringData', {})
        )

        core_v1.create_namespaced_secret(namespace, secret)
        return True

    except Exception as e:
        print(f"通过YAML创建Secret失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_secret_yaml(cluster: Cluster, namespace: str, secret_name: str, yaml_content: str) -> bool:
    """更新Secret YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        # 解析YAML内容
        secret_dict = yaml.safe_load(yaml_content)
        if not secret_dict:
            print("YAML内容无效")
            return False

        # 验证Secret名称匹配
        metadata = secret_dict.get('metadata', {})
        yaml_secret_name = metadata.get('name')
        if yaml_secret_name != secret_name:
            print(f"Secret名称不匹配: YAML中为{yaml_secret_name}, 请求为{secret_name}")
            return False

        core_v1 = client.CoreV1Api(client_instance)

        # 创建Secret对象
        secret = client.V1Secret(
            metadata=client.V1ObjectMeta(
                name=secret_name,
                namespace=namespace,
                labels=metadata.get('labels'),
                annotations=metadata.get('annotations')
            ),
            type=secret_dict.get('type', 'Opaque'),
            data=secret_dict.get('data', {}),
            string_data=secret_dict.get('stringData', {})
        )

        # 更新Secret
        core_v1.replace_namespaced_secret(secret_name, namespace, secret)
        return True

    except Exception as e:
        print(f"更新Secret YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Network Policy相关函数 ==========

def get_namespace_network_policies(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的Network Policies"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        policies = networking_v1.list_namespaced_network_policy(namespace)

        policy_list = []
        for policy in policies.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if policy.metadata.creation_timestamp:
                created = policy.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            policy_info = {
                "name": policy.metadata.name,
                "namespace": policy.metadata.namespace,
                "pod_selector": dict(policy.spec.pod_selector.match_labels) if policy.spec.pod_selector and policy.spec.pod_selector.match_labels else {},
                "policy_types": policy.spec.policy_types if policy.spec.policy_types else [],
                "labels": dict(policy.metadata.labels) if policy.metadata.labels else {},
                "annotations": dict(policy.metadata.annotations) if policy.metadata.annotations else {},
                "age": age
            }
            policy_list.append(policy_info)

        return policy_list

    except Exception as e:
        print(f"获取Network Policies失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_network_policy_details(cluster: Cluster, namespace: str, policy_name: str) -> Optional[Dict[str, Any]]:
    """获取Network Policy详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        policy = networking_v1.read_namespaced_network_policy(policy_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if policy.metadata.creation_timestamp:
            created = policy.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": policy.metadata.name,
            "namespace": policy.metadata.namespace,
            "pod_selector": dict(policy.spec.pod_selector.match_labels) if policy.spec.pod_selector and policy.spec.pod_selector.match_labels else {},
            "policy_types": policy.spec.policy_types if policy.spec.policy_types else [],
            "ingress": [],  # 简化处理
            "egress": [],   # 简化处理
            "labels": dict(policy.metadata.labels) if policy.metadata.labels else {},
            "annotations": dict(policy.metadata.annotations) if policy.metadata.annotations else {},
            "age": age
        }

    except Exception as e:
        print(f"获取Network Policy详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def _build_network_policy_rules(rules_data: List[dict]) -> List[client.V1NetworkPolicyIngressRule]:
    """构建Network Policy规则"""
    rules = []
    for rule_data in rules_data:
        rule = client.V1NetworkPolicyIngressRule()

        # 处理from字段 (podSelector, namespaceSelector, ipBlock)
        if 'from' in rule_data and rule_data['from']:
            rule._from = []
            for from_item in rule_data['from']:
                peer = client.V1NetworkPolicyPeer()

                if 'podSelector' in from_item and from_item['podSelector']:
                    peer.pod_selector = client.V1LabelSelector(
                        match_labels=from_item['podSelector']
                    )

                if 'namespaceSelector' in from_item and from_item['namespaceSelector']:
                    peer.namespace_selector = client.V1LabelSelector(
                        match_labels=from_item['namespaceSelector']
                    )

                if 'ipBlock' in from_item and from_item['ipBlock']:
                    ip_block = client.V1NetworkPolicyIPBlock(
                        cidr=from_item['ipBlock'].get('cidr', ''),
                        except_=from_item['ipBlock'].get('except', [])
                    )
                    peer.ip_block = ip_block

                rule._from.append(peer)

        # 处理ports字段
        if 'ports' in rule_data and rule_data['ports']:
            rule.ports = []
            for port_data in rule_data['ports']:
                port = client.V1NetworkPolicyPort()

                if 'port' in port_data:
                    port.port = port_data['port']
                if 'protocol' in port_data:
                    port.protocol = port_data['protocol']
                if 'endPort' in port_data:
                    port.end_port = port_data['endPort']

                rule.ports.append(port)

        rules.append(rule)

    return rules

def _build_network_policy_egress_rules(rules_data: List[dict]) -> List[client.V1NetworkPolicyEgressRule]:
    """构建Network Policy出站规则"""
    rules = []
    for rule_data in rules_data:
        rule = client.V1NetworkPolicyEgressRule()

        # 处理to字段 (podSelector, namespaceSelector, ipBlock)
        if 'to' in rule_data and rule_data['to']:
            rule.to = []
            for to_item in rule_data['to']:
                peer = client.V1NetworkPolicyPeer()

                if 'podSelector' in to_item and to_item['podSelector']:
                    peer.pod_selector = client.V1LabelSelector(
                        match_labels=to_item['podSelector']
                    )

                if 'namespaceSelector' in to_item and to_item['namespaceSelector']:
                    peer.namespace_selector = client.V1LabelSelector(
                        match_labels=to_item['namespaceSelector']
                    )

                if 'ipBlock' in to_item and to_item['ipBlock']:
                    ip_block = client.V1NetworkPolicyIPBlock(
                        cidr=to_item['ipBlock'].get('cidr', ''),
                        except_=to_item['ipBlock'].get('except', [])
                    )
                    peer.ip_block = ip_block

                rule.to.append(peer)

        # 处理ports字段
        if 'ports' in rule_data and rule_data['ports']:
            rule.ports = []
            for port_data in rule_data['ports']:
                port = client.V1NetworkPolicyPort()

                if 'port' in port_data:
                    port.port = port_data['port']
                if 'protocol' in port_data:
                    port.protocol = port_data['protocol']
                if 'endPort' in port_data:
                    port.end_port = port_data['endPort']

                rule.ports.append(port)

        rules.append(rule)

    return rules

def create_network_policy(cluster: Cluster, policy_data: dict) -> bool:
    """创建Network Policy"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 构建Network Policy对象
        policy_spec = client.V1NetworkPolicySpec(
            pod_selector=client.V1LabelSelector(match_labels=policy_data.get('pod_selector', {})),
            policy_types=policy_data.get('policy_types', [])
        )

        # 处理ingress规则
        if policy_data.get('ingress'):
            policy_spec.ingress = _build_network_policy_rules(policy_data['ingress'])

        # 处理egress规则
        if policy_data.get('egress'):
            policy_spec.egress = _build_network_policy_egress_rules(policy_data['egress'])

        policy = client.V1NetworkPolicy(
            metadata=client.V1ObjectMeta(
                name=policy_data['name'],
                labels=policy_data.get('labels'),
                annotations=policy_data.get('annotations')
            ),
            spec=policy_spec
        )

        networking_v1.create_namespaced_network_policy(policy_data['namespace'], policy)
        return True

    except Exception as e:
        print(f"创建Network Policy失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_network_policy(cluster: Cluster, namespace: str, policy_name: str, update_data: dict) -> bool:
    """更新Network Policy"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 获取现有的Network Policy
        existing_policy = networking_v1.read_namespaced_network_policy(policy_name, namespace)

        # 更新metadata
        if 'labels' in update_data and update_data['labels'] is not None:
            existing_policy.metadata.labels = update_data['labels']
        if 'annotations' in update_data and update_data['annotations'] is not None:
            existing_policy.metadata.annotations = update_data['annotations']

        # 更新spec
        if 'pod_selector' in update_data and update_data['pod_selector'] is not None:
            existing_policy.spec.pod_selector = client.V1LabelSelector(
                match_labels=update_data['pod_selector']
            )
        if 'policy_types' in update_data and update_data['policy_types'] is not None:
            existing_policy.spec.policy_types = update_data['policy_types']
        if 'ingress' in update_data and update_data['ingress'] is not None:
            existing_policy.spec.ingress = update_data['ingress']
        if 'egress' in update_data and update_data['egress'] is not None:
            existing_policy.spec.egress = update_data['egress']

        # 执行更新
        networking_v1.replace_namespaced_network_policy(policy_name, namespace, existing_policy)
        return True

    except Exception as e:
        print(f"更新Network Policy失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_network_policy(cluster: Cluster, namespace: str, policy_name: str) -> bool:
    """删除Network Policy"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        networking_v1.delete_namespaced_network_policy(policy_name, namespace)
        return True

    except Exception as e:
        print(f"删除Network Policy失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== 存储相关函数 ==========

def get_storage_classes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取存储类列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        storage_v1 = client.StorageV1Api(client_instance)
        storage_classes = storage_v1.list_storage_class()

        sc_list = []
        for sc in storage_classes.items:
            # 获取provisioner
            provisioner = sc.provisioner

            # 获取回收策略
            reclaim_policy = sc.reclaim_policy if sc.reclaim_policy else "Delete"

            # 获取卷绑定模式
            volume_binding_mode = sc.volume_binding_mode if sc.volume_binding_mode else "Immediate"

            # 获取允许卷扩展
            allow_volume_expansion = sc.allow_volume_expansion if sc.allow_volume_expansion else False

            sc_info = {
                "name": sc.metadata.name,
                "provisioner": provisioner,
                "reclaim_policy": reclaim_policy,
                "volume_binding_mode": volume_binding_mode,
                "allow_volume_expansion": allow_volume_expansion,
                "parameters": dict(sc.parameters) if sc.parameters else {}
            }
            sc_list.append(sc_info)

        return sc_list

    except Exception as e:
        print(f"获取存储类失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def create_storage_class(cluster: Cluster, sc_data: dict) -> bool:
    """创建存储类"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        storage_v1 = client.StorageV1Api(client_instance)

        # 创建存储类对象
        storage_class = client.V1StorageClass(
            metadata=client.V1ObjectMeta(name=sc_data['name']),
            provisioner=sc_data['provisioner'],
            reclaim_policy=sc_data.get('reclaim_policy', 'Delete'),
            volume_binding_mode=sc_data.get('volume_binding_mode', 'Immediate'),
            allow_volume_expansion=sc_data.get('allow_volume_expansion', False),
            parameters=sc_data.get('parameters', {})
        )

        storage_v1.create_storage_class(storage_class)
        return True

    except Exception as e:
        print(f"创建存储类失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_storage_class(cluster: Cluster, storage_class_name: str) -> bool:
    """删除存储类"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        storage_v1 = client.StorageV1Api(client_instance)
        storage_v1.delete_storage_class(storage_class_name)
        return True

    except Exception as e:
        print(f"删除存储类失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_persistent_volumes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取持久卷列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvs = core_v1.list_persistent_volume()

        pv_list = []
        for pv in pvs.items:
            # 获取容量
            capacity = "0"
            if pv.spec.capacity and 'storage' in pv.spec.capacity:
                capacity = pv.spec.capacity['storage']

            # 获取访问模式
            access_modes = pv.spec.access_modes if pv.spec.access_modes else []

            # 获取状态
            status = pv.status.phase if pv.status else "Unknown"

            # 获取声明
            claim = None
            if pv.spec.claim_ref:
                claim = f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}"

            # 获取存储类
            storage_class = pv.spec.storage_class_name

            # 获取卷模式
            volume_mode = pv.spec.volume_mode if pv.spec.volume_mode else "Filesystem"

            pv_info = {
                "name": pv.metadata.name,
                "capacity": capacity,
                "access_modes": access_modes,
                "status": status,
                "claim": claim,
                "storage_class": storage_class,
                "volume_mode": volume_mode
            }
            pv_list.append(pv_info)

        return pv_list

    except Exception as e:
        print(f"获取持久卷失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_pv_details(cluster: Cluster, pv_name: str) -> Optional[Dict[str, Any]]:
    """获取PV详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pv = core_v1.read_persistent_volume(pv_name)

        # 获取容量
        capacity = "0"
        if pv.spec.capacity and 'storage' in pv.spec.capacity:
            capacity = pv.spec.capacity['storage']

        # 获取访问模式
        access_modes = pv.spec.access_modes if pv.spec.access_modes else []

        # 获取状态
        status = pv.status.phase if pv.status else "Unknown"

        # 获取声明
        claim = None
        if pv.spec.claim_ref:
            claim = f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}"

        # 获取存储类
        storage_class = pv.spec.storage_class_name

        # 获取卷模式
        volume_mode = pv.spec.volume_mode if pv.spec.volume_mode else "Filesystem"

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if pv.metadata.creation_timestamp:
            created = pv.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": pv.metadata.name,
            "capacity": capacity,
            "access_modes": access_modes,
            "status": status,
            "claim": claim,
            "storage_class": storage_class,
            "volume_mode": volume_mode,
            "age": age,
            "labels": dict(pv.metadata.labels) if pv.metadata.labels else {},
            "annotations": dict(pv.metadata.annotations) if pv.metadata.annotations else {}
        }

    except Exception as e:
        print(f"获取PV详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_pv(cluster: Cluster, pv_data: dict) -> bool:
    """创建持久卷"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建PV对象
        pv_spec = client.V1PersistentVolumeSpec(
            capacity={"storage": pv_data['capacity']},
            access_modes=pv_data['access_modes'],
            storage_class_name=pv_data.get('storage_class_name'),
            volume_mode=pv_data.get('volume_mode', 'Filesystem')
        )

        # 添加hostPath配置（简化版）
        if 'host_path' in pv_data:
            pv_spec.host_path = client.V1HostPathVolumeSource(path=pv_data['host_path'])

        pv = client.V1PersistentVolume(
            metadata=client.V1ObjectMeta(name=pv_data['name']),
            spec=pv_spec
        )

        core_v1.create_persistent_volume(pv)
        return True

    except Exception as e:
        print(f"创建持久卷失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_pv(cluster: Cluster, pv_name: str) -> bool:
    """删除持久卷"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_persistent_volume(pv_name)
        return True

    except Exception as e:
        print(f"删除持久卷失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_persistent_volume_claims(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取持久卷声明列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvcs = core_v1.list_persistent_volume_claim_for_all_namespaces()

        pvc_list = []
        for pvc in pvcs.items:
            # 获取状态
            status = pvc.status.phase if pvc.status else "Unknown"

            # 获取卷名
            volume = pvc.spec.volume_name

            # 获取容量
            capacity = None
            if pvc.status.capacity and 'storage' in pvc.status.capacity:
                capacity = pvc.status.capacity['storage']

            # 获取访问模式
            access_modes = pvc.spec.access_modes if pvc.spec.access_modes else []

            # 获取存储类
            storage_class = pvc.spec.storage_class_name

            # 获取卷模式
            volume_mode = pvc.spec.volume_mode if pvc.spec.volume_mode else "Filesystem"

            pvc_info = {
                "name": pvc.metadata.name,
                "namespace": pvc.metadata.namespace,
                "status": status,
                "volume": volume,
                "capacity": capacity,
                "access_modes": access_modes,
                "storage_class": storage_class,
                "volume_mode": volume_mode
            }
            pvc_list.append(pvc_info)

        return pvc_list

    except Exception as e:
        print(f"获取PVC失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_namespace_pvcs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的PVC列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace)

        pvc_list = []
        for pvc in pvcs.items:
            # 获取状态
            status = pvc.status.phase if pvc.status else "Unknown"

            # 获取卷名
            volume = pvc.spec.volume_name

            # 获取容量
            capacity = None
            if pvc.status.capacity and 'storage' in pvc.status.capacity:
                capacity = pvc.status.capacity['storage']

            # 获取访问模式
            access_modes = pvc.spec.access_modes if pvc.spec.access_modes else []

            # 获取存储类
            storage_class = pvc.spec.storage_class_name

            # 获取卷模式
            volume_mode = pvc.spec.volume_mode if pvc.spec.volume_mode else "Filesystem"

            pvc_info = {
                "name": pvc.metadata.name,
                "namespace": pvc.metadata.namespace,
                "status": status,
                "volume": volume,
                "capacity": capacity,
                "access_modes": access_modes,
                "storage_class": storage_class,
                "volume_mode": volume_mode
            }
            pvc_list.append(pvc_info)

        return pvc_list

    except Exception as e:
        print(f"获取命名空间PVC失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_pvc_details(cluster: Cluster, namespace: str, pvc_name: str) -> Optional[Dict[str, Any]]:
    """获取PVC详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvc = core_v1.read_namespaced_persistent_volume_claim(pvc_name, namespace)

        # 获取状态
        status = pvc.status.phase if pvc.status else "Unknown"

        # 获取卷名
        volume = pvc.spec.volume_name

        # 获取容量
        capacity = None
        if pvc.status.capacity and 'storage' in pvc.status.capacity:
            capacity = pvc.status.capacity['storage']

        # 获取访问模式
        access_modes = pvc.spec.access_modes if pvc.spec.access_modes else []

        # 获取存储类
        storage_class = pvc.spec.storage_class_name

        # 获取卷模式
        volume_mode = pvc.spec.volume_mode if pvc.spec.volume_mode else "Filesystem"

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if pvc.metadata.creation_timestamp:
            created = pvc.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": pvc.metadata.name,
            "namespace": namespace,
            "status": status,
            "volume": volume,
            "capacity": capacity,
            "access_modes": access_modes,
            "storage_class": storage_class,
            "volume_mode": volume_mode,
            "age": age,
            "labels": dict(pvc.metadata.labels) if pvc.metadata.labels else {},
            "annotations": dict(pvc.metadata.annotations) if pvc.metadata.annotations else {}
        }

    except Exception as e:
        print(f"获取PVC详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_pvc(cluster: Cluster, pvc_data: dict) -> bool:
    """创建持久卷声明"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建PVC对象
        pvc_spec = client.V1PersistentVolumeClaimSpec(
            access_modes=pvc_data['access_modes'],
            storage_class_name=pvc_data.get('storage_class_name'),
            volume_mode=pvc_data.get('volume_mode', 'Filesystem'),
            resources=client.V1ResourceRequirements(requests=pvc_data['requests'])
        )

        pvc = client.V1PersistentVolumeClaim(
            metadata=client.V1ObjectMeta(name=pvc_data['name']),
            spec=pvc_spec
        )

        core_v1.create_namespaced_persistent_volume_claim(pvc_data['namespace'], pvc)
        return True

    except Exception as e:
        print(f"创建PVC失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_pvc(cluster: Cluster, namespace: str, pvc_name: str) -> bool:
    """删除持久卷声明"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_persistent_volume_claim(pvc_name, namespace)
        return True

    except Exception as e:
        print(f"删除PVC失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def browse_volume_files(cluster: Cluster, pv_name: str, path: str) -> List[Dict[str, Any]]:
    """浏览卷内文件（简化的实现）"""
    # 这是一个简化的实现，实际的文件浏览需要通过Pod访问卷
    # 这里返回一个模拟的目录结构
    import os.path

    try:
        # 模拟的文件系统浏览
        if path == "/":
            return [
                {"name": "example.txt", "type": "file", "size": 1024, "modified_time": "2024-01-01 12:00:00"},
                {"name": "data", "type": "directory", "size": None, "modified_time": "2024-01-01 12:00:00"}
            ]
        elif path == "/data":
            return [
                {"name": "config.yaml", "type": "file", "size": 512, "modified_time": "2024-01-01 12:00:00"},
                {"name": "logs", "type": "directory", "size": None, "modified_time": "2024-01-01 12:00:00"}
            ]
        else:
            return []

    except Exception as e:
        print(f"浏览卷文件失败: {e}")
        return []


def read_volume_file(cluster: Cluster, pv_name: str, file_path: str, max_lines: Optional[int] = None) -> Optional[str]:
    """读取卷内文件内容（简化的实现）"""
    # 这是一个简化的实现，实际的文件读取需要通过Pod访问卷
    try:
        # 模拟文件内容
        if file_path == "/example.txt":
            content = "This is an example file content.\nLine 2\nLine 3\n"
        elif file_path == "/data/config.yaml":
            content = "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n"
        else:
            content = "File not found or cannot be read."

        if max_lines:
            lines = content.split('\n')
            content = '\n'.join(lines[:max_lines])

        return content

    except Exception as e:
        print(f"读取卷文件失败: {e}")
        return None


def get_cluster_events(cluster: Cluster, namespace: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """获取集群或命名空间的事件"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        events = []

        if namespace:
            # 获取指定命名空间的事件
            event_list = core_v1.list_namespaced_event(namespace)
        else:
            # 获取集群级别的事件（所有命名空间）
            event_list = core_v1.list_event_for_all_namespaces()

        # 按时间排序，最新的在前
        def get_event_time(event):
            # 优先使用last_timestamp，如果没有则使用event_time，如果都没有则使用first_timestamp
            timestamp = event.last_timestamp or event.event_time or event.first_timestamp
            if timestamp:
                # 如果是datetime对象，返回它，否则返回一个很早的时间
                if hasattr(timestamp, 'timestamp'):
                    return timestamp.timestamp()
                else:
                    # 如果是字符串或其他格式，尝试转换
                    try:
                        from datetime import datetime
                        return datetime.fromisoformat(str(timestamp).replace('Z', '+00:00')).timestamp()
                    except:
                        pass
            # 如果都没有有效时间戳，返回0（最早的时间）
            return 0

        sorted_events = sorted(event_list.items, key=get_event_time, reverse=True)

        for event in sorted_events[:limit]:
            # 计算事件年龄
            age = "Unknown"
            if event.last_timestamp:
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                last_time = event.last_timestamp
                if hasattr(last_time, 'replace'):  # datetime对象
                    delta = now - last_time.replace(tzinfo=timezone.utc)
                else:  # 其他格式
                    continue

                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            events.append({
                "name": event.metadata.name,
                "namespace": event.metadata.namespace,
                "type": event.type,
                "reason": event.reason,
                "message": event.message,
                "source": event.source.component if event.source else None,
                "count": event.count,
                "first_timestamp": str(event.first_timestamp) if event.first_timestamp else None,
                "last_timestamp": str(event.last_timestamp) if event.last_timestamp else None,
                "age": age,
                "involved_object": {
                    "kind": event.involved_object.kind,
                    "name": event.involved_object.name,
                    "namespace": event.involved_object.namespace
                } if event.involved_object else None
            })

        return events

    except Exception as e:
        print(f"获取集群事件失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


# ===== Jobs 管理函数 =====

def get_namespace_jobs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的所有Jobs"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        job_list = batch_v1.list_namespaced_job(namespace)

        jobs = []
        for job in job_list.items:
            # 计算Job年龄
            age = "Unknown"
            if job.metadata.creation_timestamp:
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                creation_time = job.metadata.creation_timestamp.replace(tzinfo=timezone.utc)
                delta = now - creation_time

                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            # 获取Job状态
            status = "Unknown"
            if job.status:
                if job.status.conditions:
                    # 检查最新的条件状态
                    latest_condition = max(job.status.conditions, key=lambda c: c.last_transition_time or c.last_probe_time or "")
                    status = latest_condition.type

            # 计算完成度
            completions = job.spec.completions or 1
            succeeded = job.status.succeeded or 0
            failed = job.status.failed or 0

            jobs.append({
                "name": job.metadata.name,
                "namespace": namespace,
                "completions": completions,
                "succeeded": succeeded,
                "failed": failed,
                "active": job.status.active or 0,
                "age": age,
                "status": status,
                "labels": dict(job.metadata.labels) if job.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return jobs

    except Exception as e:
        print(f"获取命名空间Jobs失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_job_details(cluster: Cluster, namespace: str, job_name: str) -> Optional[Dict[str, Any]]:
    """获取Job的详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        job = batch_v1.read_namespaced_job(job_name, namespace)

        # 计算Job年龄
        age = "Unknown"
        creation_timestamp = "Unknown"
        if job.metadata.creation_timestamp:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            creation_time = job.metadata.creation_timestamp.replace(tzinfo=timezone.utc)
            delta = now - creation_time
            creation_timestamp = str(job.metadata.creation_timestamp)

            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取Job状态
        status = "Unknown"
        conditions = []
        if job.status and job.status.conditions:
            for condition in job.status.conditions:
                conditions.append({
                    "type": condition.type,
                    "status": condition.status,
                    "last_transition_time": str(condition.last_transition_time) if condition.last_transition_time else None,
                    "reason": condition.reason,
                    "message": condition.message
                })
            # 最新的条件状态作为主要状态
            latest_condition = max(job.status.conditions, key=lambda c: c.last_transition_time or c.last_probe_time or "")
            status = latest_condition.type

        return {
            "name": job.metadata.name,
            "namespace": namespace,
            "completions": job.spec.completions or 1,
            "parallelism": job.spec.parallelism or 1,
            "backoff_limit": job.spec.backoff_limit or 6,
            "succeeded": job.status.succeeded or 0,
            "failed": job.status.failed or 0,
            "active": job.status.active or 0,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "status": status,
            "conditions": conditions,
            "labels": dict(job.metadata.labels) if job.metadata.labels else {},
            "annotations": dict(job.metadata.annotations) if job.metadata.annotations else {},
            "spec": job.spec.to_dict() if hasattr(job.spec, 'to_dict') else {},
            "status_detail": job.status.to_dict() if hasattr(job.status, 'to_dict') else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }

    except Exception as e:
        print(f"获取Job详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_job(cluster: Cluster, namespace: str, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """创建Job"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        batch_v1 = client.BatchV1Api(client_instance)

        # 解析YAML或JSON数据
        if "yaml_content" in job_data:
            import yaml
            job_dict = yaml.safe_load(job_data["yaml_content"])
        else:
            job_dict = job_data

        # 创建Job对象
        job = client.V1Job(
            api_version="batch/v1",
            kind="Job",
            metadata=client.V1ObjectMeta(
                name=job_dict["metadata"]["name"],
                namespace=namespace,
                labels=job_dict["metadata"].get("labels", {}),
                annotations=job_dict["metadata"].get("annotations", {})
            ),
            spec=client.V1JobSpec(**job_dict["spec"])
        )

        # 创建Job
        result = batch_v1.create_namespaced_job(namespace, job)

        return {
            "success": True,
            "message": f"Job '{result.metadata.name}' 创建成功",
            "job_name": result.metadata.name
        }

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"创建Job失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


def delete_job(cluster: Cluster, namespace: str, job_name: str) -> Dict[str, Any]:
    """删除Job"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        batch_v1 = client.BatchV1Api(client_instance)

        # 删除Job
        delete_options = client.V1DeleteOptions(
            propagation_policy="Foreground",
            grace_period_seconds=30
        )

        batch_v1.delete_namespaced_job(
            job_name,
            namespace,
            body=delete_options
        )

        return {
            "success": True,
            "message": f"Job '{job_name}' 删除成功"
        }

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"删除Job失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


def restart_job(cluster: Cluster, namespace: str, job_name: str) -> Dict[str, Any]:
    """重启Job（删除旧Job，创建新Job）"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        batch_v1 = client.BatchV1Api(client_instance)

        # 获取现有Job的配置
        job = batch_v1.read_namespaced_job(job_name, namespace)

        # 生成新的Job名称（添加时间戳后缀）
        import time
        new_job_name = f"{job.metadata.name}-{int(time.time())}"

        # 创建新的Job配置
        new_job = client.V1Job(
            api_version="batch/v1",
            kind="Job",
            metadata=client.V1ObjectMeta(
                name=new_job_name,
                namespace=namespace,
                labels=dict(job.metadata.labels) if job.metadata.labels else {},
                annotations=dict(job.metadata.annotations) if job.metadata.annotations else {}
            ),
            spec=job.spec
        )

        # 创建新Job
        result = batch_v1.create_namespaced_job(namespace, new_job)

        return {
            "success": True,
            "message": f"Job '{job_name}' 重启成功，新Job名称: '{new_job_name}'",
            "new_job_name": new_job_name
        }

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"重启Job失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


def get_job_pods(cluster: Cluster, namespace: str, job_name: str) -> List[Dict[str, Any]]:
    """获取Job关联的Pods"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取所有Pod
        pod_list = core_v1.list_namespaced_pod(namespace)

        job_pods = []
        for pod in pod_list.items:
            # 检查Pod是否属于指定的Job
            if pod.metadata.owner_references:
                for owner_ref in pod.metadata.owner_references:
                    if owner_ref.kind == "Job" and owner_ref.name == job_name:
                        # 计算Pod年龄
                        age = "Unknown"
                        if pod.metadata.creation_timestamp:
                            from datetime import datetime, timezone
                            now = datetime.now(timezone.utc)
                            creation_time = pod.metadata.creation_timestamp.replace(tzinfo=timezone.utc)
                            delta = now - creation_time

                            if delta.days > 0:
                                age = f"{delta.days}d"
                            elif delta.seconds // 3600 > 0:
                                age = f"{delta.seconds // 3600}h"
                            elif delta.seconds // 60 > 0:
                                age = f"{delta.seconds // 60}m"
                            else:
                                age = f"{delta.seconds}s"

                        # 获取Pod状态
                        status = "Unknown"
                        if pod.status:
                            status = pod.status.phase or "Unknown"

                        # 获取容器重启次数
                        restarts = 0
                        ready_containers = "0/0"
                        if pod.status and pod.status.container_statuses:
                            for container_status in pod.status.container_statuses:
                                restarts += container_status.restart_count or 0
                            ready_containers = f"{sum(1 for cs in pod.status.container_statuses if cs.ready)}/{len(pod.status.container_statuses)}"

                        job_pods.append({
                            "name": pod.metadata.name,
                            "namespace": namespace,
                            "status": status,
                            "node_name": pod.spec.node_name if pod.spec else None,
                            "age": age,
                            "restarts": restarts,
                            "ready_containers": ready_containers,
                            "labels": dict(pod.metadata.labels) if pod.metadata.labels else {}
                        })
                        break

        return job_pods

    except Exception as e:
        print(f"获取Job Pods失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_job_yaml(cluster: Cluster, namespace: str, job_name: str) -> Optional[str]:
    """获取Job的YAML配置"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        job = batch_v1.read_namespaced_job(job_name, namespace)

        import yaml
        job_dict = job.to_dict()
        return yaml.dump(job_dict, default_flow_style=False)

    except Exception as e:
        print(f"获取Job YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def update_job_yaml(cluster: Cluster, namespace: str, job_name: str, yaml_content: str) -> Dict[str, Any]:
    """更新Job的YAML配置"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        batch_v1 = client.BatchV1Api(client_instance)

        # 解析YAML
        import yaml
        job_dict = yaml.safe_load(yaml_content)

        # 创建Job对象
        job = client.V1Job(
            api_version="batch/v1",
            kind="Job",
            metadata=client.V1ObjectMeta(
                name=job_dict["metadata"]["name"],
                namespace=namespace,
                labels=job_dict["metadata"].get("labels", {}),
                annotations=job_dict["metadata"].get("annotations", {})
            ),
            spec=client.V1JobSpec(**job_dict["spec"])
        )

        # 更新Job
        result = batch_v1.replace_namespaced_job(job_name, namespace, job)

        return {
            "success": True,
            "message": f"Job '{job_name}' 更新成功"
        }

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"更新Job失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


def monitor_job_status_changes(cluster: Cluster, namespace: str, job_name: str, history_id: int, db_session) -> Dict[str, Any]:
    """监控Job状态变化并更新历史记录"""
    from ..models import JobHistory

    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        job = batch_v1.read_namespaced_job(job_name, namespace)

        # 获取当前状态
        current_status = "Unknown"
        succeeded_pods = 0
        failed_pods = 0
        total_pods = 0

        if job.status:
            # 确定主要状态
            if job.status.conditions:
                latest_condition = max(job.status.conditions, key=lambda c: c.last_transition_time or c.last_probe_time or "")
                current_status = latest_condition.type

            succeeded_pods = job.status.succeeded or 0
            failed_pods = job.status.failed or 0
            active_pods = job.status.active or 0
            total_pods = succeeded_pods + failed_pods + active_pods

        # 获取历史记录
        history_record = db_session.query(JobHistory).filter(JobHistory.id == history_id).first()
        if not history_record:
            return {"success": False, "message": "历史记录不存在"}

        # 检查状态是否发生变化
        status_changed = history_record.status != current_status
        pod_count_changed = (
            history_record.succeeded_pods != succeeded_pods or
            history_record.failed_pods != failed_pods or
            history_record.total_pods != total_pods
        )

        if status_changed or pod_count_changed:
            from datetime import datetime, timezone

            # 更新状态
            history_record.status = current_status
            history_record.succeeded_pods = succeeded_pods
            history_record.failed_pods = failed_pods
            history_record.total_pods = total_pods

            now = datetime.now(timezone.utc)

            # 设置开始时间
            if current_status == "Running" and not history_record.start_time:
                history_record.start_time = now

            # 设置结束时间和持续时间
            elif current_status in ["Succeeded", "Failed"] and not history_record.end_time:
                history_record.end_time = now
                if history_record.start_time:
                    history_record.duration = int((history_record.end_time - history_record.start_time).total_seconds())

            history_record.updated_at = now
            db_session.commit()

            return {
                "success": True,
                "message": "状态已更新",
                "status_changed": status_changed,
                "pod_count_changed": pod_count_changed,
                "current_status": current_status,
                "succeeded_pods": succeeded_pods,
                "failed_pods": failed_pods,
                "total_pods": total_pods
            }
        else:
            return {
                "success": True,
                "message": "状态无变化",
                "status_changed": False,
                "pod_count_changed": False
            }

    except ApiException as e:
        error_message = f"API错误: {e.body}"
        # 更新错误信息
        history_record = db_session.query(JobHistory).filter(JobHistory.id == history_id).first()
        if history_record:
            history_record.error_message = error_message
            history_record.status = "Failed"
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            if not history_record.end_time:
                history_record.end_time = now
                if history_record.start_time:
                    history_record.duration = int((history_record.end_time - history_record.start_time).total_seconds())
            history_record.updated_at = now
            db_session.commit()

        return {"success": False, "message": error_message}
    except Exception as e:
        error_message = f"监控Job状态失败: {str(e)}"
        # 更新错误信息
        history_record = db_session.query(JobHistory).filter(JobHistory.id == history_id).first()
        if history_record:
            history_record.error_message = error_message
            history_record.status = "Failed"
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            if not history_record.end_time:
                history_record.end_time = now
                if history_record.start_time:
                    history_record.duration = int((history_record.end_time - history_record.start_time).total_seconds())
            history_record.updated_at = now
            db_session.commit()

        return {"success": False, "message": error_message}
    finally:
        if client_instance:
            client_instance.close()


# ===== WebSocket资源监听器 =====

import asyncio
import logging
from typing import Callable, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
try:
    from .websocket_manager import manager
except ImportError:
    # 如果相对导入失败，使用全局导入（用于测试）
    from websocket_manager import manager

logger = logging.getLogger(__name__)

class KubernetesResourceWatcher:
    """Kubernetes资源监听器"""

    def __init__(self, cluster: Cluster):
        self.cluster = cluster
        self.client_instance = None
        self.watchers: Dict[str, Any] = {}  # 存储不同资源类型的监听器
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix=f"k8s-watcher-{cluster.id}")
        self.running = False
        self.loop = None
        self.loop_thread = None

    def start(self):
        """启动资源监听"""
        if self.running:
            return

        self.running = True
        self.client_instance = create_k8s_client(self.cluster)

        if not self.client_instance:
            logger.error(f"Failed to create Kubernetes client for cluster {self.cluster.id}")
            return

        # 在新线程中运行事件循环
        self.loop_thread = threading.Thread(
            target=self._run_event_loop,
            daemon=True,
            name=f"k8s-watcher-loop-{self.cluster.id}"
        )
        self.loop_thread.start()

        logger.info(f"Started Kubernetes resource watchers for cluster {self.cluster.id}")

    def _run_event_loop(self):
        """在独立线程中运行事件循环"""
        try:
            # 创建新的事件循环
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

            # 启动各个资源类型的监听
            self.loop.create_task(self._start_pod_watcher())
            self.loop.create_task(self._start_deployment_watcher())
            self.loop.create_task(self._start_job_watcher())
            self.loop.create_task(self._start_service_watcher())

            # 运行事件循环直到被停止
            self.loop.run_forever()
        except Exception as e:
            logger.error(f"Error in watcher event loop for cluster {self.cluster.id}: {e}")
        finally:
            if self.loop and not self.loop.is_closed():
                self.loop.close()

    def stop(self):
        """停止资源监听"""
        if not self.running:
            return

        self.running = False

        # 停止所有监听器
        for watcher_name, watcher in self.watchers.items():
            try:
                watcher.stop()
            except Exception as e:
                logger.error(f"Error stopping watcher {watcher_name}: {e}")

        self.watchers.clear()

        # 停止事件循环
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)

        # 等待线程结束
        if self.loop_thread and self.loop_thread.is_alive():
            self.loop_thread.join(timeout=5)

        # 关闭客户端连接
        if self.client_instance:
            try:
                self.client_instance.close()
            except Exception as e:
                logger.error(f"Error closing Kubernetes client: {e}")
            self.client_instance = None

        # 关闭线程池
        self.executor.shutdown(wait=False)

        logger.info(f"Stopped Kubernetes resource watchers for cluster {self.cluster.id}")

    async def _start_pod_watcher(self):
        """启动Pod监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            from kubernetes import watch
            core_v1 = client.CoreV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['pods'] = w

            logger.info(f"Starting pod watcher for cluster {self.cluster.id}")

            for event in w.stream(core_v1.list_pod_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_pod_event(event)
                except Exception as e:
                    logger.error(f"Error handling pod event: {e}")

        except Exception as e:
            logger.error(f"Pod watcher error for cluster {self.cluster.id}: {e}")

    async def _start_deployment_watcher(self):
        """启动Deployment监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            from kubernetes import watch
            apps_v1 = client.AppsV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['deployments'] = w

            logger.info(f"Starting deployment watcher for cluster {self.cluster.id}")

            for event in w.stream(apps_v1.list_deployment_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_deployment_event(event)
                except Exception as e:
                    logger.error(f"Error handling deployment event: {e}")

        except Exception as e:
            logger.error(f"Deployment watcher error for cluster {self.cluster.id}: {e}")

    async def _start_job_watcher(self):
        """启动Job监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            from kubernetes import watch
            batch_v1 = client.BatchV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['jobs'] = w

            logger.info(f"Starting job watcher for cluster {self.cluster.id}")

            for event in w.stream(batch_v1.list_job_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_job_event(event)
                except Exception as e:
                    logger.error(f"Error handling job event: {e}")

        except Exception as e:
            logger.error(f"Job watcher error for cluster {self.cluster.id}: {e}")

    async def _start_service_watcher(self):
        """启动Service监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            from kubernetes import watch
            core_v1 = client.CoreV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['services'] = w

            logger.info(f"Starting service watcher for cluster {self.cluster.id}")

            for event in w.stream(core_v1.list_service_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_service_event(event)
                except Exception as e:
                    logger.error(f"Error handling service event: {e}")

        except Exception as e:
            logger.error(f"Service watcher error for cluster {self.cluster.id}: {e}")

    async def _handle_pod_event(self, event):
        """处理Pod事件"""
        event_type = event['type']  # ADDED, MODIFIED, DELETED
        pod = event['object']

        # 构建Pod数据
        pod_data = {
            'name': pod.metadata.name,
            'namespace': pod.metadata.namespace,
            'status': pod.status.phase,
            'node_name': pod.spec.node_name,
            'restart_count': sum(container.restart_count for container in (pod.status.container_statuses or [])),
            'ready_containers': f"{sum(1 for cs in (pod.status.container_statuses or []) if cs.ready)}/{len(pod.spec.containers)}",
            'age': self._calculate_age(pod.metadata.creation_timestamp),
            'labels': pod.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='pods',
            resource_data=pod_data,
            namespace=pod.metadata.namespace
        )

    async def _handle_deployment_event(self, event):
        """处理Deployment事件"""
        event_type = event['type']
        deployment = event['object']

        # 构建Deployment数据
        deployment_data = {
            'name': deployment.metadata.name,
            'namespace': deployment.metadata.namespace,
            'replicas': deployment.spec.replicas,
            'ready_replicas': deployment.status.ready_replicas or 0,
            'available_replicas': deployment.status.available_replicas or 0,
            'unavailable_replicas': deployment.status.unavailable_replicas or 0,
            'age': self._calculate_age(deployment.metadata.creation_timestamp),
            'labels': deployment.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='deployments',
            resource_data=deployment_data,
            namespace=deployment.metadata.namespace
        )

    async def _handle_job_event(self, event):
        """处理Job事件"""
        event_type = event['type']
        job = event['object']

        # 构建Job数据
        job_data = {
            'name': job.metadata.name,
            'namespace': job.metadata.namespace,
            'completions': job.spec.completions,
            'succeeded': job.status.succeeded or 0,
            'failed': job.status.failed or 0,
            'active': job.status.active or 0,
            'age': self._calculate_age(job.metadata.creation_timestamp),
            'status': self._get_job_status(job),
            'labels': job.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='jobs',
            resource_data=job_data,
            namespace=job.metadata.namespace
        )

    async def _handle_service_event(self, event):
        """处理Service事件"""
        event_type = event['type']
        service = event['object']

        # 构建Service数据
        service_data = {
            'name': service.metadata.name,
            'namespace': service.metadata.namespace,
            'type': service.spec.type,
            'cluster_ip': service.spec.cluster_ip,
            'external_ip': (service.status.load_balancer.ingress[0].ip
                          if service.status.load_balancer.ingress else None),
            'ports': [{'port': p.port, 'target_port': p.target_port, 'protocol': p.protocol}
                     for p in (service.spec.ports or [])],
            'selector': service.spec.selector or {},
            'age': self._calculate_age(service.metadata.creation_timestamp),
            'labels': service.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='services',
            resource_data=service_data,
            namespace=service.metadata.namespace
        )

    def _calculate_age(self, creation_timestamp) -> str:
        """计算资源年龄"""
        if not creation_timestamp:
            return "Unknown"

        from datetime import datetime
        now = datetime.utcnow().replace(tzinfo=creation_timestamp.tzinfo)
        age_seconds = (now - creation_timestamp).total_seconds()

        if age_seconds < 60:
            return f"{int(age_seconds)}s"
        elif age_seconds < 3600:
            return f"{int(age_seconds / 60)}m"
        elif age_seconds < 86400:
            return f"{int(age_seconds / 3600)}h"
        else:
            return f"{int(age_seconds / 86400)}d"

    def _get_job_status(self, job) -> str:
        """获取Job状态"""
        if not job.status.conditions:
            return "Pending"

        # 按时间排序，取最新的条件
        latest_condition = max(job.status.conditions, key=lambda c: c.last_transition_time or "")
        return latest_condition.type


class KubernetesWatcherManager:
    """Kubernetes监听器管理器"""

    def __init__(self):
        self.watchers: Dict[int, KubernetesResourceWatcher] = {}
        self.running = False

    def start_watcher(self, cluster: Cluster):
        """启动集群监听器"""
        if cluster.id in self.watchers:
            return

        watcher = KubernetesResourceWatcher(cluster)
        self.watchers[cluster.id] = watcher
        watcher.start()

        logger.info(f"Started watcher for cluster {cluster.id}")

    def stop_watcher(self, cluster_id: int):
        """停止集群监听器"""
        if cluster_id in self.watchers:
            watcher = self.watchers[cluster_id]
            watcher.stop()
            del self.watchers[cluster_id]

            logger.info(f"Stopped watcher for cluster {cluster_id}")

    def stop_all_watchers(self):
        """停止所有监听器"""
        for cluster_id, watcher in self.watchers.items():
            try:
                watcher.stop()
            except Exception as e:
                logger.error(f"Error stopping watcher for cluster {cluster_id}: {e}")

        self.watchers.clear()
        logger.info("Stopped all Kubernetes watchers")

    def get_watcher_stats(self) -> Dict[str, Any]:
        """获取监听器统计信息"""
        return {
            "active_watchers": len(self.watchers),
            "cluster_ids": list(self.watchers.keys())
        }


# 全局监听器管理器实例
watcher_manager = KubernetesWatcherManager()


# 全局线程池用于异步启动watcher
_watcher_startup_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="watcher-startup")


def start_watcher_async(cluster: Cluster):
    """在线程池中异步启动watcher，避免阻塞API请求"""
    def _start():
        try:
            watcher_manager.start_watcher(cluster)
        except Exception as e:
            logger.error(f"Error starting watcher for cluster {cluster.id}: {e}")
    
    _watcher_startup_executor.submit(_start)


# ========== RBAC管理 ==========

def get_roles(cluster: Cluster, namespace: str = None):
    """获取Roles列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        
        if namespace:
            roles_list = rbac_v1.list_namespaced_role(namespace)
        else:
            roles_list = rbac_v1.list_role_for_all_namespaces()
        
        roles = []
        for role in roles_list.items:
            roles.append({
                "name": role.metadata.name,
                "namespace": role.metadata.namespace,
                "labels": role.metadata.labels or {},
                "annotations": role.metadata.annotations or {},
                "rules": [
                    {
                        "api_groups": rule.api_groups or [],
                        "resources": rule.resources or [],
                        "verbs": rule.verbs or [],
                        "resource_names": rule.resource_names or []
                    }
                    for rule in role.rules
                ],
                "creation_timestamp": role.metadata.creation_timestamp.isoformat() if role.metadata.creation_timestamp else None
            })
        
        return roles
    except ApiException as e:
        print(f"获取Roles失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_role(cluster: Cluster, namespace: str, name: str):
    """获取单个Role详情"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        role = rbac_v1.read_namespaced_role(name, namespace)
        
        return {
            "name": role.metadata.name,
            "namespace": role.metadata.namespace,
            "labels": role.metadata.labels or {},
            "annotations": role.metadata.annotations or {},
            "rules": [
                {
                    "api_groups": rule.api_groups or [],
                    "resources": rule.resources or [],
                    "verbs": rule.verbs or [],
                    "resource_names": rule.resource_names or []
                }
                for rule in role.rules
            ],
            "creation_timestamp": role.metadata.creation_timestamp.isoformat() if role.metadata.creation_timestamp else None
        }
    except ApiException as e:
        print(f"获取Role失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def delete_role(cluster: Cluster, namespace: str, name: str):
    """删除Role"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return False
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        rbac_v1.delete_namespaced_role(name, namespace)
        return True
    except ApiException as e:
        print(f"删除Role失败: {e}")
        return False
    finally:
        _client_pool.return_client(cluster, api_client)


def get_role_bindings(cluster: Cluster, namespace: str = None):
    """获取RoleBindings列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        
        if namespace:
            bindings_list = rbac_v1.list_namespaced_role_binding(namespace)
        else:
            bindings_list = rbac_v1.list_role_binding_for_all_namespaces()
        
        bindings = []
        for binding in bindings_list.items:
            bindings.append({
                "name": binding.metadata.name,
                "namespace": binding.metadata.namespace,
                "labels": binding.metadata.labels or {},
                "annotations": binding.metadata.annotations or {},
                "role_ref": {
                    "api_group": binding.role_ref.api_group,
                    "kind": binding.role_ref.kind,
                    "name": binding.role_ref.name
                },
                "subjects": [
                    {
                        "kind": subject.kind,
                        "name": subject.name,
                        "namespace": subject.namespace if hasattr(subject, 'namespace') else None,
                        "api_group": subject.api_group if hasattr(subject, 'api_group') else None
                    }
                    for subject in (binding.subjects or [])
                ],
                "creation_timestamp": binding.metadata.creation_timestamp.isoformat() if binding.metadata.creation_timestamp else None
            })
        
        return bindings
    except ApiException as e:
        print(f"获取RoleBindings失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_role_binding(cluster: Cluster, namespace: str, name: str):
    """获取单个RoleBinding详情"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        binding = rbac_v1.read_namespaced_role_binding(name, namespace)
        
        return {
            "name": binding.metadata.name,
            "namespace": binding.metadata.namespace,
            "labels": binding.metadata.labels or {},
            "annotations": binding.metadata.annotations or {},
            "role_ref": {
                "api_group": binding.role_ref.api_group,
                "kind": binding.role_ref.kind,
                "name": binding.role_ref.name
            },
            "subjects": [
                {
                    "kind": subject.kind,
                    "name": subject.name,
                    "namespace": subject.namespace if hasattr(subject, 'namespace') else None,
                    "api_group": subject.api_group if hasattr(subject, 'api_group') else None
                }
                for subject in (binding.subjects or [])
            ],
            "creation_timestamp": binding.metadata.creation_timestamp.isoformat() if binding.metadata.creation_timestamp else None
        }
    except ApiException as e:
        print(f"获取RoleBinding失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def delete_role_binding(cluster: Cluster, namespace: str, name: str):
    """删除RoleBinding"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return False
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        rbac_v1.delete_namespaced_role_binding(name, namespace)
        return True
    except ApiException as e:
        print(f"删除RoleBinding失败: {e}")
        return False
    finally:
        _client_pool.return_client(cluster, api_client)


def get_service_accounts(cluster: Cluster, namespace: str = None):
    """获取ServiceAccounts列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        core_v1 = client.CoreV1Api(api_client)
        
        if namespace:
            sa_list = core_v1.list_namespaced_service_account(namespace)
        else:
            sa_list = core_v1.list_service_account_for_all_namespaces()
        
        service_accounts = []
        for sa in sa_list.items:
            service_accounts.append({
                "name": sa.metadata.name,
                "namespace": sa.metadata.namespace,
                "labels": sa.metadata.labels or {},
                "annotations": sa.metadata.annotations or {},
                "secrets": [secret.name for secret in (sa.secrets or [])],
                "creation_timestamp": sa.metadata.creation_timestamp.isoformat() if sa.metadata.creation_timestamp else None
            })
        
        return service_accounts
    except ApiException as e:
        print(f"获取ServiceAccounts失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_service_account(cluster: Cluster, namespace: str, name: str):
    """获取单个ServiceAccount详情"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        core_v1 = client.CoreV1Api(api_client)
        sa = core_v1.read_namespaced_service_account(name, namespace)
        
        return {
            "name": sa.metadata.name,
            "namespace": sa.metadata.namespace,
            "labels": sa.metadata.labels or {},
            "annotations": sa.metadata.annotations or {},
            "secrets": [secret.name for secret in (sa.secrets or [])],
            "image_pull_secrets": [secret.name for secret in (sa.image_pull_secrets or [])],
            "creation_timestamp": sa.metadata.creation_timestamp.isoformat() if sa.metadata.creation_timestamp else None
        }
    except ApiException as e:
        print(f"获取ServiceAccount失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def delete_service_account(cluster: Cluster, namespace: str, name: str):
    """删除ServiceAccount"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return False
    
    try:
        core_v1 = client.CoreV1Api(api_client)
        core_v1.delete_namespaced_service_account(name, namespace)
        return True
    except ApiException as e:
        print(f"删除ServiceAccount失败: {e}")
        return False
    finally:
        _client_pool.return_client(cluster, api_client)


def get_cluster_roles(cluster: Cluster):
    """获取ClusterRoles列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        roles_list = rbac_v1.list_cluster_role()
        
        roles = []
        for role in roles_list.items:
            roles.append({
                "name": role.metadata.name,
                "labels": role.metadata.labels or {},
                "annotations": role.metadata.annotations or {},
                "rules": [
                    {
                        "api_groups": rule.api_groups or [],
                        "resources": rule.resources or [],
                        "verbs": rule.verbs or [],
                        "resource_names": rule.resource_names or []
                    }
                    for rule in (role.rules or [])
                ],
                "creation_timestamp": role.metadata.creation_timestamp.isoformat() if role.metadata.creation_timestamp else None
            })
        
        return roles
    except ApiException as e:
        print(f"获取ClusterRoles失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_cluster_role_bindings(cluster: Cluster):
    """获取ClusterRoleBindings列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None
    
    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        bindings_list = rbac_v1.list_cluster_role_binding()
        
        bindings = []
        for binding in bindings_list.items:
            bindings.append({
                "name": binding.metadata.name,
                "labels": binding.metadata.labels or {},
                "annotations": binding.metadata.annotations or {},
                "role_ref": {
                    "api_group": binding.role_ref.api_group,
                    "kind": binding.role_ref.kind,
                    "name": binding.role_ref.name
                },
                "subjects": [
                    {
                        "kind": subject.kind,
                        "name": subject.name,
                        "namespace": subject.namespace if hasattr(subject, 'namespace') else None,
                        "api_group": subject.api_group if hasattr(subject, 'api_group') else None
                    }
                    for subject in (binding.subjects or [])
                ],
                "creation_timestamp": binding.metadata.creation_timestamp.isoformat() if binding.metadata.creation_timestamp else None
            })
        
        return bindings
    except ApiException as e:
        print(f"获取ClusterRoleBindings失败: {e}")
        return None
    finally:
        _client_pool.return_client(cluster, api_client)