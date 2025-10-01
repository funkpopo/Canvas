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
    PersistentVolumeDetail,
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


@router.get("/pv/{name}", response_model=PersistentVolumeDetail | None, summary="Get PersistentVolume detail")
async def get_pv_detail(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> PersistentVolumeDetail | None:
    return await service.get_pv_detail(name)


@router.post(
    "/pvcs/{namespace}/{name}/expand",
    response_model=OperationResult,
    summary="Expand a PVC to a new size (SC must allow expansion)",
)
async def expand_pvc(namespace: str, name: str, new_size: str = Query(..., description="e.g., 10Gi"), service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.expand_pvc(namespace, name, new_size)
    return OperationResult(ok=ok, message=msg)


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


@router.post(
    "/browser/{namespace}/{pvc}/mkdir",
    response_model=OperationResult,
    summary="Create a directory within the PVC",
)
async def make_dir(namespace: str, pvc: str, path: str = Query(default="/"), service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.make_dir(namespace, pvc, path)
    return OperationResult(ok=ok, message=msg)


@router.delete(
    "/browser/{namespace}/{pvc}/delete",
    response_model=OperationResult,
    summary="Delete a file or directory within the PVC",
)
async def delete_path(namespace: str, pvc: str, path: str, recursive: bool = Query(default=True), service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.delete_path(namespace, pvc, path, recursive=recursive)
    return OperationResult(ok=ok, message=msg)


@router.get(
    "/browser/{namespace}/{pvc}/download-zip",
    summary="Download multiple files/directories as a ZIP archive",
)
async def download_zip(
    namespace: str,
    pvc: str,
    paths: list[str] = Query(default=[]),
    service: KubernetesService = Depends(get_kubernetes_service),
):
    import io
    import base64
    from zipfile import ZipFile, ZIP_DEFLATED

    # Collect file list (flatten directories best-effort)
    to_zip: list[tuple[str, bytes]] = []

    async def _collect(ns: str, pv: str, p: str, base: str = ""):
        # Normalize path and list
        entries = await service.list_volume_path(ns, pv, p)
        # If list is empty, try to read as file
        if not entries:
            file = await service.read_file_base64(ns, pv, p)
            if file and file.base64_data:
                try:
                    to_zip.append((base or p.lstrip("/"), base64.b64decode(file.base64_data)))
                except Exception:
                    pass
            return
        # Else, it's a directory
        for e in entries:
            sub_base = f"{base}/{e.name}".lstrip("/") if base else e.name
            if e.is_dir:
                await _collect(ns, pv, e.path, sub_base)
            else:
                file = await service.read_file_base64(ns, pv, e.path)
                if file and file.base64_data:
                    try:
                        to_zip.append((sub_base, base64.b64decode(file.base64_data)))
                    except Exception:
                        pass

    for p in paths:
        await _collect(namespace, pvc, p)

    buf = io.BytesIO()
    with ZipFile(buf, "w", compression=ZIP_DEFLATED) as zf:
        for rel, data in to_zip:
            # Avoid empty names
            arcname = rel or "file"
            zf.writestr(arcname, data)
    buf.seek(0)

    headers = {"Content-Disposition": f"attachment; filename=\"{pvc}-files.zip\""}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)
