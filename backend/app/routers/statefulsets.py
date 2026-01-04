from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from ..services.k8s import (
    get_namespace_statefulsets, get_statefulset_details,
    scale_statefulset, delete_statefulset
)
from ..audit import log_action
from .deps import get_active_cluster, AuditLogger

router = APIRouter()


class StatefulSetInfo(BaseModel):
    name: str
    namespace: str
    replicas: int
    ready_replicas: int
    current_replicas: int
    updated_replicas: int
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class StatefulSetDetails(BaseModel):
    name: str
    namespace: str
    replicas: int
    ready_replicas: int
    current_replicas: int
    updated_replicas: int
    service_name: str
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    selector: dict
    cluster_id: int
    cluster_name: str


class ScaleRequest(BaseModel):
    replicas: int


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/statefulsets", response_model=List[StatefulSetInfo])
async def list_statefulsets(
    cluster_id: int,
    namespace: str,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的StatefulSets"""
    statefulsets = get_namespace_statefulsets(cluster, namespace)
    log_action(
        db=db, user_id=current_user.id, action="LIST_STATEFULSETS",
        resource_type="statefulset", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(statefulsets)}
    )
    return statefulsets


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/statefulsets/{name}", response_model=StatefulSetDetails)
async def get_statefulset(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取StatefulSet详细信息"""
    statefulset = get_statefulset_details(cluster, namespace, name)
    if not statefulset:
        raise HTTPException(status_code=404, detail="StatefulSet不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_STATEFULSET",
        resource_type="statefulset", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )
    return statefulset


@router.post("/clusters/{cluster_id}/namespaces/{namespace}/statefulsets/{name}/scale")
async def scale_statefulset_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    scale_request: ScaleRequest,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """扩缩容StatefulSet"""
    success = scale_statefulset(cluster, namespace, name, scale_request.replicas)
    log_action(
        db=db, user_id=current_user.id, action="SCALE_STATEFULSET",
        resource_type="statefulset", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name, "replicas": scale_request.replicas}
    )

    if not success:
        raise HTTPException(status_code=500, detail="扩缩容失败")
    return {"success": True, "message": f"StatefulSet已扩缩容至 {scale_request.replicas} 个副本"}


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/statefulsets/{name}")
async def delete_statefulset_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除StatefulSet"""
    success = delete_statefulset(cluster, namespace, name)
    log_action(
        db=db, user_id=current_user.id, action="DELETE_STATEFULSET",
        resource_type="statefulset", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")
    return {"success": True, "message": "StatefulSet已删除"}
