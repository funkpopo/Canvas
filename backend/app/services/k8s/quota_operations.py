"""
Kubernetes配额操作模块
提供ResourceQuota和LimitRange的操作功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import create_k8s_client
from .utils import calculate_age


logger = get_logger(__name__)


# ========== ResourceQuota 操作 ==========

def get_namespace_resource_quotas(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的资源配额"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        quotas = core_v1.list_namespaced_resource_quota(namespace)

        quota_list = []
        for quota in quotas.items:
            age = calculate_age(quota.metadata.creation_timestamp)

            # 获取硬限制
            hard = {}
            if quota.status and quota.status.hard:
                hard = dict(quota.status.hard)

            # 获取已使用量
            used = {}
            if quota.status and quota.status.used:
                used = dict(quota.status.used)

            quota_list.append({
                "name": quota.metadata.name,
                "namespace": namespace,
                "hard": hard,
                "used": used,
                "age": age,
                "labels": dict(quota.metadata.labels) if quota.metadata.labels else {}
            })

        return quota_list

    except Exception as e:
        logger.exception("获取资源配额失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_resource_quota_details(cluster: Cluster, namespace: str, quota_name: str) -> Optional[Dict[str, Any]]:
    """获取资源配额详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        quota = core_v1.read_namespaced_resource_quota(quota_name, namespace)

        age = calculate_age(quota.metadata.creation_timestamp)
        creation_timestamp = str(quota.metadata.creation_timestamp) if quota.metadata.creation_timestamp else "Unknown"

        # 获取硬限制
        hard = {}
        if quota.status and quota.status.hard:
            hard = dict(quota.status.hard)

        # 获取已使用量
        used = {}
        if quota.status and quota.status.used:
            used = dict(quota.status.used)

        return {
            "name": quota.metadata.name,
            "namespace": namespace,
            "hard": hard,
            "used": used,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(quota.metadata.labels) if quota.metadata.labels else {},
            "annotations": dict(quota.metadata.annotations) if quota.metadata.annotations else {},
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        logger.exception("获取资源配额详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_resource_quota(cluster: Cluster, namespace: str, quota_data: Dict[str, Any]) -> bool:
    """创建资源配额"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        quota = client.V1ResourceQuota(
            metadata=client.V1ObjectMeta(
                name=quota_data["name"],
                namespace=namespace,
                labels=quota_data.get("labels", {})
            ),
            spec=client.V1ResourceQuotaSpec(
                hard=quota_data.get("hard", {})
            )
        )

        core_v1.create_namespaced_resource_quota(namespace, quota)
        return True

    except Exception as e:
        logger.exception("创建资源配额失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_resource_quota(cluster: Cluster, namespace: str, quota_name: str, quota_data: Dict[str, Any]) -> bool:
    """更新资源配额"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取现有配额
        existing_quota = core_v1.read_namespaced_resource_quota(quota_name, namespace)

        # 更新字段
        if "hard" in quota_data:
            existing_quota.spec.hard = quota_data["hard"]

        if "labels" in quota_data:
            existing_quota.metadata.labels = quota_data["labels"]

        core_v1.replace_namespaced_resource_quota(quota_name, namespace, existing_quota)
        return True

    except Exception as e:
        logger.exception("更新资源配额失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_resource_quota(cluster: Cluster, namespace: str, quota_name: str) -> bool:
    """删除资源配额"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_resource_quota(quota_name, namespace)
        return True

    except Exception as e:
        logger.exception("删除资源配额失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== LimitRange 操作 ==========

def get_namespace_limit_ranges(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的LimitRanges"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        limit_ranges = core_v1.list_namespaced_limit_range(namespace)

        lr_list = []
        for lr in limit_ranges.items:
            age = calculate_age(lr.metadata.creation_timestamp)

            limits = []
            if lr.spec.limits:
                for limit in lr.spec.limits:
                    limits.append({
                        "type": limit.type,
                        "max": dict(limit.max) if limit.max else {},
                        "min": dict(limit.min) if limit.min else {},
                        "default": dict(limit.default) if limit.default else {},
                        "default_request": dict(limit.default_request) if limit.default_request else {}
                    })

            lr_list.append({
                "name": lr.metadata.name,
                "namespace": namespace,
                "limits": limits,
                "age": age,
                "labels": dict(lr.metadata.labels) if lr.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return lr_list
    except Exception as e:
        logger.exception("获取LimitRanges失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_limit_range_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取LimitRange详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        lr = core_v1.read_namespaced_limit_range(name, namespace)

        age = calculate_age(lr.metadata.creation_timestamp)
        creation_timestamp = str(lr.metadata.creation_timestamp) if lr.metadata.creation_timestamp else "Unknown"

        limits = []
        if lr.spec.limits:
            for limit in lr.spec.limits:
                limits.append({
                    "type": limit.type,
                    "max": dict(limit.max) if limit.max else {},
                    "min": dict(limit.min) if limit.min else {},
                    "default": dict(limit.default) if limit.default else {},
                    "default_request": dict(limit.default_request) if limit.default_request else {}
                })

        return {
            "name": lr.metadata.name,
            "namespace": namespace,
            "limits": limits,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(lr.metadata.labels) if lr.metadata.labels else {},
            "annotations": dict(lr.metadata.annotations) if lr.metadata.annotations else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }
    except Exception as e:
        logger.exception("获取LimitRange详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def delete_limit_range(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除LimitRange"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_limit_range(name, namespace)
        return True
    except Exception as e:
        logger.exception("删除LimitRange失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()
