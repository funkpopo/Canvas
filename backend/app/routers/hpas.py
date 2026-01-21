from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from .deps import get_cluster_or_404
from ..services.k8s import (
    get_namespace_hpas, get_hpa_details, delete_hpa
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()
logger = get_logger(__name__)


class HPAInfo(BaseModel):
    name: str
    namespace: str
    target_ref: str
    min_replicas: int
    max_replicas: int
    current_replicas: int
    desired_replicas: int
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class HPADetails(BaseModel):
    name: str
    namespace: str
    target_ref: dict
    min_replicas: int
    max_replicas: int
    current_replicas: int
    desired_replicas: int
    metrics: List[dict]
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    cluster_id: int
    cluster_name: str


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/hpas", response_model=List[HPAInfo])
def list_hpas(
    cluster_id: int,
    namespace: str,
    request: Request,
    cluster: Cluster = Depends(get_cluster_or_404),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的HPAs"""
    hpas = get_namespace_hpas(cluster, namespace)

    log_action(
        db=db, user_id=current_user.id, action="LIST_HPAS",
        resource_type="hpa", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(hpas)}
    )

    return hpas


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/hpas/{name}", response_model=HPADetails)
def get_hpa(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_cluster_or_404),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取HPA详细信息"""
    hpa = get_hpa_details(cluster, namespace, name)
    if not hpa:
        raise HTTPException(status_code=404, detail="HPA不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_HPA",
        resource_type="hpa", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )

    return hpa


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/hpas/{name}")
def delete_hpa_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_cluster_or_404),
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除HPA"""
    success = delete_hpa(cluster, namespace, name)

    log_action(
        db=db, user_id=current_user.id, action="DELETE_HPA",
        resource_type="hpa", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    return {"success": True, "message": "HPA已删除"}
