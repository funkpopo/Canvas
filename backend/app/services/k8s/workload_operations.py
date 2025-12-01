"""
Kubernetes工作负载操作模块
提供StatefulSet、DaemonSet、CronJob的操作功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import create_k8s_client
from .utils import calculate_age


logger = get_logger(__name__)


# ========== StatefulSet 操作 ==========

def get_namespace_statefulsets(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的StatefulSets"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        statefulsets = apps_v1.list_namespaced_stateful_set(namespace)

        sts_list = []
        for sts in statefulsets.items:
            age = calculate_age(sts.metadata.creation_timestamp)

            sts_list.append({
                "name": sts.metadata.name,
                "namespace": namespace,
                "replicas": sts.spec.replicas or 0,
                "ready_replicas": sts.status.ready_replicas or 0,
                "current_replicas": sts.status.current_replicas or 0,
                "updated_replicas": sts.status.updated_replicas or 0,
                "age": age,
                "labels": dict(sts.metadata.labels) if sts.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return sts_list
    except Exception as e:
        logger.exception("获取StatefulSets失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_statefulset_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取StatefulSet详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        sts = apps_v1.read_namespaced_stateful_set(name, namespace)

        age = calculate_age(sts.metadata.creation_timestamp)
        creation_timestamp = str(sts.metadata.creation_timestamp) if sts.metadata.creation_timestamp else "Unknown"

        return {
            "name": sts.metadata.name,
            "namespace": namespace,
            "replicas": sts.spec.replicas or 0,
            "ready_replicas": sts.status.ready_replicas or 0,
            "current_replicas": sts.status.current_replicas or 0,
            "updated_replicas": sts.status.updated_replicas or 0,
            "service_name": sts.spec.service_name,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(sts.metadata.labels) if sts.metadata.labels else {},
            "annotations": dict(sts.metadata.annotations) if sts.metadata.annotations else {},
            "selector": dict(sts.spec.selector.match_labels) if sts.spec.selector.match_labels else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }
    except Exception as e:
        logger.exception("获取StatefulSet详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def scale_statefulset(cluster: Cluster, namespace: str, name: str, replicas: int) -> bool:
    """扩缩容StatefulSet"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        scale = client.V1Scale(spec=client.V1ScaleSpec(replicas=replicas))
        apps_v1.patch_namespaced_stateful_set_scale(name, namespace, scale)
        return True
    except Exception as e:
        logger.exception("扩缩容StatefulSet失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_statefulset(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除StatefulSet"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        apps_v1.delete_namespaced_stateful_set(name, namespace)
        return True
    except Exception as e:
        logger.exception("删除StatefulSet失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== DaemonSet 操作 ==========

def get_namespace_daemonsets(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的DaemonSets"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        daemonsets = apps_v1.list_namespaced_daemon_set(namespace)

        ds_list = []
        for ds in daemonsets.items:
            age = calculate_age(ds.metadata.creation_timestamp)

            ds_list.append({
                "name": ds.metadata.name,
                "namespace": namespace,
                "desired": ds.status.desired_number_scheduled or 0,
                "current": ds.status.current_number_scheduled or 0,
                "ready": ds.status.number_ready or 0,
                "updated": ds.status.updated_number_scheduled or 0,
                "available": ds.status.number_available or 0,
                "age": age,
                "labels": dict(ds.metadata.labels) if ds.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return ds_list
    except Exception as e:
        logger.exception("获取DaemonSets失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_daemonset_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取DaemonSet详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        ds = apps_v1.read_namespaced_daemon_set(name, namespace)

        age = calculate_age(ds.metadata.creation_timestamp)
        creation_timestamp = str(ds.metadata.creation_timestamp) if ds.metadata.creation_timestamp else "Unknown"

        return {
            "name": ds.metadata.name,
            "namespace": namespace,
            "desired": ds.status.desired_number_scheduled or 0,
            "current": ds.status.current_number_scheduled or 0,
            "ready": ds.status.number_ready or 0,
            "updated": ds.status.updated_number_scheduled or 0,
            "available": ds.status.number_available or 0,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(ds.metadata.labels) if ds.metadata.labels else {},
            "annotations": dict(ds.metadata.annotations) if ds.metadata.annotations else {},
            "selector": dict(ds.spec.selector.match_labels) if ds.spec.selector.match_labels else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }
    except Exception as e:
        logger.exception("获取DaemonSet详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def delete_daemonset(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除DaemonSet"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        apps_v1.delete_namespaced_daemon_set(name, namespace)
        return True
    except Exception as e:
        logger.exception("删除DaemonSet失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== CronJob 操作 ==========

def get_namespace_cronjobs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的CronJobs"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        cronjobs = batch_v1.list_namespaced_cron_job(namespace)

        cj_list = []
        for cj in cronjobs.items:
            age = calculate_age(cj.metadata.creation_timestamp)

            last_schedule_time = None
            if cj.status and cj.status.last_schedule_time:
                last_schedule_time = str(cj.status.last_schedule_time)

            cj_list.append({
                "name": cj.metadata.name,
                "namespace": namespace,
                "schedule": cj.spec.schedule,
                "suspend": cj.spec.suspend or False,
                "active": len(cj.status.active) if cj.status and cj.status.active else 0,
                "last_schedule_time": last_schedule_time,
                "age": age,
                "labels": dict(cj.metadata.labels) if cj.metadata.labels else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name
            })

        return cj_list
    except Exception as e:
        logger.exception("获取CronJobs失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_cronjob_details(cluster: Cluster, namespace: str, name: str) -> Optional[Dict[str, Any]]:
    """获取CronJob详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        cj = batch_v1.read_namespaced_cron_job(name, namespace)

        age = calculate_age(cj.metadata.creation_timestamp)
        creation_timestamp = str(cj.metadata.creation_timestamp) if cj.metadata.creation_timestamp else "Unknown"

        last_schedule_time = None
        if cj.status and cj.status.last_schedule_time:
            last_schedule_time = str(cj.status.last_schedule_time)

        active_jobs = []
        if cj.status and cj.status.active:
            for job_ref in cj.status.active:
                active_jobs.append(job_ref.name)

        return {
            "name": cj.metadata.name,
            "namespace": namespace,
            "schedule": cj.spec.schedule,
            "suspend": cj.spec.suspend or False,
            "concurrency_policy": cj.spec.concurrency_policy or "Allow",
            "starting_deadline_seconds": cj.spec.starting_deadline_seconds,
            "successful_jobs_history_limit": cj.spec.successful_jobs_history_limit or 3,
            "failed_jobs_history_limit": cj.spec.failed_jobs_history_limit or 1,
            "active_jobs": active_jobs,
            "last_schedule_time": last_schedule_time,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(cj.metadata.labels) if cj.metadata.labels else {},
            "annotations": dict(cj.metadata.annotations) if cj.metadata.annotations else {},
            "cluster_id": cluster.id,
            "cluster_name": cluster.name
        }
    except Exception as e:
        logger.exception("获取CronJob详情失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def delete_cronjob(cluster: Cluster, namespace: str, name: str) -> bool:
    """删除CronJob"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        batch_v1 = client.BatchV1Api(client_instance)
        batch_v1.delete_namespaced_cron_job(name, namespace)
        return True
    except Exception as e:
        logger.exception("删除CronJob失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()
