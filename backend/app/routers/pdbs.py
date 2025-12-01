from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management
from ..services.k8s import (
    get_namespace_pdbs, get_pdb_details, delete_pdb
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()
logger = get_logger(__name__)


class PDBInfo(BaseModel):
    name: str
    namespace: str
    min_available: Optional[str]
    max_unavailable: Optional[str]
    current_healthy: int
    desired_healthy: int
    disruptions_allowed: int
    age: str
    labels: dict
    cluster_id: int
    cluster_name: str


class PDBDetails(BaseModel):
    name: str
    namespace: str
    min_available: Optional[str]
    max_unavailable: Optional[str]
    selector: dict
    current_healthy: int
    desired_healthy: int
    disruptions_allowed: int
    expected_pods: int
    age: str
    creation_timestamp: str
    labels: dict
    annotations: dict
    cluster_id: int
    cluster_name: str


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/pdbs", response_model=List[PDBInfo])
async def list_pdbs(
    cluster_id: int,
    namespace: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取命名空间中的PodDisruptionBudgets"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    pdbs = get_namespace_pdbs(cluster, namespace)

    log_action(
        db=db, user_id=current_user.id, action="LIST_PDBS",
        resource_type="poddisruptionbudget", resource_name=namespace,
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "count": len(pdbs)}
    )

    return pdbs


@router.get("/clusters/{cluster_id}/namespaces/{namespace}/pdbs/{name}", response_model=PDBDetails)
async def get_pdb(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取PodDisruptionBudget详细信息"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    pdb = get_pdb_details(cluster, namespace, name)
    if not pdb:
        raise HTTPException(status_code=404, detail="PodDisruptionBudget不存在")

    log_action(
        db=db, user_id=current_user.id, action="GET_PDB",
        resource_type="poddisruptionbudget", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request,
        details={"namespace": namespace, "name": name}
    )

    return pdb


@router.delete("/clusters/{cluster_id}/namespaces/{namespace}/pdbs/{name}")
async def delete_pdb_handler(
    cluster_id: int,
    namespace: str,
    name: str,
    request: Request,
    current_user=Depends(require_resource_management),
    db: Session = Depends(get_db)
):
    """删除PodDisruptionBudget"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    success = delete_pdb(cluster, namespace, name)

    log_action(
        db=db, user_id=current_user.id, action="DELETE_PDB",
        resource_type="poddisruptionbudget", resource_name=f"{namespace}/{name}",
        cluster_id=cluster_id, request=request, success=success,
        details={"namespace": namespace, "name": name}
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    return {"success": True, "message": "PodDisruptionBudget已删除"}
