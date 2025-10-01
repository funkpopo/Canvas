from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("/{group}/{version}/{plural}/{name}", response_model=YamlContent, summary="Get resource YAML (generic GVK)")
async def get_generic_yaml(
    group: str,
    version: str,
    plural: str,
    name: str,
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    text = await service.get_generic_resource_yaml(group, version, plural, name, namespace)
    if text is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    return YamlContent(yaml=text)


@router.put("/{group}/{version}/{plural}/{name}", response_model=OperationResult, summary="Update resource YAML (generic GVK)")
async def put_generic_yaml(
    group: str,
    version: str,
    plural: str,
    name: str,
    payload: YamlContent,
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.put_generic_resource_yaml(group, version, plural, name, payload.yaml, namespace)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)


@router.delete("/{group}/{version}/{plural}/{name}", response_model=OperationResult, summary="Delete resource (generic GVK)")
async def delete_generic(
    group: str,
    version: str,
    plural: str,
    name: str,
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.delete_generic_resource(group, version, plural, name, namespace)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete resource")
    return OperationResult(ok=True, message=None)

