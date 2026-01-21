"""
Kubernetes Service操作模块
提供Service的增删查改功能
"""

from __future__ import annotations

from io import StringIO
from typing import Any, Dict, List, Optional

import yaml
from kubernetes import client
from kubernetes.client.rest import ApiException

from ...cache import invalidate_cache
from ...core.logging import get_logger
from ...models import Cluster
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


def _get_service_external_ip(service: client.V1Service) -> Optional[str]:
    lb = getattr(getattr(service, "status", None), "load_balancer", None)
    ingresses = getattr(lb, "ingress", None) or []
    for ingress in ingresses:
        if getattr(ingress, "hostname", None):
            return ingress.hostname
        if getattr(ingress, "ip", None):
            return ingress.ip
    return None


def _build_ports(ports_data: List[Dict[str, Any]]) -> List[client.V1ServicePort]:
    ports: List[client.V1ServicePort] = []
    for port_data in ports_data or []:
        port = client.V1ServicePort(
            name=port_data.get("name"),
            protocol=port_data.get("protocol", "TCP"),
            port=port_data["port"],
            target_port=port_data.get("target_port", port_data["port"]),
        )
        if port_data.get("node_port") is not None:
            port.node_port = port_data["node_port"]
        ports.append(port)
    return ports


def _build_session_affinity_config(cfg: Any) -> Optional[client.V1SessionAffinityConfig]:
    """
    支持从 dict 构建 sessionAffinityConfig。

    兼容常见 YAML 结构：
      sessionAffinityConfig:
        clientIP:
          timeoutSeconds: 10800
    """
    if not isinstance(cfg, dict):
        return None

    client_ip_cfg = cfg.get("clientIP") or cfg.get("clientIp") or cfg.get("client_ip") or cfg.get("clientip")
    if not isinstance(client_ip_cfg, dict):
        return None

    timeout = client_ip_cfg.get("timeoutSeconds")
    if timeout is None:
        timeout = client_ip_cfg.get("timeout_seconds")
    if timeout is None:
        return client.V1SessionAffinityConfig()

    try:
        timeout_int = int(timeout)
    except Exception:
        timeout_int = None

    return client.V1SessionAffinityConfig(client_ip=client.V1ClientIPConfig(timeout_seconds=timeout_int))


def _invalidate_service_related_caches(cluster: Cluster) -> None:
    # Service 的增删改会影响 dashboard stats 的 total_services
    invalidate_cache(f"k8s:stats:cluster:{cluster.id}:ns:_all*")


