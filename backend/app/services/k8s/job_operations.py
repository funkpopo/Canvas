"""
Kubernetes Job操作模块
提供Job的增删查改功能
"""

import time
import yaml
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


def get_namespace_jobs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的所有Jobs"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            batch_v1 = client.BatchV1Api(client_instance)
            job_list = batch_v1.list_namespaced_job(namespace)

            jobs = []
            for job in job_list.items:
                # 计算Job年龄
                age = calculate_age(job.metadata.creation_timestamp)

                # 获取Job状态
                status = "Unknown"
                if job.status and job.status.conditions:
                    latest_condition = max(
                        job.status.conditions,
                        key=lambda c: c.last_transition_time or c.last_probe_time or "",
                    )
                    status = latest_condition.type

                # 计算完成度
                completions = job.spec.completions or 1
                succeeded = job.status.succeeded or 0
                failed = job.status.failed or 0

                jobs.append(
                    {
                        "name": job.metadata.name,
                        "namespace": namespace,
                        "completions": completions,
                        "succeeded": succeeded,
                        "failed": failed,
                        "active": job.status.active or 0,
                        "age": age,
                        "status": status,
                        "labels": dict(job.metadata.labels) if job.metadata.labels else {},
                        "cluster_id": cluster.id,
                        "cluster_name": cluster.name,
                    }
                )

            return jobs

        except Exception as e:
            logger.exception("获取命名空间Jobs失败: %s", e)
            return []


def get_job_details(cluster: Cluster, namespace: str, job_name: str) -> Optional[Dict[str, Any]]:
    """获取Job的详细信息"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            batch_v1 = client.BatchV1Api(client_instance)
            job = batch_v1.read_namespaced_job(job_name, namespace)

            # 计算Job年龄
            age = calculate_age(job.metadata.creation_timestamp)
            creation_timestamp = (
                str(job.metadata.creation_timestamp) if job.metadata.creation_timestamp else "Unknown"
            )

            # 获取Job状态
            status = "Unknown"
            conditions = []
            if job.status and job.status.conditions:
                for condition in job.status.conditions:
                    conditions.append(
                        {
                            "type": condition.type,
                            "status": condition.status,
                            "last_transition_time": str(condition.last_transition_time)
                            if condition.last_transition_time
                            else None,
                            "reason": condition.reason,
                            "message": condition.message,
                        }
                    )

                # 最新的条件状态作为主要状态
                latest_condition = max(
                    job.status.conditions,
                    key=lambda c: c.last_transition_time or c.last_probe_time or "",
                )
                status = latest_condition.type

            return {
                "name": job.metadata.name,
                "namespace": namespace,
                "completions": job.spec.completions or 1,
                "parallelism": job.spec.parallelism or 1,
                "backoff_limit": job.spec.backoff_limit or 6,
                "succeeded": job.status.succeeded or 0,
                "failed": job.status.failed or 0,
                "active": job.status.active or 0,
                "age": age,
                "creation_timestamp": creation_timestamp,
                "status": status,
                "conditions": conditions,
                "labels": dict(job.metadata.labels) if job.metadata.labels else {},
                "annotations": dict(job.metadata.annotations) if job.metadata.annotations else {},
                "spec": job.spec.to_dict() if hasattr(job.spec, "to_dict") else {},
                "status_detail": job.status.to_dict() if hasattr(job.status, "to_dict") else {},
                "cluster_id": cluster.id,
                "cluster_name": cluster.name,
            }

        except Exception as e:
            logger.exception("获取Job详情失败: %s", e)
            return None


def create_job(cluster: Cluster, namespace: str, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """创建Job"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            batch_v1 = client.BatchV1Api(client_instance)

            # 解析YAML或JSON数据
            if "yaml_content" in job_data:
                job_dict = yaml.safe_load(job_data["yaml_content"])
            else:
                job_dict = job_data

            # 创建Job对象
            job = client.V1Job(
                api_version="batch/v1",
                kind="Job",
                metadata=client.V1ObjectMeta(
                    name=job_dict["metadata"]["name"],
                    namespace=namespace,
                    labels=job_dict["metadata"].get("labels", {}),
                    annotations=job_dict["metadata"].get("annotations", {}),
                ),
                spec=client.V1JobSpec(**job_dict["spec"]),
            )

            # 创建Job
            result = batch_v1.create_namespaced_job(namespace, job)

            return {
                "success": True,
                "message": f"Job '{result.metadata.name}' 创建成功",
                "job_name": result.metadata.name,
            }

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            return {"success": False, "message": f"创建Job失败: {str(e)}"}


