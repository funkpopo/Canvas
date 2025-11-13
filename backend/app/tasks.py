"""
Celery异步任务定义
处理耗时的Kubernetes操作
"""
from .celery_app import celery_app
from .database import SessionLocal
from .models import Cluster
from .k8s_client import (
    get_pods_info,
    get_namespace_deployments,
    get_cluster_stats,
    get_cluster_metrics,
)
from .core.logging import get_logger

logger = get_logger(__name__)


@celery_app.task(name="tasks.fetch_cluster_resources")
def fetch_cluster_resources(cluster_id: int):
    """
    异步获取集群资源信息

    Args:
        cluster_id: 集群ID

    Returns:
        dict: 包含集群资源信息的字典
    """
    db = SessionLocal()
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            return {"error": "集群不存在"}

        # 获取集群统计信息
        stats = get_cluster_stats(cluster)

        # 获取集群监控指标
        metrics = get_cluster_metrics(cluster)

        return {
            "cluster_id": cluster_id,
            "stats": stats,
            "metrics": metrics,
            "status": "success"
        }
    except Exception as e:
        logger.exception("异步获取集群资源失败: cluster_id=%s error=%s", cluster_id, e)
        return {"error": str(e), "status": "failed"}
    finally:
        db.close()


@celery_app.task(name="tasks.fetch_namespace_resources")
def fetch_namespace_resources(cluster_id: int, namespace: str):
    """
    异步获取命名空间资源信息

    Args:
        cluster_id: 集群ID
        namespace: 命名空间

    Returns:
        dict: 包含命名空间资源信息的字典
    """
    db = SessionLocal()
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            return {"error": "集群不存在"}

        # 获取Pods
        pods = get_pods_info(cluster, namespace)

        # 获取Deployments
        deployments = get_namespace_deployments(cluster, namespace)

        return {
            "cluster_id": cluster_id,
            "namespace": namespace,
            "pods": pods,
            "deployments": deployments,
            "status": "success"
        }
    except Exception as e:
        logger.exception("异步获取命名空间资源失败: cluster_id=%s namespace=%s error=%s",
                        cluster_id, namespace, e)
        return {"error": str(e), "status": "failed"}
    finally:
        db.close()


@celery_app.task(name="tasks.batch_scale_deployments")
def batch_scale_deployments(cluster_id: int, deployments: list):
    """
    异步批量扩缩容Deployment

    Args:
        cluster_id: 集群ID
        deployments: 部署列表 [{"namespace": str, "name": str, "replicas": int}]

    Returns:
        dict: 操作结果
    """
    from .k8s_client import scale_deployment

    db = SessionLocal()
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            return {"error": "集群不存在"}

        results = []
        for deploy in deployments:
            try:
                success = scale_deployment(
                    cluster,
                    deploy["namespace"],
                    deploy["name"],
                    deploy["replicas"]
                )
                results.append({
                    "namespace": deploy["namespace"],
                    "name": deploy["name"],
                    "success": success
                })
            except Exception as e:
                logger.warning("扩缩容失败: %s/%s error=%s",
                             deploy["namespace"], deploy["name"], e)
                results.append({
                    "namespace": deploy["namespace"],
                    "name": deploy["name"],
                    "success": False,
                    "error": str(e)
                })

        return {
            "cluster_id": cluster_id,
            "results": results,
            "status": "success"
        }
    except Exception as e:
        logger.exception("批量扩缩容失败: cluster_id=%s error=%s", cluster_id, e)
        return {"error": str(e), "status": "failed"}
    finally:
        db.close()


@celery_app.task(name="tasks.refresh_all_cluster_caches")
def refresh_all_cluster_caches():
    """
    定时刷新所有集群的缓存数据
    """
    from .cache import cache_k8s_resource

    db = SessionLocal()
    try:
        clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        for cluster in clusters:
            try:
                # 刷新集群统计信息
                stats = get_cluster_stats(cluster)
                if stats:
                    cache_k8s_resource("stats", cluster.id, "all", stats)

                # 刷新集群监控指标
                metrics = get_cluster_metrics(cluster)
                if metrics:
                    cache_k8s_resource("metrics", cluster.id, "all", metrics)

                logger.info("已刷新集群缓存: cluster_id=%s", cluster.id)
            except Exception as e:
                logger.warning("刷新集群缓存失败: cluster_id=%s error=%s", cluster.id, e)

        return {"status": "success", "clusters_refreshed": len(clusters)}
    except Exception as e:
        logger.exception("定时刷新缓存失败: %s", e)
        return {"error": str(e), "status": "failed"}
    finally:
        db.close()
