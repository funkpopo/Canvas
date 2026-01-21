from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from .deps import get_active_cluster
from ..services.k8s import (
    get_namespace_ingresses, get_ingress_details, delete_ingress
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()
logger = get_logger(__name__)


class IngressInfo(BaseModel):
    name: str
    namespace: str
    hosts: List[str]
    addresses: List[str]
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class IngressDetails(BaseModel):
    name: str
    namespace: str
    ingress_class_name: str
    rules: List[dict]
    tls: List[dict]
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    cluster_id: int
    cluster_name: str


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/ingresses", response_model=List[IngressInfo])
def list_ingresses(
    cluster_id: int,
    namespace: str,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的Ingresses"""
    ingresses = get_namespace_ingresses(cluster, namespace)

    log_action(
        db=db, user_id=current_user.id, action="LIST_INGRESSES",
        resource_type="ingress", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(ingresses)}
    )

    return ingresses


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/ingresses/{name}", response_model=IngressDetails)
def get_ingress(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取Ingress详细信息"""
    ingress = get_ingress_details(cluster, namespace, name)
    if not ingress:
        raise HTTPException(status_code=404, detail="Ingress不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_INGRESS",
        resource_type="ingress", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )

    return ingress


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/ingresses/{name}")
def delete_ingress_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_active_cluster),
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除Ingress"""
    success = delete_ingress(cluster, namespace, name)

    log_action(
        db=db, user_id=current_user.id, action="DELETE_INGRESS",
        resource_type="ingress", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    return {"success": True, "message": "Ingress已删除"}
