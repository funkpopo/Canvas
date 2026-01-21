"""
Kubernetes Deployment操作模块
提供Deployment的增删查改功能
"""

import yaml
from io import StringIO
from datetime import datetime
from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


def get_namespace_deployments(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的部署"""
    with KubernetesClientContext(cluster) as client_instance:
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
                        if condition.type == "Progressing":
                            status = "Progressing" if condition.status == "True" else "Failed"

                # 获取镜像列表
                images = []
                if deployment.spec.template.spec.containers:
                    for container in deployment.spec.template.spec.containers:
                        images.append(container.image)

                # 计算部署年龄
                age = calculate_age(deployment.metadata.creation_timestamp)

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
                    "status": status,
                }
                deployment_list.append(deployment_info)

            return deployment_list

        except Exception as e:
            logger.exception("获取命名空间部署失败: %s", e)
            return []


def get_deployment_details(cluster: Cluster, namespace: str, deployment_name: str) -> Optional[Dict[str, Any]]:
    """获取部署详细信息"""
    with KubernetesClientContext(cluster) as client_instance:
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
            age = calculate_age(deployment.metadata.creation_timestamp)
            creation_timestamp = (
                str(deployment.metadata.creation_timestamp) if deployment.metadata.creation_timestamp else "Unknown"
            )

            # 获取策略信息
            strategy = {}
            if deployment.spec.strategy:
                strategy = {
                    "type": deployment.spec.strategy.type,
                    "rolling_update": {
                        "max_surge": str(deployment.spec.strategy.rolling_update.max_surge)
                        if deployment.spec.strategy.rolling_update
                        else None,
                        "max_unavailable": str(deployment.spec.strategy.rolling_update.max_unavailable)
                        if deployment.spec.strategy.rolling_update
                        else None,
                    }
                    if deployment.spec.strategy.rolling_update
                    else None,
                }

            # 获取选择器
            selector = {}
            if deployment.spec.selector.match_labels:
                selector = dict(deployment.spec.selector.match_labels)

            # 获取条件
            conditions = []
            if deployment.status.conditions:
                for condition in deployment.status.conditions:
                    conditions.append(
                        {
                            "type": condition.type,
                            "status": condition.status,
                            "last_update_time": str(condition.last_update_time)
                            if condition.last_update_time
                            else None,
                            "last_transition_time": str(condition.last_transition_time)
                            if condition.last_transition_time
                            else None,
                            "reason": condition.reason,
                            "message": condition.message,
                        }
                    )

            # 转换spec和status为字典格式
            spec_dict = {}
            status_dict = {}

            try:
                spec_dict = client.ApiClient().sanitize_for_serialization(deployment.spec)
            except Exception as e:
                logger.warning("转换spec失败: %s", e)

            try:
                status_dict = client.ApiClient().sanitize_for_serialization(deployment.status)
            except Exception as e:
                logger.warning("转换status失败: %s", e)

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
                "cluster_id": cluster.id,
            }

        except Exception as e:
            logger.exception("获取部署详情失败: %s", e)
            return None


def get_deployment_pods(cluster: Cluster, namespace: str, deployment_name: str) -> List[Dict[str, Any]]:
    """获取部署管理的Pods"""
    with KubernetesClientContext(cluster) as client_instance:
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
            logger.exception("获取部署Pods失败: %s", e)
            return []


def scale_deployment(cluster: Cluster, namespace: str, deployment_name: str, replicas: int) -> bool:
    """扩容/缩容部署"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            apps_v1 = client.AppsV1Api(client_instance)

            # 创建scale对象
            scale = client.V1Scale(spec=client.V1ScaleSpec(replicas=replicas))

            apps_v1.patch_namespaced_deployment_scale(deployment_name, namespace, scale)
            return True

        except Exception as e:
            logger.exception("扩容部署失败: %s", e)
            return False


def restart_deployment(cluster: Cluster, namespace: str, deployment_name: str) -> bool:
    """重启部署（通过更新注解实现）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            apps_v1 = client.AppsV1Api(client_instance)

            # 通过更新注解来触发重启
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

            apps_v1.patch_namespaced_deployment(deployment_name, namespace, restart_annotation)
            return True

        except Exception as e:
            logger.exception("重启部署失败: %s", e)
            return False


def delete_deployment(cluster: Cluster, namespace: str, deployment_name: str) -> bool:
    """删除部署"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            apps_v1 = client.AppsV1Api(client_instance)
            apps_v1.delete_namespaced_deployment(deployment_name, namespace)
            return True
        except Exception as e:
            logger.exception("删除部署失败: %s", e)
            return False


def get_deployment_services(cluster: Cluster, namespace: str, deployment_name: str) -> List[Dict[str, Any]]:
    """获取部署关联的服务"""
    with KubernetesClientContext(cluster) as client_instance:
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
                                if ingress.ip:
                                    external_ip = ingress.ip
                                    break

                        # 获取端口信息
                        ports = []
                        if service.spec.ports:
                            for port in service.spec.ports:
                                ports.append(
                                    {
                                        "name": port.name,
                                        "protocol": port.protocol,
                                        "port": port.port,
                                        "target_port": port.target_port,
                                        "node_port": port.node_port,
                                    }
                                )

                        service_info = {
                            "name": service.metadata.name,
                            "namespace": service.metadata.namespace,
                            "type": service_type,
                            "cluster_ip": cluster_ip,
                            "external_ip": external_ip,
                            "ports": ports,
                            "selector": dict(service.spec.selector),
                            "labels": dict(service.metadata.labels) if service.metadata.labels else {},
                            "annotations": dict(service.metadata.annotations) if service.metadata.annotations else {},
                        }
                        matching_services.append(service_info)

            return matching_services

        except Exception as e:
            logger.exception("获取部署服务失败: %s", e)
            return []


def update_deployment(cluster: Cluster, namespace: str, deployment_name: str, update_data: dict) -> bool:
    """更新部署（暂未实现）"""
    logger.warning("update_deployment 暂未实现: %s/%s", namespace, deployment_name)
    return False


def get_deployment_yaml(cluster: Cluster, namespace: str, deployment_name: str) -> Optional[str]:
    """获取部署YAML"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            logger.warning("无法创建Kubernetes客户端连接: %s", cluster.name)
            return None

        try:
            apps_v1 = client.AppsV1Api(client_instance)
            logger.info("正在获取部署: %s/%s 在集群 %s", namespace, deployment_name, cluster.name)
            deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

            # 使用Kubernetes Python客户端的序列化方法
            api_client = client.ApiClient()
            deployment_dict = api_client.sanitize_for_serialization(deployment)

            # 转换为YAML字符串
            yaml_output = StringIO()
            yaml.dump(deployment_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
            yaml_str = yaml_output.getvalue()

            logger.info("成功获取部署YAML，长度: %d 字符", len(yaml_str))
            return yaml_str

        except Exception as e:
            logger.exception("获取部署YAML失败: %s/%s 错误: %s", namespace, deployment_name, e)
            return None


def update_deployment_yaml(cluster: Cluster, namespace: str, deployment_name: str, yaml_content: str) -> bool:
    """更新部署YAML"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            from kubernetes.client.models import V1Deployment

            apps_v1 = client.AppsV1Api(client_instance)

            # 解析YAML内容
            deployment_dict = yaml.safe_load(yaml_content)

            # 创建Deployment对象
            deployment = V1Deployment(
                api_version=deployment_dict.get("apiVersion"),
                kind=deployment_dict.get("kind"),
                metadata=client.V1ObjectMeta(**deployment_dict.get("metadata", {})),
                spec=client.V1DeploymentSpec(**deployment_dict.get("spec", {})),
            )

            # 更新部署
            apps_v1.replace_namespaced_deployment(name=deployment_name, namespace=namespace, body=deployment)

            return True

        except Exception as e:
            logger.exception("更新部署YAML失败: %s", e)
            return False
