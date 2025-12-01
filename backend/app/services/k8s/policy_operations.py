"""
Kubernetes策略操作模块
提供HorizontalPodAutoscaler和PodDisruptionBudget的操作功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import create_k8s_client
from .utils import calculate_age


logger = get_logger(__name__)


# ========== HorizontalPodAutoscaler 操作 ==========

def get_namespace_hpas(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的HPAs"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        autoscaling_v2 = client.AutoscalingV2Api(client_instance)
        hpas = autoscaling_v2.list_namespaced_horizontal_pod_autoscaler(namespace)

        hpa_list = []
        for hpa in hpas.items:
            age = calculate_age(hpa.metadata.creation_timestamp)

            hpa_list.append({
                "name": hpa.metadata.name,
                "namespace": namespace,
                "target_ref": f"{hpa.spec.scale_target_ref.kind}/{hpa.spec.scale_target_ref.name}",
                "min_replicas": hpa.spec.min_replicas or 1,
                "max_replicas": hpa.spec.max_replicas,
                "current_replicas": hpa.status.current_replicas or 0,
                "desired_replicas": hpa.status.desired_replicas or 0,
                "age": age,
                "labels": dict(hpa.metadata.labels) if hpa.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return hpa_list
    except Exception as e:
        logger.exception("获取HPAs失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_hpa_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取HPA详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        autoscaling_v2 = client.AutoscalingV2Api(client_instance)
        hpa = autoscaling_v2.read_namespaced_horizontal_pod_autoscaler(name, namespace)

        age = calculate_age(hpa.metadata.creation_timestamp)
        creation_timestamp = str(hpa.metadata.creation_timestamp) if hpa.metadata.creation_timestamp else "Unknown"

        metrics = []
        if hpa.spec.metrics:
            for metric in hpa.spec.metrics:
                metrics.append({
                    "type": metric.type,
                    "resource": metric.resource.name if metric.resource else None
                })

        return {
            "name": hpa.metadata.name,
            "namespace": namespace,
            "target_ref": {
                "kind": hpa.spec.scale_target_ref.kind,
                "name": hpa.spec.scale_target_ref.name
            },
            "min_replicas": hpa.spec.min_replicas or 1,
            "max_replicas": hpa.spec.max_replicas,
            "current_replicas": hpa.status.current_replicas or 0,
            "desired_replicas": hpa.status.desired_replicas or 0,
            "metrics": metrics,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(hpa.metadata.labels) if hpa.metadata.labels else {},
            "annotations": dict(hpa.metadata.annotations) if hpa.metadata.annotations else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }
    except Exception as e:
        logger.exception("获取HPA详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def delete_hpa(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除HPA"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        autoscaling_v2 = client.AutoscalingV2Api(client_instance)
        autoscaling_v2.delete_namespaced_horizontal_pod_autoscaler(name, namespace)
        return True
    except Exception as e:
        logger.exception("删除HPA失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== PodDisruptionBudget 操作 ==========

def get_namespace_pdbs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的PodDisruptionBudgets"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        policy_v1 = client.PolicyV1Api(client_instance)
        pdbs = policy_v1.list_namespaced_pod_disruption_budget(namespace)

        pdb_list = []
        for pdb in pdbs.items:
            age = calculate_age(pdb.metadata.creation_timestamp)

            min_available = None
            max_unavailable = None
            if pdb.spec.min_available:
                min_available = str(pdb.spec.min_available)
            if pdb.spec.max_unavailable:
                max_unavailable = str(pdb.spec.max_unavailable)

            pdb_list.append({
                "name": pdb.metadata.name,
                "namespace": namespace,
                "min_available": min_available,
                "max_unavailable": max_unavailable,
                "current_healthy": pdb.status.current_healthy if pdb.status else 0,
                "desired_healthy": pdb.status.desired_healthy if pdb.status else 0,
                "disruptions_allowed": pdb.status.disruptions_allowed if pdb.status else 0,
                "age": age,
                "labels": dict(pdb.metadata.labels) if pdb.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return pdb_list
    except Exception as e:
        logger.exception("获取PodDisruptionBudgets失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_pdb_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取PodDisruptionBudget详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        policy_v1 = client.PolicyV1Api(client_instance)
        pdb = policy_v1.read_namespaced_pod_disruption_budget(name, namespace)

        age = calculate_age(pdb.metadata.creation_timestamp)
        creation_timestamp = str(pdb.metadata.creation_timestamp) if pdb.metadata.creation_timestamp else "Unknown"

        min_available = None
        max_unavailable = None
        if pdb.spec.min_available:
            min_available = str(pdb.spec.min_available)
        if pdb.spec.max_unavailable:
            max_unavailable = str(pdb.spec.max_unavailable)

        return {
            "name": pdb.metadata.name,
            "namespace": namespace,
            "min_available": min_available,
            "max_unavailable": max_unavailable,
            "selector": dict(pdb.spec.selector.match_labels) if pdb.spec.selector and pdb.spec.selector.match_labels else {},
            "current_healthy": pdb.status.current_healthy if pdb.status else 0,
            "desired_healthy": pdb.status.desired_healthy if pdb.status else 0,
            "disruptions_allowed": pdb.status.disruptions_allowed if pdb.status else 0,
            "expected_pods": pdb.status.expected_pods if pdb.status else 0,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(pdb.metadata.labels) if pdb.metadata.labels else {},
            "annotations": dict(pdb.metadata.annotations) if pdb.metadata.annotations else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }
    except Exception as e:
        logger.exception("获取PodDisruptionBudget详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def delete_pdb(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除PodDisruptionBudget"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        policy_v1 = client.PolicyV1Api(client_instance)
        policy_v1.delete_namespaced_pod_disruption_budget(name, namespace)
        return True
    except Exception as e:
        logger.exception("删除PodDisruptionBudget失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()
