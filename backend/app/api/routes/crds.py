from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import CRDSummary, GenericResourceEntry
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/crds", tags=["crds"])


@router.get("/", response_model=list[CRDSummary], summary="List CustomResourceDefinitions")
async def list_crds(service: KubernetesService = Depends(get_kubernetes_service)) -> list[CRDSummary]:
    return await service.list_crds()


@router.get("/{name}/resources", response_model=list[GenericResourceEntry], summary="List resources for a CRD")
async def list_crd_resources(
    name: str,
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[GenericResourceEntry]:
    try:
        return await service.list_crd_resources(crd_name=name, namespace=namespace)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=str(exc))

