"""
Kubernetes Service操作模块
提供Service的增删查改功能
"""

from typing import Dict, Any, Optional, List
from io import StringIO

from kubernetes import client
from kubernetes.client.rest import ApiException
import yaml

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


def get_namespace_services(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            services = core_v1.list_namespaced_service(namespace)

        service_list = []
        for service in services.items:
            # 获取服务类型
            service_type = service.spec.type or "ClusterIP"

            # 获取ClusterIP
            cluster_ip = service.spec.cluster_ip

            # 获取ExternalIP
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
                    port_info = {
                        "name": port.name,
                        "protocol": port.protocol,
                        "port": port.port,
                        "target_port": port.target_port
                    }
                    if port.node_port:
                        port_info["node_port"] = port.node_port
                    ports.append(port_info)

            # 计算年龄
            age = calculate_age(service.metadata.creation_timestamp)

            service_info = {
                "name": service.metadata.name,
                "namespace": namespace,
                "type": service_type,
                "cluster_ip": cluster_ip,
                "external_ip": external_ip,
                "ports": ports,
                "age": age,
                "labels": dict(service.metadata.labels) if service.metadata.labels else {},
                "selector": dict(service.spec.selector) if service.spec.selector else {}
            }
            service_list.append(service_info)

            return service_list

        except Exception as e:
            logger.exception("获取命名空间服务失败: %s", e)
            return []


def get_service_details(cluster: Cluster, namespace: str, service_name: str) -> Optional[Dict[str, Any]]:
    """获取服务详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            service = core_v1.read_namespaced_service(service_name, namespace)

        # 获取服务类型
        service_type = service.spec.type or "ClusterIP"

        # 获取ClusterIP
        cluster_ip = service.spec.cluster_ip

        # 获取ExternalIP
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
                port_info = {
                    "name": port.name,
                    "protocol": port.protocol,
                    "port": port.port,
                    "target_port": port.target_port
                }
                if port.node_port:
                    port_info["node_port"] = port.node_port
                ports.append(port_info)

        # 计算年龄
        age = calculate_age(service.metadata.creation_timestamp)
        creation_timestamp = str(service.metadata.creation_timestamp) if service.metadata.creation_timestamp else "Unknown"

        # 获取关联的Endpoints
        endpoints = []
        try:
            eps = core_v1.read_namespaced_endpoints(service_name, namespace)
            if eps.subsets:
                for subset in eps.subsets:
                    if subset.addresses:
                        for address in subset.addresses:
                            endpoint = {
                                "ip": address.ip,
                                "node_name": address.node_name,
                                "target_ref": {
                                    "kind": address.target_ref.kind,
                                    "name": address.target_ref.name,
                                    "namespace": address.target_ref.namespace
                                } if address.target_ref else None
                            }
                            endpoints.append(endpoint)
        except:
            pass

            return {
                "name": service.metadata.name,
                "namespace": namespace,
                "type": service_type,
                "cluster_ip": cluster_ip,
                "external_ip": external_ip,
                "ports": ports,
                "age": age,
                "creation_timestamp": creation_timestamp,
                "labels": dict(service.metadata.labels) if service.metadata.labels else {},
                "annotations": dict(service.metadata.annotations) if service.metadata.annotations else {},
                "selector": dict(service.spec.selector) if service.spec.selector else {},
                "endpoints": endpoints,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id,
            }

        except Exception as e:
            logger.exception("获取服务详情失败: %s", e)
            return None


def create_service(cluster: Cluster, namespace: str, service_data: Dict[str, Any]) -> bool:
    """创建服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

        # 构建端口
        ports = []
        for port_data in service_data.get("ports", []):
            port = client.V1ServicePort(
                name=port_data.get("name"),
                protocol=port_data.get("protocol", "TCP"),
                port=port_data["port"],
                target_port=port_data.get("target_port", port_data["port"])
            )
            if port_data.get("node_port"):
                port.node_port = port_data["node_port"]
            ports.append(port)

        # 构建服务
        service = client.V1Service(
            metadata=client.V1ObjectMeta(
                name=service_data["name"],
                namespace=namespace,
                labels=service_data.get("labels", {}),
                annotations=service_data.get("annotations", {})
            ),
            spec=client.V1ServiceSpec(
                type=service_data.get("type", "ClusterIP"),
                ports=ports,
                selector=service_data.get("selector", {})
            )
        )

            core_v1.create_namespaced_service(namespace, service)
            return True

        except Exception as e:
            logger.exception("创建服务失败: %s", e)
            return False


def update_service(cluster: Cluster, namespace: str, service_name: str, service_data: Dict[str, Any]) -> bool:
    """更新服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

        # 获取现有服务
        existing_service = core_v1.read_namespaced_service(service_name, namespace)

        # 更新端口
        if "ports" in service_data:
            ports = []
            for port_data in service_data["ports"]:
                port = client.V1ServicePort(
                    name=port_data.get("name"),
                    protocol=port_data.get("protocol", "TCP"),
                    port=port_data["port"],
                    target_port=port_data.get("target_port", port_data["port"])
                )
                if port_data.get("node_port"):
                    port.node_port = port_data["node_port"]
                ports.append(port)
            existing_service.spec.ports = ports

        # 更新选择器
        if "selector" in service_data:
            existing_service.spec.selector = service_data["selector"]

        # 更新标签
        if "labels" in service_data:
            existing_service.metadata.labels = service_data["labels"]

        # 更新注解
        if "annotations" in service_data:
            existing_service.metadata.annotations = service_data["annotations"]

            core_v1.replace_namespaced_service(service_name, namespace, existing_service)
            return True

        except Exception as e:
            logger.exception("更新服务失败: %s", e)
            return False


def delete_service(cluster: Cluster, namespace: str, service_name: str) -> bool:
    """删除服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_namespaced_service(service_name, namespace)
            return True

        except Exception as e:
            logger.exception("删除服务失败: %s", e)
            return False


def get_service_yaml(cluster: Cluster, namespace: str, service_name: str) -> Optional[str]:
    """获取Service的YAML"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            svc = core_v1.read_namespaced_service(service_name, namespace)

            api_client = client.ApiClient()
            svc_dict = api_client.sanitize_for_serialization(svc)

            yaml_output = StringIO()
            yaml.dump(svc_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
            return yaml_output.getvalue()

        except Exception as e:
            logger.exception("获取Service YAML失败: %s/%s error=%s", namespace, service_name, e)
            return None


def update_service_yaml(cluster: Cluster, namespace: str, service_name: str, yaml_content: str) -> Dict[str, Any]:
    """更新Service的YAML配置"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            core_v1 = client.CoreV1Api(client_instance)

        svc_dict = yaml.safe_load(yaml_content) or {}
        if not isinstance(svc_dict, dict):
            return {"success": False, "message": "YAML内容格式不正确"}

        # 强制与URL参数一致，避免用户误改导致更新到别的资源
        metadata = svc_dict.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        metadata["name"] = service_name
        metadata["namespace"] = namespace
        svc_dict["metadata"] = metadata

        # status 属于子资源，更新主体时移除以减少失败概率
        svc_dict.pop("status", None)

            core_v1.replace_namespaced_service(service_name, namespace, svc_dict)
            return {"success": True, "message": f"Service '{service_name}' 更新成功"}

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            return {"success": False, "message": f"更新Service失败: {str(e)}"}
