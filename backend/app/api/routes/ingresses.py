from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/ingresses", tags=["ingresses"])


@router.get("/", response_model=list[dict], summary="List ingresses")
async def list_ingresses(
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
):
    return await service.list_ingresses(namespace)


@router.get("/{namespace}/{name}/yaml", response_model=YamlContent)
async def get_ingress_yaml(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> YamlContent:
    text = await service.get_ingress_yaml(namespace, name)
    if text is None:
        raise HTTPException(status_code=404, detail="Ingress not found")
    return YamlContent(yaml=text)


@router.put("/{namespace}/{name}/yaml", response_model=OperationResult)
async def put_ingress_yaml(namespace: str, name: str, payload: YamlContent, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.apply_ingress_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)


@router.delete("/{namespace}/{name}", response_model=OperationResult)
async def delete_ingress(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.delete_ingress(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete ingress")
    return OperationResult(ok=True, message=None)

