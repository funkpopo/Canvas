from fastapi import APIRouter, Depends

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import NodeSummary
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("/", response_model=list[NodeSummary], summary="List cluster nodes")
async def list_nodes(service: KubernetesService = Depends(get_kubernetes_service)) -> list[NodeSummary]:
    return await service.list_nodes()
