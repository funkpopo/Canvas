from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..kubernetes import get_nodes_info, get_node_details
from pydantic import BaseModel

router = APIRouter()

class NodeInfo(BaseModel):
    name: str
    status: str
    roles: List[str]
    age: str
    version: str
    internal_ip: Optional[str]
    external_ip: Optional[str]
    cpu_capacity: str
    memory_capacity: str
    pods_capacity: str
    cpu_usage: Optional[str] = None
    memory_usage: Optional[str] = None
    pods_usage: Optional[str] = None

class NodeDetails(BaseModel):
    name: str
    status: str
    roles: List[str]
    age: str
    version: str
    internal_ip: Optional[str]
    external_ip: Optional[str]
    cpu_capacity: str
    memory_capacity: str
    pods_capacity: str
    cpu_usage: Optional[str] = None
    memory_usage: Optional[str] = None
    pods_usage: Optional[str] = None
    labels: dict
    annotations: dict
    conditions: List[dict]
    taints: List[dict]

@router.get("/", response_model=List[NodeInfo])
@router.get("", response_model=List[NodeInfo])
async def get_nodes(
    cluster_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取节点列表"""
    try:
        if cluster_id:
            # 获取指定集群的节点
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            # 获取所有活跃集群的节点
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_nodes = []
        for cluster in clusters:
            try:
                nodes = get_nodes_info(cluster)
                # 添加集群标识
                for node in nodes:
                    node['cluster_id'] = cluster.id
                    node['cluster_name'] = cluster.name
                all_nodes.extend(nodes)
            except Exception as e:
                print(f"获取集群 {cluster.name} 节点信息失败: {e}")
                continue

        return all_nodes

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取节点信息失败: {str(e)}")

@router.get("/{node_name}", response_model=NodeDetails)
async def get_node_detail(
    node_name: str,
    cluster_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取节点详情"""
    try:
        if cluster_id:
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        for cluster in clusters:
            try:
                node_detail = get_node_details(cluster, node_name)
                if node_detail:
                    node_detail['cluster_id'] = cluster.id
                    node_detail['cluster_name'] = cluster.name
                    return node_detail
            except Exception as e:
                print(f"在集群 {cluster.name} 中查找节点 {node_name} 失败: {e}")
                continue

        raise HTTPException(status_code=404, detail=f"节点 {node_name} 未找到")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取节点详情失败: {str(e)}")
