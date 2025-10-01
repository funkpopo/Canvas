from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import get_kubernetes_service
from app.services.kube_client import KubernetesService


class AuthzCheck(BaseModel):
    verb: str
    resource: str
    namespace: str | None = None
    group: str | None = None
    subresource: str | None = None


class AuthzMatrixRequest(BaseModel):
    checks: list[AuthzCheck]


router = APIRouter(prefix="/authz", tags=["authz"]) 


@router.post("/check", response_model=list[bool], summary="Batch authorization checks using SelfSubjectAccessReview")
async def check_authz(
    body: AuthzMatrixRequest,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[bool]:
    results: list[bool] = []
    for c in body.checks:
        allowed = await service.check_access(
            verb=c.verb,
            resource=c.resource,
            namespace=c.namespace,
            group=c.group or "",
            subresource=c.subresource,
        )
        results.append(bool(allowed))
    return results