def delete_job(cluster: Cluster, namespace: str, job_name: str) -> Dict[str, Any]:
    """删除Job"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            batch_v1 = client.BatchV1Api(client_instance)

            # 删除Job
            delete_options = client.V1DeleteOptions(
                propagation_policy="Foreground",
                grace_period_seconds=30,
            )

            batch_v1.delete_namespaced_job(job_name, namespace, body=delete_options)

            return {
                "success": True,
                "message": f"Job '{job_name}' 删除成功",
            }

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            return {"success": False, "message": f"删除Job失败: {str(e)}"}


def restart_job(cluster: Cluster, namespace: str, job_name: str) -> Dict[str, Any]:
    """重启Job（删除旧Job，创建新Job）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            batch_v1 = client.BatchV1Api(client_instance)

            # 获取现有Job的配置
            job = batch_v1.read_namespaced_job(job_name, namespace)

            # 生成新的Job名称（添加时间戳后缀）
            new_job_name = f"{job.metadata.name}-{int(time.time())}"

            # 创建新的Job配置
            new_job = client.V1Job(
                api_version="batch/v1",
                kind="Job",
                metadata=client.V1ObjectMeta(
                    name=new_job_name,
                    namespace=namespace,
                    labels=dict(job.metadata.labels) if job.metadata.labels else {},
                    annotations=dict(job.metadata.annotations) if job.metadata.annotations else {},
                ),
                spec=job.spec,
            )

            # 创建新Job
            batch_v1.create_namespaced_job(namespace, new_job)

            return {
                "success": True,
                "message": f"Job '{job_name}' 重启成功，新Job名称: '{new_job_name}'",
                "new_job_name": new_job_name,
            }

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            return {"success": False, "message": f"重启Job失败: {str(e)}"}


def get_job_pods(cluster: Cluster, namespace: str, job_name: str) -> List[Dict[str, Any]]:
    """获取Job关联的Pods"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)

        # 获取所有Pod
        pod_list = core_v1.list_namespaced_pod(namespace)

        job_pods = []
        for pod in pod_list.items:
            # 检查Pod是否属于指定的Job
            if pod.metadata.owner_references:
                for owner_ref in pod.metadata.owner_references:
                    if owner_ref.kind == "Job" and owner_ref.name == job_name:
                        # 计算Pod年龄
                        age = calculate_age(pod.metadata.creation_timestamp)

                        # 获取Pod状态
                        status = "Unknown"
                        if pod.status:
                            status = pod.status.phase or "Unknown"

                        # 获取容器重启次数
                        restarts = 0
                        ready_containers = "0/0"
                        if pod.status and pod.status.container_statuses:
                            for container_status in pod.status.container_statuses:
                                restarts += container_status.restart_count or 0
                            ready_containers = f"{sum(1 for cs in pod.status.container_statuses if cs.ready)}/{len(pod.status.container_statuses)}"

                        job_pods.append({
                            "name": pod.metadata.name,
                            "namespace": namespace,
                            "status": status,
                            "node_name": pod.spec.node_name if pod.spec else None,
                            "age": age,
                            "restarts": restarts,
                            "ready_containers": ready_containers,
                            "labels": dict(pod.metadata.labels) if pod.metadata.labels else {}
                        })
                        break

            return job_pods

        except Exception as e:
            logger.exception("获取Job Pods失败: %s", e)
            return []


def get_job_yaml(cluster: Cluster, namespace: str, job_name: str) -> Optional[str]:
    """获取Job的YAML配置"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            batch_v1 = client.BatchV1Api(client_instance)
            job = batch_v1.read_namespaced_job(job_name, namespace)

            job_dict = job.to_dict()
            return yaml.dump(job_dict, default_flow_style=False)

        except Exception as e:
            logger.exception("获取Job YAML失败: %s", e)
            return None


