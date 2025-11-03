from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from ..k8s_client import (
    get_namespace_daemonsets, get_daemonset_details, delete_daemonset
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()
logger = get_logger(__name__)


class DaemonSetInfo(BaseModel):
    name: str
    namespace: str
    desired: int
    current: int
    ready: int
    updated: int
    available: int
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class DaemonSetDetails(BaseModel):
    name: str
    namespace: str
    desired: int
    current: int
    ready: int
    updated: int
    available: int
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    selector: dict
    cluster_id: int
    cluster_name: str


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/daemonsets", response_model=List[DaemonSetInfo])
async def list_daemonsets(
    cluster_id: int,
    namespace: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的DaemonSets"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    daemonsets = get_namespace_daemonsets(cluster, namespace)

    log_action(
        db=db, user_id=current_user.id, action="LIST_DAEMONSETS",
        resource_type="daemonset", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(daemonsets)}
    )

    return daemonsets


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/daemonsets/{name}", response_model=DaemonSetDetails)
async def get_daemonset(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取DaemonSet详细信息"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    daemonset = get_daemonset_details(cluster, namespace, name)
    if not daemonset:
        raise HTTPException(status_code=404, detail="DaemonSet不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_DAEMONSET",
        resource_type="daemonset", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )

    return daemonset


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/daemonsets/{name}")
async def delete_daemonset_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除DaemonSet"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    success = delete_daemonset(cluster, namespace, name)

    log_action(
        db=db, user_id=current_user.id, action="DELETE_DAEMONSET",
        resource_type="daemonset", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    return {"success": True, "message": "DaemonSet已删除"}
