from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Cluster
from ..auth import require_read_only, require_admin, get_viewer_allowed_cluster_ids
from ..services.k8s import get_cluster_stats, _client_pool
from pydantic import BaseModel
from typing import Dict, Any
from ..core.logging import get_logger

router = APIRouter()

logger = get_logger(__name__)

class DashboardStats(BaseModel):
    total_clusters: int
    active_clusters: int
    total_nodes: int
    total_namespaces: int
    total_pods: int
    running_pods: int
    total_services: int

class ConnectionPoolStats(BaseModel):
    total_clusters: int
    total_connections: int
    connections_per_cluster: Dict[str, int]
    max_connections_per_cluster: int
    connection_timeout: int

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_read_only)
):
    """获取仪表板统计信息"""
    try:
        # 获取集群基本信息
        clusters_query = db.query(Cluster).filter(Cluster.is_active == True)
        if getattr(current_user, "role", None) == "viewer":
            allowed_ids = get_viewer_allowed_cluster_ids(db, current_user)
            if not allowed_ids:
                clusters = []
            else:
                clusters = clusters_query.filter(Cluster.id.in_(allowed_ids)).all()
        else:
            clusters = clusters_query.all()
        total_clusters = len(clusters)
        active_clusters = total_clusters

        # 初始化统计数据
        total_nodes = 0
        total_namespaces = 0
        total_pods = 0
        running_pods = 0
        total_services = 0

        # 遍历所有活跃集群获取统计信息
        for cluster in clusters:
            try:
                stats = get_cluster_stats(cluster)
                total_nodes += stats.get('nodes', 0)
                total_namespaces += stats.get('namespaces', 0)
                total_pods += stats.get('total_pods', 0)
                running_pods += stats.get('running_pods', 0)
                total_services += stats.get('services', 0)
            except Exception as e:
                # 如果某个集群连接失败，跳过但不影响其他集群
                logger.warning("获取集群统计信息失败: cluster=%s error=%s", cluster.name, e)
                continue

        return DashboardStats(
            total_clusters=total_clusters,
            active_clusters=active_clusters,
            total_nodes=total_nodes,
            total_namespaces=total_namespaces,
            total_pods=total_pods,
            running_pods=running_pods,
            total_services=total_services
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.get("/connection-pool", response_model=ConnectionPoolStats)
def get_connection_pool_stats(
    current_user=Depends(require_admin)
):
    """获取Kubernetes连接池统计信息"""
    try:
        pool_stats = _client_pool.get_pool_stats()

        return ConnectionPoolStats(
            total_clusters=pool_stats['total_clusters'],
            total_connections=pool_stats['total_connections'],
            connections_per_cluster=pool_stats['connections_per_cluster'],
            max_connections_per_cluster=_client_pool.max_connections_per_cluster,
            connection_timeout=_client_pool.connection_timeout
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取连接池统计信息失败: {str(e)}")
