from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from ..services.k8s import (
    get_namespace_cronjobs, get_cronjob_details, delete_cronjob
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()
logger = get_logger(__name__)


class CronJobInfo(BaseModel):
    name: str
    namespace: str
    schedule: str
    suspend: bool
    active: int
    last_schedule_time: Optional[str]
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class CronJobDetails(BaseModel):
    name: str
    namespace: str
    schedule: str
    suspend: bool
    concurrency_policy: str
    starting_deadline_seconds: Optional[int]
    successful_jobs_history_limit: int
    failed_jobs_history_limit: int
    active_jobs: List[str]
    last_schedule_time: Optional[str]
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    cluster_id: int
    cluster_name: str


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/cronjobs", response_model=List[CronJobInfo])
async def list_cronjobs(
    cluster_id: int,
    namespace: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的CronJobs"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    cronjobs = get_namespace_cronjobs(cluster, namespace)

    log_action(
        db=db, user_id=current_user.id, action="LIST_CRONJOBS",
        resource_type="cronjob", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(cronjobs)}
    )

    return cronjobs


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/cronjobs/{name}", response_model=CronJobDetails)
async def get_cronjob(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取CronJob详细信息"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    cronjob = get_cronjob_details(cluster, namespace, name)
    if not cronjob:
        raise HTTPException(status_code=404, detail="CronJob不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_CRONJOB",
        resource_type="cronjob", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )

    return cronjob


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/cronjobs/{name}")
async def delete_cronjob_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除CronJob"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    success = delete_cronjob(cluster, namespace, name)

    log_action(
        db=db, user_id=current_user.id, action="DELETE_CRONJOB",
        resource_type="cronjob", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    return {"success": True, "message": "CronJob已删除"}
