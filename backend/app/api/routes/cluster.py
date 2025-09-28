from fastapi import APIRouter, Depends

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import ClusterOverview, WorkloadSummary, ClusterStorageSummary
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/cluster", tags=["cluster"])


@router.get("/overview", response_model=ClusterOverview, summary="Cluster overview metrics")
async def cluster_overview(service: KubernetesService = Depends(get_kubernetes_service)) -> ClusterOverview:
    return await service.get_cluster_overview()


@router.get("/workloads", response_model=list[WorkloadSummary], summary="List workloads")
async def list_workloads(service: KubernetesService = Depends(get_kubernetes_service)) -> list[WorkloadSummary]:
    return await service.list_workloads()


@router.get(
    "/storage",
    response_model=ClusterStorageSummary,
    summary="PVC/PV summary across all namespaces",
)
async def cluster_storage_summary(
    service: KubernetesService = Depends(get_kubernetes_service),
) -> ClusterStorageSummary:
    return await service.get_storage_summary()
