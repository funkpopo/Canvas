from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from .deps import get_cluster_or_404
from ..services.k8s import (
    get_namespace_limit_ranges, get_limit_range_details, delete_limit_range
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()
logger = get_logger(__name__)


class LimitRangeInfo(BaseModel):
    name: str
    namespace: str
    limits: List[dict]
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class LimitRangeDetails(BaseModel):
    name: str
    namespace: str
    limits: List[dict]
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    cluster_id: int
    cluster_name: str


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/limit-ranges", response_model=List[LimitRangeInfo])
async def list_limit_ranges(
    cluster_id: int,
    namespace: str,
    request: Request,
    cluster: Cluster = Depends(get_cluster_or_404),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的LimitRanges"""
    limit_ranges = get_namespace_limit_ranges(cluster, namespace)

    log_action(
        db=db, user_id=current_user.id, action="LIST_LIMIT_RANGES",
        resource_type="limitrange", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(limit_ranges)}
    )

    return limit_ranges


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/limit-ranges/{name}", response_model=LimitRangeDetails)
async def get_limit_range(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_cluster_or_404),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取LimitRange详细信息"""
    limit_range = get_limit_range_details(cluster, namespace, name)
    if not limit_range:
        raise HTTPException(status_code=404, detail="LimitRange不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_LIMIT_RANGE",
        resource_type="limitrange", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )

    return limit_range


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/limit-ranges/{name}")
async def delete_limit_range_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    cluster: Cluster = Depends(get_cluster_or_404),
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除LimitRange"""
    success = delete_limit_range(cluster, namespace, name)

    log_action(
        db=db, user_id=current_user.id, action="DELETE_LIMIT_RANGE",
        resource_type="limitrange", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    return {"success": True, "message": "LimitRange已删除"}
