from fastapi import APIRouter, Depends

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import NamespaceSummary
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/namespaces", tags=["namespaces"])


@router.get("/", response_model=list[NamespaceSummary], summary="List namespaces")
async def list_namespaces(service: KubernetesService = Depends(get_kubernetes_service)) -> list[NamespaceSummary]:
    return await service.list_namespaces()