def get_namespace_services(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            services = core_v1.list_namespaced_service(namespace)

            service_list: List[Dict[str, Any]] = []
            for service in services.items or []:
                service_type = getattr(getattr(service, "spec", None), "type", None) or "ClusterIP"
                cluster_ip = getattr(getattr(service, "spec", None), "cluster_ip", None)
                external_ip = _get_service_external_ip(service)

                ports: List[Dict[str, Any]] = []
                for port in getattr(getattr(service, "spec", None), "ports", None) or []:
                    port_info: Dict[str, Any] = {
                        "name": port.name,
                        "protocol": port.protocol,
                        "port": port.port,
                        "target_port": port.target_port,
                    }
                    if getattr(port, "node_port", None):
                        port_info["node_port"] = port.node_port
                    ports.append(port_info)

                age = calculate_age(getattr(getattr(service, "metadata", None), "creation_timestamp", None))

                service_list.append(
                    {
                        "name": service.metadata.name,
                        "namespace": namespace,
                        "type": service_type,
                        "cluster_ip": cluster_ip,
                        "external_ip": external_ip,
                        "ports": ports,
                        "age": age,
                        "labels": dict(service.metadata.labels) if service.metadata.labels else {},
                        "selector": dict(service.spec.selector) if service.spec and service.spec.selector else {},
                        "cluster_name": cluster.name,
                        "cluster_id": cluster.id,
                    }
                )

            return service_list

        except ApiException as e:
            logger.warning("获取命名空间服务失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []
        except Exception as e:
            logger.exception("获取命名空间服务失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []


def get_service_details(cluster: Cluster, namespace: str, service_name: str) -> Optional[Dict[str, Any]]:
    """获取服务详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            service = core_v1.read_namespaced_service(service_name, namespace)

            service_type = getattr(getattr(service, "spec", None), "type", None) or "ClusterIP"
            cluster_ip = getattr(getattr(service, "spec", None), "cluster_ip", None)
            external_ip = _get_service_external_ip(service)

            ports: List[Dict[str, Any]] = []
            for port in getattr(getattr(service, "spec", None), "ports", None) or []:
                port_info: Dict[str, Any] = {
                    "name": port.name,
                    "protocol": port.protocol,
                    "port": port.port,
                    "target_port": port.target_port,
                }
                if getattr(port, "node_port", None):
                    port_info["node_port"] = port.node_port
                ports.append(port_info)

            age = calculate_age(getattr(getattr(service, "metadata", None), "creation_timestamp", None))
            creation_timestamp = (
                str(service.metadata.creation_timestamp) if service.metadata and service.metadata.creation_timestamp else "Unknown"
            )

            endpoints: List[Dict[str, Any]] = []
            try:
                eps = core_v1.read_namespaced_endpoints(service_name, namespace)
                for subset in getattr(eps, "subsets", None) or []:
                    for address in getattr(subset, "addresses", None) or []:
                        target_ref = getattr(address, "target_ref", None)
                        endpoints.append(
                            {
                                "ip": getattr(address, "ip", None),
                                "node_name": getattr(address, "node_name", None),
                                "target_ref": {
                                    "kind": getattr(target_ref, "kind", None),
                                    "name": getattr(target_ref, "name", None),
                                    "namespace": getattr(target_ref, "namespace", None),
                                }
                                if target_ref
                                else None,
                            }
                        )
            except Exception:
                endpoints = []

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
                "selector": dict(service.spec.selector) if service.spec and service.spec.selector else {},
                "endpoints": endpoints,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id,
            }

        except ApiException as e:
            logger.warning(
                "获取服务详情失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return None
        except Exception as e:
            logger.exception(
                "获取服务详情失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return None


def create_service(cluster: Cluster, namespace: str, service_data: Dict[str, Any]) -> bool:
    """创建服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            ports = _build_ports(service_data.get("ports") or [])

            spec_kwargs: Dict[str, Any] = {
                "type": service_data.get("type", "ClusterIP"),
                "ports": ports,
                "selector": service_data.get("selector", {}) or {},
            }
            if service_data.get("cluster_ip") is not None:
                spec_kwargs["cluster_ip"] = service_data.get("cluster_ip")
            if service_data.get("load_balancer_ip") is not None:
                spec_kwargs["load_balancer_ip"] = service_data.get("load_balancer_ip")
            if service_data.get("external_traffic_policy") is not None:
                spec_kwargs["external_traffic_policy"] = service_data.get("external_traffic_policy")
            if service_data.get("session_affinity") is not None:
                spec_kwargs["session_affinity"] = service_data.get("session_affinity")
            if service_data.get("session_affinity_config") is not None:
                spec_kwargs["session_affinity_config"] = _build_session_affinity_config(
                    service_data.get("session_affinity_config")
                )

            service = client.V1Service(
                metadata=client.V1ObjectMeta(
                    name=service_data["name"],
                    namespace=namespace,
                    labels=service_data.get("labels", {}) or {},
                    annotations=service_data.get("annotations", {}) or {},
                ),
                spec=client.V1ServiceSpec(**spec_kwargs),
            )

            core_v1.create_namespaced_service(namespace, service)
            _invalidate_service_related_caches(cluster)
            return True

        except ApiException as e:
            logger.warning("创建服务失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return False
        except Exception as e:
            logger.exception("创建服务失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return False


def update_service(cluster: Cluster, namespace: str, service_name: str, service_data: Dict[str, Any]) -> bool:
    """更新服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            existing_service = core_v1.read_namespaced_service(service_name, namespace)

            # 更新 spec
            if "type" in service_data and service_data["type"] is not None:
                existing_service.spec.type = service_data["type"]

            if "ports" in service_data and service_data["ports"] is not None:
                existing_service.spec.ports = _build_ports(service_data["ports"])

            if "selector" in service_data and service_data["selector"] is not None:
                existing_service.spec.selector = service_data["selector"]

            if "cluster_ip" in service_data and service_data["cluster_ip"] is not None:
                existing_service.spec.cluster_ip = service_data["cluster_ip"]

            if "load_balancer_ip" in service_data and service_data["load_balancer_ip"] is not None:
                existing_service.spec.load_balancer_ip = service_data["load_balancer_ip"]

            if "external_traffic_policy" in service_data and service_data["external_traffic_policy"] is not None:
                existing_service.spec.external_traffic_policy = service_data["external_traffic_policy"]

            if "session_affinity" in service_data and service_data["session_affinity"] is not None:
                existing_service.spec.session_affinity = service_data["session_affinity"]

            if "session_affinity_config" in service_data and service_data["session_affinity_config"] is not None:
                existing_service.spec.session_affinity_config = _build_session_affinity_config(
                    service_data["session_affinity_config"]
                )

            # 更新 metadata
            if "labels" in service_data and service_data["labels"] is not None:
                existing_service.metadata.labels = service_data["labels"]

            if "annotations" in service_data and service_data["annotations"] is not None:
                existing_service.metadata.annotations = service_data["annotations"]

            core_v1.replace_namespaced_service(service_name, namespace, existing_service)
            _invalidate_service_related_caches(cluster)
            return True

        except ApiException as e:
            logger.warning(
                "更新服务失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return False
        except Exception as e:
            logger.exception(
                "更新服务失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return False


def delete_service(cluster: Cluster, namespace: str, service_name: str) -> bool:
    """删除服务"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_namespaced_service(service_name, namespace)
            _invalidate_service_related_caches(cluster)
            return True
        except ApiException as e:
            logger.warning(
                "删除服务失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return False
        except Exception as e:
            logger.exception(
                "删除服务失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return False


def get_service_yaml(cluster: Cluster, namespace: str, service_name: str) -> Optional[str]:
    """获取Service的YAML"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            svc = core_v1.read_namespaced_service(service_name, namespace)

            svc_dict = client_instance.sanitize_for_serialization(svc)
            yaml_output = StringIO()
            yaml.dump(svc_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
            return yaml_output.getvalue()
        except ApiException as e:
            logger.warning(
                "获取Service YAML失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return None
        except Exception as e:
            logger.exception(
                "获取Service YAML失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
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
            _invalidate_service_related_caches(cluster)
            return {"success": True, "message": f"Service '{service_name}' 更新成功"}

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            logger.exception(
                "更新Service YAML失败: cluster=%s ns=%s service=%s error=%s",
                cluster.name,
                namespace,
                service_name,
                e,
            )
            return {"success": False, "message": f"更新Service失败: {str(e)}"}

