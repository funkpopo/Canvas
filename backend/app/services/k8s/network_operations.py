"""
Kubernetes网络操作模块
提供NetworkPolicy和Ingress的操作功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


# ========== NetworkPolicy 操作 ==========

def get_namespace_network_policies(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的网络策略"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)
            network_policies = networking_v1.list_namespaced_network_policy(namespace)

            policy_list = []
            for policy in network_policies.items:
                age = calculate_age(policy.metadata.creation_timestamp)

                policy_list.append({
                    "name": policy.metadata.name,
                    "namespace": namespace,
                    "pod_selector": dict(policy.spec.pod_selector.match_labels) if policy.spec.pod_selector and policy.spec.pod_selector.match_labels else {},
                    "policy_types": policy.spec.policy_types if policy.spec.policy_types else [],
                    "age": age,
                    "labels": dict(policy.metadata.labels) if policy.metadata.labels else {}
                })

            return policy_list

        except Exception as e:
            logger.exception("获取网络策略失败: %s", e)
            return []


def get_network_policy_details(cluster: Cluster, namespace: str, policy_name: str) -> Optional[Dict[str, Any]]:
    """获取网络策略详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)
            policy = networking_v1.read_namespaced_network_policy(policy_name, namespace)

            age = calculate_age(policy.metadata.creation_timestamp)
            creation_timestamp = str(policy.metadata.creation_timestamp) if policy.metadata.creation_timestamp else "Unknown"

            # 解析入站规则
            ingress_rules = _build_network_policy_rules(policy.spec.ingress) if policy.spec.ingress else []

            # 解析出站规则
            egress_rules = _build_network_policy_egress_rules(policy.spec.egress) if policy.spec.egress else []

            return {
                "name": policy.metadata.name,
                "namespace": namespace,
                "pod_selector": dict(policy.spec.pod_selector.match_labels) if policy.spec.pod_selector and policy.spec.pod_selector.match_labels else {},
                "policy_types": policy.spec.policy_types if policy.spec.policy_types else [],
                "ingress_rules": ingress_rules,
                "egress_rules": egress_rules,
                "age": age,
                "creation_timestamp": creation_timestamp,
                "labels": dict(policy.metadata.labels) if policy.metadata.labels else {},
                "annotations": dict(policy.metadata.annotations) if policy.metadata.annotations else {},
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            }

        except Exception as e:
            logger.exception("获取网络策略详情失败: %s", e)
            return None


def _build_network_policy_rules(ingress_list) -> List[Dict[str, Any]]:
    """构建入站规则列表"""
    rules = []
    for ingress in ingress_list:
        rule = {
            "from": [],
            "ports": []
        }

        # 解析源
        if ingress._from:
            for source in ingress._from:
                source_info = {}
                if source.ip_block:
                    source_info["ip_block"] = {
                        "cidr": source.ip_block.cidr,
                        "except": source.ip_block._except if source.ip_block._except else []
                    }
                if source.namespace_selector:
                    source_info["namespace_selector"] = dict(source.namespace_selector.match_labels) if source.namespace_selector.match_labels else {}
                if source.pod_selector:
                    source_info["pod_selector"] = dict(source.pod_selector.match_labels) if source.pod_selector.match_labels else {}
                rule["from"].append(source_info)

        # 解析端口
        if ingress.ports:
            for port in ingress.ports:
                port_info = {
                    "protocol": port.protocol or "TCP",
                    "port": port.port
                }
                if port.end_port:
                    port_info["end_port"] = port.end_port
                rule["ports"].append(port_info)

        rules.append(rule)
    return rules


def _build_network_policy_egress_rules(egress_list) -> List[Dict[str, Any]]:
    """构建出站规则列表"""
    rules = []
    for egress in egress_list:
        rule = {
            "to": [],
            "ports": []
        }

        # 解析目标
        if egress.to:
            for dest in egress.to:
                dest_info = {}
                if dest.ip_block:
                    dest_info["ip_block"] = {
                        "cidr": dest.ip_block.cidr,
                        "except": dest.ip_block._except if dest.ip_block._except else []
                    }
                if dest.namespace_selector:
                    dest_info["namespace_selector"] = dict(dest.namespace_selector.match_labels) if dest.namespace_selector.match_labels else {}
                if dest.pod_selector:
                    dest_info["pod_selector"] = dict(dest.pod_selector.match_labels) if dest.pod_selector.match_labels else {}
                rule["to"].append(dest_info)

        # 解析端口
        if egress.ports:
            for port in egress.ports:
                port_info = {
                    "protocol": port.protocol or "TCP",
                    "port": port.port
                }
                if port.end_port:
                    port_info["end_port"] = port.end_port
                rule["ports"].append(port_info)

        rules.append(rule)
    return rules


