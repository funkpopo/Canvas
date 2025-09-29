from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import (
    StorageClassSummary,
    StorageClassCreate,
    OperationResult,
    PersistentVolumeClaimSummary,
    VolumeFileEntry,
    FileContent,
)
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/classes", response_model=list[StorageClassSummary], summary="List storage classes")
async def list_storage_classes(service: KubernetesService = Depends(get_kubernetes_service)) -> list[StorageClassSummary]:
    return await service.list_storage_classes()


@router.post("/classes", response_model=OperationResult, summary="Create a storage class")
async def create_storage_class(payload: StorageClassCreate, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.create_storage_class(payload)
    return OperationResult(ok=ok, message=msg)


@router.delete("/classes/{name}", response_model=OperationResult, summary="Delete a storage class")
async def delete_storage_class(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.delete_storage_class(name)
    return OperationResult(ok=ok, message=msg)


@router.get("/pvcs", response_model=list[PersistentVolumeClaimSummary], summary="List PersistentVolumeClaims")
async def list_pvcs(namespace: str | None = Query(default=None), service: KubernetesService = Depends(get_kubernetes_service)) -> list[PersistentVolumeClaimSummary]:
    return await service.list_pvcs(namespace)


@router.get(
    "/browser/{namespace}/{pvc}/list",
    response_model=list[VolumeFileEntry],
    summary="List files for a PVC mount path",
)
async def list_volume(namespace: str, pvc: str, path: str = Query(default="/"), service: KubernetesService = Depends(get_kubernetes_service)) -> list[VolumeFileEntry]:
    return await service.list_volume_path(namespace, pvc, path)


@router.get(
    "/browser/{namespace}/{pvc}/read",
    response_model=FileContent | None,
    summary="Read a file as base64",
)
async def read_file(namespace: str, pvc: str, path: str, service: KubernetesService = Depends(get_kubernetes_service)) -> FileContent | None:
    return await service.read_file_base64(namespace, pvc, path)


@router.put(
    "/browser/{namespace}/{pvc}/write",
    response_model=OperationResult,
    summary="Write a file from base64 content",
)
async def write_file(namespace: str, pvc: str, payload: FileContent, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.write_file_base64(namespace, pvc, payload.path, payload.base64_data)
    return OperationResult(ok=ok, message=msg)


@router.post(
    "/browser/{namespace}/{pvc}/rename",
    response_model=OperationResult,
    summary="Rename a file or directory within the PVC",
)
async def rename_path(namespace: str, pvc: str, old_path: str, new_name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.rename_path(namespace, pvc, old_path, new_name)
    return OperationResult(ok=ok, message=msg)


@router.get(
    "/browser/{namespace}/{pvc}/download",
    summary="Download a file from the PVC",
)
async def download_file(namespace: str, pvc: str, path: str, service: KubernetesService = Depends(get_kubernetes_service)):
    # For simplicity, read the file as base64 and return decoded bytes
    file = await service.read_file_base64(namespace, pvc, path)
    if not file:
        return StreamingResponse(iter([b""]), media_type="application/octet-stream")
    import base64

    data = base64.b64decode(file.base64_data)
    filename = path.rstrip("/").split("/")[-1] or "file"
    headers = {"Content-Disposition": f"attachment; filename=\"{filename}\""}
    return StreamingResponse(iter([data]), media_type="application/octet-stream", headers=headers)

