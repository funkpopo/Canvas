from fastapi import APIRouter, Depends, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import PodDetail, PodSummary
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/pods", tags=["pods"])


@router.get("/", response_model=list[PodSummary], summary="List pods with details")
async def list_pods(
    namespace: str | None = Query(default=None),
    name: str | None = Query(default=None, description="Substring match for pod name"),
    phase: str | None = Query(default=None, description="Filter by status.phase"),
    restart_policy: str | None = Query(default=None, description="Filter by spec.restartPolicy"),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[PodSummary]:
    return await service.list_pods_summary(namespace=namespace, name=name, phase=phase, restart_policy=restart_policy)


@router.get("/{namespace}/{name}", response_model=PodDetail, summary="Get pod detail")
async def get_pod_detail(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> PodDetail:
    return await service.get_pod_detail(namespace=namespace, name=name)


@router.delete("/{namespace}/{name}", response_model=dict, summary="Delete a pod", tags=["pods"])
async def delete_pod(
    namespace: str,
    name: str,
    grace_period_seconds: int | None = Query(default=None, ge=0),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> dict:
    ok, msg = await service.delete_pod(namespace=namespace, name=name, grace_period_seconds=grace_period_seconds)
    return {"ok": ok, "message": msg}