def update_job_yaml(cluster: Cluster, namespace: str, job_name: str, yaml_content: str) -> Dict[str, Any]:
    """更新Job的YAML配置"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            batch_v1 = client.BatchV1Api(client_instance)

            # 解析YAML
            job_dict = yaml.safe_load(yaml_content)

            # 创建Job对象
            job = client.V1Job(
                api_version="batch/v1",
                kind="Job",
                metadata=client.V1ObjectMeta(
                    name=job_dict["metadata"]["name"],
                    namespace=namespace,
                    labels=job_dict["metadata"].get("labels", {}),
                    annotations=job_dict["metadata"].get("annotations", {}),
                ),
                spec=client.V1JobSpec(**job_dict["spec"]),
            )

            # 更新Job
            batch_v1.replace_namespaced_job(job_name, namespace, job)

            return {
                "success": True,
                "message": f"Job '{job_name}' 更新成功",
            }

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            return {"success": False, "message": f"更新Job失败: {str(e)}"}


def monitor_job_status_changes(cluster: Cluster, namespace: str, job_name: str, history_id: int, db_session) -> Dict[str, Any]:
    """监控Job状态变化并更新历史记录"""
    from ...models import JobHistory

    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            batch_v1 = client.BatchV1Api(client_instance)
            job = batch_v1.read_namespaced_job(job_name, namespace)

            # 获取当前状态
            current_status = "Unknown"
            succeeded_pods = 0
            failed_pods = 0
            total_pods = 0

            if job.status:
                # 确定主要状态
                if job.status.conditions:
                    latest_condition = max(
                        job.status.conditions,
                        key=lambda c: c.last_transition_time or c.last_probe_time or "",
                    )
                    current_status = latest_condition.type

                succeeded_pods = job.status.succeeded or 0
                failed_pods = job.status.failed or 0
                active_pods = job.status.active or 0
                total_pods = succeeded_pods + failed_pods + active_pods

            # 获取历史记录
            history_record = db_session.query(JobHistory).filter(JobHistory.id == history_id).first()
            if not history_record:
                return {"success": False, "message": "历史记录不存在"}

            # 检查状态是否发生变化
            status_changed = history_record.status != current_status
            pod_count_changed = (
                history_record.succeeded_pods != succeeded_pods
                or history_record.failed_pods != failed_pods
                or history_record.total_pods != total_pods
            )

            if status_changed or pod_count_changed:
                now = datetime.now(timezone.utc)

                # 更新状态
                history_record.status = current_status
                history_record.succeeded_pods = succeeded_pods
                history_record.failed_pods = failed_pods
                history_record.total_pods = total_pods

                # 设置开始时间
                if current_status == "Running" and not history_record.start_time:
                    history_record.start_time = now

                # 设置结束时间和持续时间
                elif current_status in ["Succeeded", "Failed"] and not history_record.end_time:
                    history_record.end_time = now
                    if history_record.start_time:
                        history_record.duration = int(
                            (history_record.end_time - history_record.start_time).total_seconds()
                        )

                history_record.updated_at = now
                db_session.commit()

                return {
                    "success": True,
                    "message": "状态已更新",
                    "status_changed": status_changed,
                    "pod_count_changed": pod_count_changed,
                    "current_status": current_status,
                    "succeeded_pods": succeeded_pods,
                    "failed_pods": failed_pods,
                    "total_pods": total_pods,
                }

            return {
                "success": True,
                "message": "状态无变化",
                "status_changed": False,
                "pod_count_changed": False,
            }

        except ApiException as e:
            error_message = f"API错误: {e.body}"
            history_record = db_session.query(JobHistory).filter(JobHistory.id == history_id).first()
            if history_record:
                history_record.error_message = error_message
                history_record.status = "Failed"
                now = datetime.now(timezone.utc)
                if not history_record.end_time:
                    history_record.end_time = now
                    if history_record.start_time:
                        history_record.duration = int(
                            (history_record.end_time - history_record.start_time).total_seconds()
                        )
                history_record.updated_at = now
                db_session.commit()

            return {"success": False, "message": error_message}

        except Exception as e:
            error_message = f"监控Job状态失败: {str(e)}"
            history_record = db_session.query(JobHistory).filter(JobHistory.id == history_id).first()
            if history_record:
                history_record.error_message = error_message
                history_record.status = "Failed"
                now = datetime.now(timezone.utc)
                if not history_record.end_time:
                    history_record.end_time = now
                    if history_record.start_time:
                        history_record.duration = int(
                            (history_record.end_time - history_record.start_time).total_seconds()
                        )
                history_record.updated_at = now
                db_session.commit()

            return {"success": False, "message": error_message}
