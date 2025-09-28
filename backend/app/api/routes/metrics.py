from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import ClusterCapacityMetrics, MetricsServerStatus
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/status", response_model=MetricsServerStatus, summary="metrics-server status")
async def metrics_status(
    service: KubernetesService = Depends(get_kubernetes_service),
) -> MetricsServerStatus:
    return await service.get_metrics_server_status()


from pydantic import BaseModel


class InstallMetricsRequest(BaseModel):
    insecure_kubelet_tls: bool = False


@router.post("/install", response_model=MetricsServerStatus, summary="Install metrics-server")
async def install_metrics_server(
    payload: InstallMetricsRequest | None = None,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> MetricsServerStatus:
    insecure = bool(payload.insecure_kubelet_tls) if payload else False
    return await service.install_metrics_server(insecure_kubelet_tls=insecure)


@router.get(
    "/capacity",
    response_model=ClusterCapacityMetrics,
    summary="Aggregate cluster capacity and live usage",
)
async def cluster_capacity(
    service: KubernetesService = Depends(get_kubernetes_service),
) -> ClusterCapacityMetrics:
    return await service.get_cluster_capacity()
