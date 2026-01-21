"""
Kubernetes命名空间操作模块
提供命名空间的增删查改功能
"""

from datetime import datetime, timedelta
import random
from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import calculate_age, parse_cpu, parse_memory


logger = get_logger(__name__)


def get_namespaces_info(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群命名空间信息"""
    with KubernetesClientContext(cluster) as client_instance:
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
                    if condition.type in ("NamespaceDeletionContentFailure", "NamespaceDeletionDiscoveryFailure"):
                        status = "Terminating"
                        break
                    if condition.type == "NamespaceDeletionGroupVersionParsingFailure":
                        status = "Failed"
                        break

                # 计算命名空间年龄
                age = calculate_age(ns.metadata.creation_timestamp)

                namespace_info = {
                    "name": ns.metadata.name,
                    "status": status,
                    "age": age,
                    "labels": dict(ns.metadata.labels) if ns.metadata.labels else {},
                    "annotations": dict(ns.metadata.annotations) if ns.metadata.annotations else {},
                }
                namespace_list.append(namespace_info)

            return namespace_list

        except Exception:
            # 如果连接失败，返回模拟数据
            return get_mock_namespaces()


def get_mock_namespaces() -> List[Dict[str, Any]]:
    """返回模拟的命名空间数据，包括系统命名空间"""
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
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            # 创建命名空间对象
            namespace = client.V1Namespace(
                metadata=client.V1ObjectMeta(
                    name=namespace_name,
                    labels=labels,
                )
            )

            core_v1.create_namespace(namespace)
            return True

        except ApiException as e:
            logger.warning("创建命名空间失败: %s", e)
            return False
        except Exception as e:
            logger.exception("创建命名空间异常: %s", e)
            return False


def delete_namespace(cluster: Cluster, namespace_name: str) -> bool:
    """删除命名空间"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_namespace(namespace_name)
            return True

        except ApiException as e:
            logger.warning("删除命名空间失败: %s", e)
            return False
        except Exception as e:
            logger.exception("删除命名空间异常: %s", e)
            return False


def get_namespace_resources(cluster: Cluster, namespace_name: str) -> Optional[Dict[str, Any]]:
    """获取命名空间资源使用情况"""
    with KubernetesClientContext(cluster) as client_instance:
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
                "services": service_count,
            }

        except Exception as e:
            logger.exception("获取命名空间资源信息失败: %s", e)
            return None


def get_namespace_crds(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的自定义资源"""
    with KubernetesClientContext(cluster) as client_instance:
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
            logger.exception("获取命名空间CRD失败: %s", e)
            return []
