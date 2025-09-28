from fastapi import APIRouter, Depends

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import NamespaceSummary, PodWithContainers
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/namespaces", tags=["namespaces"])


@router.get("/", response_model=list[NamespaceSummary], summary="List namespaces")
async def list_namespaces(service: KubernetesService = Depends(get_kubernetes_service)) -> list[NamespaceSummary]:
    return await service.list_namespaces()


@router.get("/{name}/pods", response_model=list[PodWithContainers], summary="List pods and containers in a namespace")
async def list_pods_in_namespace(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> list[PodWithContainers]:
    items = await service.list_pods_with_containers(name)
    return [PodWithContainers(name=i.get("name", ""), containers=list(i.get("containers", []))) for i in items]
