from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/networkpolicies", tags=["networkpolicies"])


@router.get("/", response_model=list[dict], summary="List NetworkPolicies")
async def list_network_policies(
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
):
    return await service.list_network_policies(namespace)


@router.get("/{namespace}/{name}/yaml", response_model=YamlContent)
async def get_network_policy_yaml(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> YamlContent:
    text = await service.get_network_policy_yaml(namespace, name)
    if text is None:
        raise HTTPException(status_code=404, detail="NetworkPolicy not found")
    return YamlContent(yaml=text)


@router.put("/{namespace}/{name}/yaml", response_model=OperationResult)
async def put_network_policy_yaml(namespace: str, name: str, payload: YamlContent, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.apply_network_policy_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)


@router.delete("/{namespace}/{name}", response_model=OperationResult)
async def delete_network_policy(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.delete_network_policy(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete NetworkPolicy")
    return OperationResult(ok=True, message=None)

