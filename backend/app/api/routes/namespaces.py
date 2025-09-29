from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import NamespaceSummary, PodWithContainers, OperationResult, NamespaceCreate
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/namespaces", tags=["namespaces"])


@router.get("/", response_model=list[NamespaceSummary], summary="List namespaces")
async def list_namespaces(service: KubernetesService = Depends(get_kubernetes_service)) -> list[NamespaceSummary]:
    return await service.list_namespaces()


@router.get("/{name}/pods", response_model=list[PodWithContainers], summary="List pods and containers in a namespace")
async def list_pods_in_namespace(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> list[PodWithContainers]:
    items = await service.list_pods_with_containers(name)
    return [PodWithContainers(name=i.get("name", ""), containers=list(i.get("containers", []))) for i in items]


@router.post("/", response_model=OperationResult, summary="Create a namespace")
async def create_namespace(payload: NamespaceCreate, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    ok, msg = await service.create_namespace(payload.name.strip(), labels=payload.labels or {})
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to create namespace")
    return OperationResult(ok=True, message=None)


@router.delete("/{name}", response_model=OperationResult, summary="Delete a namespace")
async def delete_namespace(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    ok, msg = await service.delete_namespace(name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete namespace")
    return OperationResult(ok=True, message=None)
