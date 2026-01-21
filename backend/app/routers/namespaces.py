from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_read_only, require_resource_management, check_cluster_access, get_viewer_allowed_cluster_ids
from ..services.k8s import get_namespaces_info, create_namespace, delete_namespace, get_namespace_resources, get_namespace_deployments, get_namespace_services, get_namespace_crds
from ..cache import cache_manager, K8S_RESOURCE_TTL, invalidate_cache
from pydantic import BaseModel

router = APIRouter()

class NamespaceInfo(BaseModel):
    name: str
    status: str
    age: str
    cluster_name: str
    labels: dict
    annotations: dict
    cluster_id: int

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
@router.get("", response_model=List[NamespaceInfo])
def get_namespaces(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    db: Session = Depends(get_db),
    current_user=Depends(require_read_only)
):
    """获取命名空间列表"""
    try:
        if getattr(current_user, "role", None) == "viewer":
            cache_key = f"k8s:namespaces:viewer:{current_user.id}:cluster:{cluster_id or 'all'}"
        else:
            cache_key = f"k8s:namespaces:cluster:{cluster_id}" if cluster_id else "k8s:namespaces:all_active"
        cached = cache_manager.get(cache_key)
        if cached is not None:
            return cached

        if cluster_id:
            if getattr(current_user, "role", None) == "viewer":
                if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                    raise HTTPException(status_code=403, detail="需要集群 read 权限")
            # 获取指定集群的命名空间
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            # 获取所有活跃集群的命名空间
            if getattr(current_user, "role", None) == "viewer":
                allowed_ids = get_viewer_allowed_cluster_ids(db, current_user)
                if not allowed_ids:
                    cache_manager.set(cache_key, [], K8S_RESOURCE_TTL)
                    return []
                clusters = db.query(Cluster).filter(Cluster.is_active == True, Cluster.id.in_(allowed_ids)).all()
            else:
                clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_namespaces = []
        for cluster in clusters:
            try:
                namespaces = get_namespaces_info(cluster)
                if namespaces:
                    # 添加集群标识
                    for ns in namespaces:
                        ns['cluster_id'] = cluster.id
                        ns['cluster_name'] = cluster.name
                    all_namespaces.extend(namespaces)
            except Exception as e:
                # 如果连接失败，使用模拟数据但也要添加集群标识
                from ..services.k8s import get_mock_namespaces
                mock_namespaces = get_mock_namespaces()
                if mock_namespaces:
                    for ns in mock_namespaces:
                        ns['cluster_id'] = cluster.id
                        ns['cluster_name'] = cluster.name
                    all_namespaces.extend(mock_namespaces)
                continue

        cache_manager.set(cache_key, all_namespaces, K8S_RESOURCE_TTL)
        return all_namespaces

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取命名空间信息失败: {str(e)}")

@router.post("/", response_model=NamespaceInfo)
def create_new_namespace(
    namespace: NamespaceCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user=Depends(require_resource_management)
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
            # 使 namespaces 列表缓存失效
            invalidate_cache(f"k8s:namespaces:cluster:{cluster_id}")
            invalidate_cache("k8s:namespaces:all_active")

            # 重新获取命名空间信息以返回完整数据
            namespaces = get_namespaces_info(cluster)
            for ns in namespaces:
                if ns['name'] == namespace.name:
                    ns['cluster_id'] = cluster.id
                    ns['cluster_name'] = cluster.name
                    # 确保所有必需字段都存在
                    ns.setdefault('labels', {})
                    ns.setdefault('annotations', {})
                    return ns

        raise HTTPException(status_code=500, detail="创建命名空间失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建命名空间失败: {str(e)}")

@router.delete("/{namespace_name}")
def remove_namespace(
    namespace_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user=Depends(require_resource_management)
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
            # 使 namespaces 列表缓存失效
            invalidate_cache(f"k8s:namespaces:cluster:{cluster_id}")
            invalidate_cache("k8s:namespaces:all_active")
            return {"message": f"命名空间 '{namespace_name}' 已删除"}
        else:
            raise HTTPException(status_code=500, detail="删除命名空间失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除命名空间失败: {str(e)}")

@router.get("/{namespace_name}/resources", response_model=NamespaceResources)
def get_namespace_resource_usage(
    namespace_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_read_only)
):
    """获取命名空间资源使用情况"""
    try:
        # 验证cluster_id参数
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

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


@router.get("/{namespace_name}/deployments")
def get_namespace_deployments_endpoint(
    namespace_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_read_only)
):
    """获取命名空间中的部署"""
    try:
        # 验证cluster_id参数
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        deployments = get_namespace_deployments(cluster, namespace_name)
        return deployments

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取命名空间部署信息失败: {str(e)}")


@router.get("/{namespace_name}/services")
def get_namespace_services_endpoint(
    namespace_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_read_only)
):
    """获取命名空间中的服务"""
    try:
        # 验证cluster_id参数
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        services = get_namespace_services(cluster, namespace_name)
        return services

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取命名空间服务信息失败: {str(e)}")


@router.get("/{namespace_name}/crds")
def get_namespace_crds_endpoint(
    namespace_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_read_only)
):
    """获取命名空间中的自定义资源"""
    try:
        # 验证cluster_id参数
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        crds = get_namespace_crds(cluster, namespace_name)
        return crds

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取命名空间CRD信息失败: {str(e)}")
