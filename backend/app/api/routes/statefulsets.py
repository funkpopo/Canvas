from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, PodWithContainers, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/workloads/statefulsets", tags=["statefulsets"])


@router.get(
    "/{namespace}/{name}/pods",
    response_model=list[PodWithContainers],
    summary="List pods for a StatefulSet (with container names)",
)
async def list_statefulset_pods(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[PodWithContainers]:
    items = await service.list_pods_for_statefulset(namespace, name)
    return [
        PodWithContainers(
            name=i.get("name", ""),
            containers=list(i.get("containers", [])),
            ready_containers=i.get("ready_containers"),
            total_containers=i.get("total_containers"),
            phase=i.get("phase"),
        )
        for i in items
    ]


@router.post(
    "/{namespace}/{name}/scale",
    response_model=OperationResult,
    summary="Scale StatefulSet replicas",
)
async def scale_statefulset(
    namespace: str,
    name: str,
    payload: dict,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    replicas = int(payload.get("replicas", 0))
    if replicas < 0:
        raise HTTPException(status_code=400, detail="replicas must be >= 0")
    ok, msg = await service.scale_statefulset(namespace, name, replicas)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to scale StatefulSet")
    return OperationResult(ok=True, message=None)


@router.delete(
    "/{namespace}/{name}",
    response_model=OperationResult,
    summary="Delete a StatefulSet",
)
async def delete_statefulset(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.delete_statefulset(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete StatefulSet")
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/yaml",
    response_model=YamlContent,
    summary="Get the YAML manifest for a StatefulSet",
)
async def get_statefulset_yaml(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    content = await service.get_statefulset_yaml(namespace, name)
    if content is None:
        raise HTTPException(status_code=404, detail="StatefulSet YAML not found")
    return YamlContent(yaml=content)


@router.put(
    "/{namespace}/{name}/yaml",
    response_model=OperationResult,
    summary="Apply changes to a StatefulSet via YAML (spec only)",
)
async def update_statefulset_yaml(
    namespace: str,
    name: str,
    payload: YamlContent,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.apply_statefulset_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)

