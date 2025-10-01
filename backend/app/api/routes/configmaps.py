from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_configmap_service
from app.schemas.kubernetes import OperationResult, YamlContent
from app.services.resources.config import ConfigMapService


router = APIRouter(prefix="/configmaps", tags=["configmaps"])


@router.get("/", response_model=list[dict], summary="List ConfigMaps")
async def list_configmaps(
    namespace: str | None = Query(default=None),
    service: ConfigMapService = Depends(get_configmap_service),
):
    return await service.list_configmaps(namespace)


@router.get("/{namespace}/{name}/yaml", response_model=YamlContent)
async def get_configmap_yaml(namespace: str, name: str, service: ConfigMapService = Depends(get_configmap_service)) -> YamlContent:
    text = await service.get_configmap_yaml(namespace, name)
    if text is None:
        raise HTTPException(status_code=404, detail="ConfigMap not found")
    return YamlContent(yaml=text)


@router.put("/{namespace}/{name}/yaml", response_model=OperationResult)
async def put_configmap_yaml(namespace: str, name: str, payload: YamlContent, service: ConfigMapService = Depends(get_configmap_service)) -> OperationResult:
    ok, msg = await service.apply_configmap_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    return OperationResult(ok=True, message=None)


@router.delete("/{namespace}/{name}", response_model=OperationResult)
async def delete_configmap(namespace: str, name: str, service: ConfigMapService = Depends(get_configmap_service)) -> OperationResult:
    ok, msg = await service.delete_configmap(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete ConfigMap")
    return OperationResult(ok=True, message=None)
