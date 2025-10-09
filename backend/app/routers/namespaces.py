from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..kubernetes import get_namespaces_info, create_namespace, delete_namespace, get_namespace_resources
from pydantic import BaseModel

router = APIRouter()

class NamespaceInfo(BaseModel):
    name: str
    status: str
    age: str
    cluster_name: str
    labels: dict
    annotations: dict

class NamespaceCreate(BaseModel):
    name: str
    labels: Optional[dict] = None

class NamespaceResources(BaseModel):
    cpu_requests: str
    cpu_limits: str
    memory_requests: str
    memory_limits: str
    pods: int
    persistent_volume_claims: int
    config_maps: int
    secrets: int
    services: int

@router.get("/", response_model=List[NamespaceInfo])
async def get_namespaces(
    cluster_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取命名空间列表"""
    try:
        if cluster_id:
            # 获取指定集群的命名空间
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            # 获取所有活跃集群的命名空间
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_namespaces = []
        for cluster in clusters:
            try:
                namespaces = get_namespaces_info(cluster)
                # 添加集群标识
                for ns in namespaces:
                    ns['cluster_id'] = cluster.id
                    ns['cluster_name'] = cluster.name
                all_namespaces.extend(namespaces)
            except Exception as e:
                print(f"获取集群 {cluster.name} 命名空间信息失败: {e}")
                continue

        return all_namespaces

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取命名空间信息失败: {str(e)}")

@router.post("/", response_model=NamespaceInfo)
async def create_new_namespace(
    namespace: NamespaceCreate,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建新命名空间"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 检查命名空间是否已存在
        existing_namespaces = get_namespaces_info(cluster)
        if any(ns['name'] == namespace.name for ns in existing_namespaces):
            raise HTTPException(status_code=400, detail=f"命名空间 '{namespace.name}' 已存在")

        result = create_namespace(cluster, namespace.name, namespace.labels)
        if result:
            # 重新获取命名空间信息以返回完整数据
            namespaces = get_namespaces_info(cluster)
            for ns in namespaces:
                if ns['name'] == namespace.name:
                    ns['cluster_id'] = cluster.id
                    ns['cluster_name'] = cluster.name
                    return ns

        raise HTTPException(status_code=500, detail="创建命名空间失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建命名空间失败: {str(e)}")

@router.delete("/{namespace_name}")
async def remove_namespace(
    namespace_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除命名空间"""
    try:
        # 保护系统命名空间
        system_namespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
        if namespace_name in system_namespaces:
            raise HTTPException(status_code=400, detail="不能删除系统命名空间")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_namespace(cluster, namespace_name)
        if result:
            return {"message": f"命名空间 '{namespace_name}' 已删除"}
        else:
            raise HTTPException(status_code=500, detail="删除命名空间失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除命名空间失败: {str(e)}")

@router.get("/{namespace_name}/resources", response_model=NamespaceResources)
async def get_namespace_resource_usage(
    namespace_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取命名空间资源使用情况"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        resources = get_namespace_resources(cluster, namespace_name)
        if resources:
            return resources
        else:
            raise HTTPException(status_code=404, detail="命名空间不存在或无法获取资源信息")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取命名空间资源信息失败: {str(e)}")
