from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..kubernetes import get_cluster_stats
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter()

class DashboardStats(BaseModel):
    total_clusters: int
    active_clusters: int
    total_nodes: int
    total_namespaces: int
    total_pods: int
    running_pods: int
    total_services: int

@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取仪表板统计信息"""
    try:
        # 获取集群基本信息
        clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
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
                print(f"获取集群 {cluster.name} 统计信息失败: {e}")
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
