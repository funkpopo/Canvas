"""
Kubernetes集群和节点基础操作模块
提供集群统计、节点信息和事件查询功能
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from ...cache import cache_manager, K8S_STATS_TTL, K8S_NODES_TTL
from .client_pool import KubernetesClientContext
from .utils import calculate_age, parse_cpu, parse_memory


logger = get_logger(__name__)


def get_cluster_stats(cluster: Cluster) -> Dict[str, Any]:
    """获取集群统计信息"""
    cache_key = f"k8s:stats:cluster:{cluster.id}:ns:_all"
    cached = cache_manager.get(cache_key)
    if cached is not None:
        return cached

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
                logger.warning("获取节点信息失败: %s", e)
                stats['nodes'] = 0

            # 获取命名空间数量
            try:
                namespaces = core_v1.list_namespace()
                stats['namespaces'] = len(namespaces.items)
            except ApiException as e:
                logger.warning("获取命名空间信息失败: %s", e)
                stats['namespaces'] = 0

            # 获取Pod统计
            try:
                pods = core_v1.list_pod_for_all_namespaces()
                total_pods = len(pods.items)
                running_pods = len([p for p in pods.items if p.status.phase == 'Running'])

                stats['total_pods'] = total_pods
                stats['running_pods'] = running_pods
            except ApiException as e:
                logger.warning("获取Pod信息失败: %s", e)
                stats['total_pods'] = 0
                stats['running_pods'] = 0

            # 获取服务数量
            try:
                services = core_v1.list_service_for_all_namespaces()
                stats['services'] = len(services.items)
            except ApiException as e:
                logger.warning("获取服务信息失败: %s", e)
                stats['services'] = 0

            cache_manager.set(cache_key, stats, K8S_STATS_TTL)
            return stats

        except Exception as e:
            logger.exception("获取集群统计信息失败: %s", e)
            return {}


def get_nodes_info(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群节点基本信息"""
    cache_key = f"k8s:nodes:cluster:{cluster.id}:ns:_all"
    cached = cache_manager.get(cache_key)
    if cached is not None:
        return cached

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
                age = calculate_age(node.metadata.creation_timestamp)

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

            cache_manager.set(cache_key, node_list, K8S_NODES_TTL)
            return node_list

        except Exception as e:
            logger.exception("获取节点信息失败: %s", e)
            return []


def get_node_details(cluster: Cluster, node_name: str) -> Optional[Dict[str, Any]]:
    """获取节点详细信息"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            node = core_v1.read_node(node_name)

            # 获取节点状态
            status = "Unknown"
            for condition in (node.status.conditions or []):
                if condition.type == "Ready":
                    status = "Ready" if condition.status == "True" else "NotReady"
                    break

            # 获取节点角色
            roles = []
            labels = dict(node.metadata.labels) if node.metadata.labels else {}
            if labels.get("node-role.kubernetes.io/master") == "true" or labels.get("node-role.kubernetes.io/control-plane") == "true":
                roles.append("master")
            if labels.get("node-role.kubernetes.io/worker") == "true":
                roles.append("worker")

            # 获取IP地址
            internal_ip = None
            external_ip = None
            for address in (node.status.addresses or []):
                if address.type == "InternalIP":
                    internal_ip = address.address
                elif address.type == "ExternalIP":
                    external_ip = address.address

            # 获取资源容量
            capacity = getattr(getattr(node, "status", None), "capacity", None) or {}
            cpu_capacity = capacity.get("cpu", "0")
            memory_capacity = capacity.get("memory", "0")
            pods_capacity = capacity.get("pods", "0")

            # 计算节点年龄
            age = calculate_age(node.metadata.creation_timestamp)

            # 获取条件状态
            conditions = []
            for condition in (node.status.conditions or []):
                conditions.append({
                    "type": condition.type,
                    "status": condition.status,
                    "last_heartbeat_time": str(condition.last_heartbeat_time) if condition.last_heartbeat_time else None,
                    "last_transition_time": str(condition.last_transition_time) if condition.last_transition_time else None,
                    "reason": condition.reason,
                    "message": condition.message,
                })

            # 获取污点
            taints = []
            if getattr(getattr(node, "spec", None), "taints", None):
                for taint in node.spec.taints:
                    taints.append({
                        "key": taint.key,
                        "value": taint.value,
                        "effect": taint.effect,
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
                "labels": labels,
                "annotations": dict(node.metadata.annotations) if node.metadata.annotations else {},
                "conditions": conditions,
                "taints": taints,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id,
            }

        except Exception as e:
            logger.exception("获取节点详情失败: %s", e)
            return None


def get_cluster_events(
    cluster: Cluster,
    namespace: Optional[str] = None,
    limit: int = 100,
    continue_token: Optional[str] = None,
    label_selector: Optional[str] = None,
    field_selector: Optional[str] = None,
) -> Dict[str, Any]:
    """分页获取集群或命名空间的事件（使用K8s API limit/_continue）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"items": [], "continue_token": None}

        try:
            core_v1 = client.CoreV1Api(client_instance)

            if namespace:
                event_list = core_v1.list_namespaced_event(
                    namespace,
                    limit=limit,
                    _continue=continue_token,
                    label_selector=label_selector,
                    field_selector=field_selector,
                )
            else:
                event_list = core_v1.list_event_for_all_namespaces(
                    limit=limit,
                    _continue=continue_token,
                    label_selector=label_selector,
                    field_selector=field_selector,
                )

            next_token = getattr(getattr(event_list, "metadata", None), "_continue", None)

            # 按时间排序，最新的在前
            def get_event_time(evt):
                ts = evt.last_timestamp or evt.event_time or evt.first_timestamp
                if ts and hasattr(ts, "timestamp"):
                    return ts.timestamp()
                if ts:
                    try:
                        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
                    except Exception:
                        return 0
                return 0

            sorted_events = sorted(getattr(event_list, "items", []) or [], key=get_event_time, reverse=True)

            events: List[Dict[str, Any]] = []
            for evt in sorted_events:
                age = "Unknown"
                if evt.last_timestamp and hasattr(evt.last_timestamp, "replace"):
                    now = datetime.now(timezone.utc)
                    delta = now - evt.last_timestamp.replace(tzinfo=timezone.utc)
                    if delta.days > 0:
                        age = f"{delta.days}d"
                    elif delta.seconds // 3600 > 0:
                        age = f"{delta.seconds // 3600}h"
                    elif delta.seconds // 60 > 0:
                        age = f"{delta.seconds // 60}m"
                    else:
                        age = f"{delta.seconds}s"

                events.append({
                    "name": evt.metadata.name,
                    "namespace": evt.metadata.namespace,
                    "type": evt.type,
                    "reason": evt.reason,
                    "message": evt.message,
                    "source": evt.source.component if evt.source else None,
                    "count": evt.count,
                    "first_timestamp": str(evt.first_timestamp) if evt.first_timestamp else None,
                    "last_timestamp": str(evt.last_timestamp) if evt.last_timestamp else None,
                    "age": age,
                    "involved_object": {
                        "kind": evt.involved_object.kind,
                        "name": evt.involved_object.name,
                        "namespace": evt.involved_object.namespace,
                    } if evt.involved_object else None,
                })

            return {"items": events, "continue_token": next_token}

        except Exception as e:
            logger.exception("获取集群事件失败: %s", e)
            return {"items": [], "continue_token": None}