def create_network_policy(cluster: Cluster, namespace: str, policy_data: Dict[str, Any]) -> bool:
    """创建网络策略"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)

            # 构建策略
            policy = client.V1NetworkPolicy(
                metadata=client.V1ObjectMeta(
                    name=policy_data["name"],
                    namespace=namespace,
                    labels=policy_data.get("labels", {})
                ),
                spec=client.V1NetworkPolicySpec(
                    pod_selector=client.V1LabelSelector(
                        match_labels=policy_data.get("pod_selector", {})
                    ),
                    policy_types=policy_data.get("policy_types", ["Ingress"])
                )
            )

            networking_v1.create_namespaced_network_policy(namespace, policy)
            return True

        except Exception as e:
            logger.exception("创建网络策略失败: %s", e)
            return False


def update_network_policy(cluster: Cluster, namespace: str, policy_name: str, policy_data: Dict[str, Any]) -> bool:
    """更新网络策略"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)

            # 获取现有策略
            existing_policy = networking_v1.read_namespaced_network_policy(policy_name, namespace)

            # 更新字段
            if "pod_selector" in policy_data:
                existing_policy.spec.pod_selector = client.V1LabelSelector(
                    match_labels=policy_data["pod_selector"]
                )

            if "policy_types" in policy_data:
                existing_policy.spec.policy_types = policy_data["policy_types"]

            if "labels" in policy_data:
                existing_policy.metadata.labels = policy_data["labels"]

            networking_v1.replace_namespaced_network_policy(policy_name, namespace, existing_policy)
            return True

        except Exception as e:
            logger.exception("更新网络策略失败: %s", e)
            return False


def delete_network_policy(cluster: Cluster, namespace: str, policy_name: str) -> bool:
    """删除网络策略"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)
            networking_v1.delete_namespaced_network_policy(policy_name, namespace)
            return True

        except Exception as e:
            logger.exception("删除网络策略失败: %s", e)
            return False


# ========== Ingress 操作 ==========

def get_namespace_ingresses(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的Ingresses"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)
            ingresses = networking_v1.list_namespaced_ingress(namespace)

            ing_list = []
            for ing in ingresses.items:
                age = calculate_age(ing.metadata.creation_timestamp)

                hosts = []
                if ing.spec.rules:
                    for rule in ing.spec.rules:
                        if rule.host:
                            hosts.append(rule.host)

                addresses = []
                if ing.status and ing.status.load_balancer and ing.status.load_balancer.ingress:
                    for lb_ing in ing.status.load_balancer.ingress:
                        if lb_ing.ip:
                            addresses.append(lb_ing.ip)
                        elif lb_ing.hostname:
                            addresses.append(lb_ing.hostname)

                ing_list.append({
                    "name": ing.metadata.name,
                    "namespace": namespace,
                    "hosts": hosts,
                    "addresses": addresses,
                    "age": age,
                    "labels": dict(ing.metadata.labels) if ing.metadata.labels else {},
                    "cluster_id": cluster.id,
                    "cluster_name": cluster.name
                })

            return ing_list
        except Exception as e:
            logger.exception("获取Ingresses失败: %s", e)
            return []


def get_ingress_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取Ingress详细信息"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)
            ing = networking_v1.read_namespaced_ingress(name, namespace)

            age = calculate_age(ing.metadata.creation_timestamp)
            creation_timestamp = str(ing.metadata.creation_timestamp) if ing.metadata.creation_timestamp else "Unknown"

            rules = []
            if ing.spec.rules:
                for rule in ing.spec.rules:
                    rule_info = {"host": rule.host or "*"}
                    if rule.http and rule.http.paths:
                        rule_info["paths"] = [{
                            "path": path.path or "/",
                            "path_type": path.path_type,
                            "backend": {
                                "service_name": path.backend.service.name if path.backend.service else None,
                                "service_port": path.backend.service.port.number if path.backend.service and path.backend.service.port else None
                            }
                        } for path in rule.http.paths]
                    rules.append(rule_info)

            tls = []
            if ing.spec.tls:
                for tls_entry in ing.spec.tls:
                    tls.append({
                        "hosts": tls_entry.hosts or [],
                        "secret_name": tls_entry.secret_name
                    })

            return {
                "name": ing.metadata.name,
                "namespace": namespace,
                "ingress_class_name": ing.spec.ingress_class_name,
                "rules": rules,
                "tls": tls,
                "age": age,
                "creation_timestamp": creation_timestamp,
                "labels": dict(ing.metadata.labels) if ing.metadata.labels else {},
                "annotations": dict(ing.metadata.annotations) if ing.metadata.annotations else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            }
        except Exception as e:
            logger.exception("获取Ingress详情失败: %s", e)
            return None


def delete_ingress(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除Ingress"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            networking_v1 = client.NetworkingV1Api(client_instance)
            networking_v1.delete_namespaced_ingress(name, namespace)
            return True
        except Exception as e:
            logger.exception("删除Ingress失败: %s", e)
            return False
