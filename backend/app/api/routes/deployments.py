from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import PodWithContainers, OperationResult, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/workloads/deployments", tags=["deployments"])


@router.get(
    "/{namespace}/{name}/pods",
    response_model=list[PodWithContainers],
    summary="List pods for a deployment (with container names)",
)
async def list_deployment_pods(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[PodWithContainers]:
    items = await service.list_pods_for_deployment(namespace, name)
    return [PodWithContainers(name=i.get("name", ""), containers=list(i.get("containers", []))) for i in items]


@router.post(
    "/{namespace}/{name}/restart",
    response_model=OperationResult,
    summary="Rollout restart a deployment",
)
async def restart_deployment(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.restart_deployment(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to restart deployment")
    return OperationResult(ok=True, message=None)


class ScaleRequestPayload:
    replicas: int


@router.post(
    "/{namespace}/{name}/scale",
    response_model=OperationResult,
    summary="Scale deployment replicas",
)
async def scale_deployment(
    namespace: str,
    name: str,
    payload: dict,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    replicas = int(payload.get("replicas", 0))
    if replicas < 0:
        raise HTTPException(status_code=400, detail="replicas must be >= 0")
    ok, msg = await service.scale_deployment(namespace, name, replicas)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to scale deployment")
    return OperationResult(ok=True, message=None)


@router.delete(
    "/{namespace}/{name}",
    response_model=OperationResult,
    summary="Delete a deployment",
)
async def delete_deployment(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.delete_deployment(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete deployment")
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/yaml",
    response_model=YamlContent,
    summary="Get the YAML manifest for a deployment",
)
async def get_deployment_yaml(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    content = await service.get_deployment_yaml(namespace, name)
    if content is None:
        raise HTTPException(status_code=404, detail="Deployment YAML not found")
    return YamlContent(yaml=content)


@router.put(
    "/{namespace}/{name}/yaml",
    response_model=OperationResult,
    summary="Apply changes to a deployment via YAML (spec only)",
)
async def update_deployment_yaml(
    namespace: str,
    name: str,
    payload: YamlContent,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.apply_deployment_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)

