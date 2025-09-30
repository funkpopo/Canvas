from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, PodWithContainers, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/workloads/jobs", tags=["jobs"])


@router.get(
    "/{namespace}/{name}/pods",
    response_model=list[PodWithContainers],
    summary="List pods for a Job (with container names)",
)
async def list_job_pods(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[PodWithContainers]:
    items = await service.list_pods_for_job(namespace, name)
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
    summary="Delete a Job",
)
async def delete_job(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.delete_job(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete Job")
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/yaml",
    response_model=YamlContent,
    summary="Get the YAML manifest for a Job",
)
async def get_job_yaml(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    content = await service.get_job_yaml(namespace, name)
    if content is None:
        raise HTTPException(status_code=404, detail="Job YAML not found")
    return YamlContent(yaml=content)


@router.put(
    "/{namespace}/{name}/yaml",
    response_model=OperationResult,
    summary="Apply changes to a Job via YAML (spec only)",
)
async def update_job_yaml(
    namespace: str,
    name: str,
    payload: YamlContent,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.apply_job_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)

