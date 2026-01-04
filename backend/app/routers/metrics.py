from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Cluster
from ..auth import require_cluster_access, require_cluster_management
from ..services.k8s import (
    get_cluster_metrics,
    get_node_metrics,
    get_pod_metrics,
    get_namespace_metrics,
    install_metrics_server
)
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from ..core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


class MetricsServerInstallRequest(BaseModel):
    image: Optional[str] = "registry.k8s.io/metrics-server/metrics-server:v0.7.0"
    insecure_tls: bool = False


class ClusterMetrics(BaseModel):
    cluster_id: int
    cluster_name: str
    cpu_usage: str
    memory_usage: str
    pod_count: int
    node_count: int
    timestamp: str


class NodeMetrics(BaseModel):
    name: str
    cpu_usage: str
    memory_usage: str
    cpu_percentage: float
    memory_percentage: float
    timestamp: str


class PodMetrics(BaseModel):
    name: str
    namespace: str
    cpu_usage: str
    memory_usage: str
    timestamp: str


class NamespaceMetrics(BaseModel):
    namespace: str
    cpu_usage: str
    memory_usage: str
    pod_count: int
    timestamp: str


@router.get("/clusters/{cluster_id}/metrics")
async def get_cluster_metrics_endpoint(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_access("read"))
):
    """获取集群整体资源使用指标"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        metrics = get_cluster_metrics(cluster)
        if not metrics:
            raise HTTPException(status_code=503, detail="无法获取集群指标，请确保metrics-server已部署")

        return metrics

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("获取集群指标失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取集群指标失败: {str(e)}")


@router.get("/clusters/{cluster_id}/nodes/metrics")
async def get_nodes_metrics_endpoint(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_access("read"))
):
    """获取集群所有节点的资源使用指标"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        metrics = get_node_metrics(cluster)
        if metrics is None:
            raise HTTPException(status_code=503, detail="无法获取节点指标，请确保metrics-server已部署")

        return metrics

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("获取节点指标失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取节点指标失败: {str(e)}")


@router.get("/clusters/{cluster_id}/pods/metrics")
async def get_pods_metrics_endpoint(
    cluster_id: int,
    namespace: Optional[str] = Query(None, description="命名空间过滤"),
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_access("read"))
):
    """获取Pod资源使用指标"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        metrics = get_pod_metrics(cluster, namespace)
        if metrics is None:
            raise HTTPException(status_code=503, detail="无法获取Pod指标，请确保metrics-server已部署")

        return metrics

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("获取Pod指标失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取Pod指标失败: {str(e)}")


@router.get("/clusters/{cluster_id}/namespaces/metrics")
async def get_namespaces_metrics_endpoint(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_access("read"))
):
    """获取命名空间级别的资源使用汇总"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        metrics = get_namespace_metrics(cluster)
        if metrics is None:
            raise HTTPException(status_code=503, detail="无法获取命名空间指标，请确保metrics-server已部署")

        return metrics

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("获取命名空间指标失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取命名空间指标失败: {str(e)}")


@router.get("/clusters/{cluster_id}/metrics/health")
async def check_metrics_server_health(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_access("read"))
):
    """检查metrics-server是否可用"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        # 尝试获取简单的集群指标来检测metrics-server是否可用
        from ..services.k8s import check_metrics_server_available
        available = check_metrics_server_available(cluster)

        return {
            "available": available,
            "cluster_id": cluster_id,
            "cluster_name": cluster.name
        }

    except Exception as e:
        logger.exception("检查metrics-server状态失败: %s", e)
        return {
            "available": False,
            "cluster_id": cluster_id,
            "error": str(e)
        }


@router.post("/clusters/{cluster_id}/metrics-server/install")
async def install_metrics_server_endpoint(
    cluster_id: int,
    request: MetricsServerInstallRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_management)
):
    """安装metrics-server到指定集群"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        success = install_metrics_server(cluster, request.image, request.insecure_tls)

        if success:
            return {
                "success": True,
                "message": "metrics-server安装成功",
                "cluster_id": cluster_id,
                "cluster_name": cluster.name
            }
        else:
            raise HTTPException(status_code=500, detail="metrics-server安装失败")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("安装metrics-server失败: %s", e)
        raise HTTPException(status_code=500, detail=f"安装metrics-server失败: {str(e)}")
