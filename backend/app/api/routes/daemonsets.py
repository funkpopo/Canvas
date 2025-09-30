from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, PodWithContainers, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/workloads/daemonsets", tags=["daemonsets"])


@router.get(
    "/{namespace}/{name}/pods",
    response_model=list[PodWithContainers],
    summary="List pods for a DaemonSet (with container names)",
)
async def list_daemonset_pods(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[PodWithContainers]:
    items = await service.list_pods_for_daemonset(namespace, name)
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


@router.delete(
    "/{namespace}/{name}",
    response_model=OperationResult,
    summary="Delete a DaemonSet",
)
async def delete_daemonset(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.delete_daemonset(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete DaemonSet")
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/yaml",
    response_model=YamlContent,
    summary="Get the YAML manifest for a DaemonSet",
)
async def get_daemonset_yaml(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    content = await service.get_daemonset_yaml(namespace, name)
    if content is None:
        raise HTTPException(status_code=404, detail="DaemonSet YAML not found")
    return YamlContent(yaml=content)


@router.put(
    "/{namespace}/{name}/yaml",
    response_model=OperationResult,
    summary="Apply changes to a DaemonSet via YAML (spec only)",
)
async def update_daemonset_yaml(
    namespace: str,
    name: str,
    payload: YamlContent,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.apply_daemonset_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)

