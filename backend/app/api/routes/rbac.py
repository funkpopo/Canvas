from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user
from app.dependencies import get_kubernetes_service
from app.schemas.rbac import RbacSummary
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/rbac", tags=["rbac"], dependencies=[Depends(get_current_user)])


@router.get("/summary", response_model=RbacSummary)
async def rbac_summary(namespace: str | None = Query(default=None), service: KubernetesService = Depends(get_kubernetes_service)) -> RbacSummary:
    return await service.list_rbac_summary(namespace)

