"""
Kubernetes Pod操作模块
提供Pod的增删查改功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


def get_pods_info(cluster: Cluster, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
    """获取Pod信息"""
    with KubernetesClientContext(cluster) as client_instance:
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
                age = calculate_age(pod.metadata.creation_timestamp)

                pod_info = {
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": status,
                    "node_name": pod.spec.node_name,
                    "age": age,
                    "restarts": restarts,
                    "ready_containers": ready_containers,
                    "labels": dict(pod.metadata.labels) if pod.metadata.labels else {},
                }
                pod_list.append(pod_info)

            return pod_list

        except Exception as e:
            logger.exception("获取Pod信息失败: %s", e)
            return []


def get_pods_page(
    cluster: Cluster,
    namespace: Optional[str] = None,
    limit: int = 200,
    continue_token: Optional[str] = None,
) -> Dict[str, Any]:
    """分页获取Pod信息（使用K8s API limit/_continue）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"items": [], "continue_token": None}

        try:
            core_v1 = client.CoreV1Api(client_instance)

            if namespace:
                pods = core_v1.list_namespaced_pod(namespace, limit=limit, _continue=continue_token)
            else:
                pods = core_v1.list_pod_for_all_namespaces(limit=limit, _continue=continue_token)

            next_token = getattr(getattr(pods, "metadata", None), "_continue", None)

            pod_list: List[Dict[str, Any]] = []
            for pod in pods.items:
                status = pod.status.phase

                restarts = 0
                ready_containers = "0/0"
                if pod.status.container_statuses:
                    total_containers = len(pod.status.container_statuses)
                    ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
                    ready_containers = f"{ready_count}/{total_containers}"
                    restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

                age = calculate_age(pod.metadata.creation_timestamp)

                pod_info = {
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": status,
                    "node_name": pod.spec.node_name,
                    "age": age,
                    "restarts": restarts,
                    "ready_containers": ready_containers,
                    "labels": dict(pod.metadata.labels) if pod.metadata.labels else {},
                }
                pod_list.append(pod_info)

            return {"items": pod_list, "continue_token": next_token}
        except Exception as e:
            logger.exception("分页获取Pod信息失败: %s", e)
            return {"items": [], "continue_token": None}


def get_pod_details(cluster: Cluster, namespace: str, pod_name: str) -> Optional[Dict[str, Any]]:
    """获取Pod详细信息"""
    with KubernetesClientContext(cluster) as client_instance:
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
        age = calculate_age(pod.metadata.creation_timestamp)

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
                "cluster_id": cluster.id,
            }

        except Exception as e:
            logger.exception("获取Pod详情失败: %s", e)
            return None


def get_pod_logs(cluster: Cluster, namespace: str, pod_name: str, container: Optional[str] = None, tail_lines: Optional[int] = 100) -> Optional[str]:
    """获取Pod日志"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            logs = core_v1.read_namespaced_pod_log(
                pod_name,
                namespace,
                container=container,
                tail_lines=tail_lines,
            )
            return logs
        except Exception as e:
            logger.exception("获取Pod日志失败: %s", e)
            return None


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
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            # 构建删除选项
            delete_options = client.V1DeleteOptions()
            if force:
                delete_options.grace_period_seconds = 0

            core_v1.delete_namespaced_pod(name=pod_name, namespace=namespace, body=delete_options)
            return True
        except Exception as e:
            logger.exception("删除Pod失败: %s", e)
            return False


def batch_delete_pods(cluster: Cluster, pod_list: List[Dict[str, str]], force: bool = False) -> Dict[str, bool]:
    """批量删除Pods

    Args:
        cluster: 集群配置
        pod_list: Pod列表，每个元素包含 'namespace' 和 'name'
        force: 是否强制删除

    Returns:
        字典，key为"namespace/name"，value为操作结果
    """
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {f"{pod['namespace']}/{pod['name']}": False for pod in pod_list}

        results = {}
        core_v1 = client.CoreV1Api(client_instance)

        # 构建删除选项
        delete_options = client.V1DeleteOptions()
        if force:
            delete_options.grace_period_seconds = 0

        for pod in pod_list:
            pod_key = f"{pod['namespace']}/{pod['name']}"
            try:
                core_v1.delete_namespaced_pod(name=pod["name"], namespace=pod["namespace"], body=delete_options)
                results[pod_key] = True
            except Exception as e:
                logger.warning("删除Pod失败: pod=%s error=%s", pod_key, e)
                results[pod_key] = False

        return results


def batch_restart_pods(cluster: Cluster, pod_list: List[Dict[str, str]]) -> Dict[str, bool]:
    """批量重启Pods（通过删除实现重启）

    Args:
        cluster: 集群配置
        pod_list: Pod列表，每个元素包含 'namespace' 和 'name'

    Returns:
        字典，key为"namespace/name"，value为操作结果
    """
    # 重启实际上就是删除Pod，让控制器重新创建
    return batch_delete_pods(cluster, pod_list, force=False)
