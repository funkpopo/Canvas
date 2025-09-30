from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/workloads/cronjobs", tags=["cronjobs"])


@router.post(
    "/{namespace}/{name}/run",
    response_model=OperationResult,
    summary="Run a CronJob immediately by creating a Job",
)
async def run_cronjob_now(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.run_cronjob_now(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to run CronJob")
    return OperationResult(ok=True, message=None)


@router.delete(
    "/{namespace}/{name}",
    response_model=OperationResult,
    summary="Delete a CronJob",
)
async def delete_cronjob(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.delete_cronjob(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete CronJob")
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/yaml",
    response_model=YamlContent,
    summary="Get the YAML manifest for a CronJob",
)
async def get_cronjob_yaml(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    content = await service.get_cronjob_yaml(namespace, name)
    if content is None:
        raise HTTPException(status_code=404, detail="CronJob YAML not found")
    return YamlContent(yaml=content)


@router.put(
    "/{namespace}/{name}/yaml",
    response_model=OperationResult,
    summary="Apply changes to a CronJob via YAML (spec only)",
)
async def update_cronjob_yaml(
    namespace: str,
    name: str,
    payload: YamlContent,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.apply_cronjob_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)

