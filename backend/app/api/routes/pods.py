from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import PodDetail, PodSummary, YamlContent
from app.services.kube_client import KubernetesService
from app.services.audit import AuditService
from app.db import get_session_factory


def get_audit_service() -> AuditService:
    return AuditService(get_session_factory())


router = APIRouter(prefix="/pods", tags=["pods"])


@router.get("/", response_model=list[PodSummary], summary="List pods with details")
async def list_pods(
    namespace: str | None = Query(default=None),
    name: str | None = Query(default=None, description="Substring match for pod name"),
    phase: str | None = Query(default=None, description="Filter by status.phase"),
    restart_policy: str | None = Query(default=None, description="Filter by spec.restartPolicy"),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[PodSummary]:
    return await service.list_pods_summary(namespace=namespace, name=name, phase=phase, restart_policy=restart_policy)


@router.get("/{namespace}/{name}", response_model=PodDetail, summary="Get pod detail")
async def get_pod_detail(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> PodDetail:
    return await service.get_pod_detail(namespace=namespace, name=name)


@router.delete("/{namespace}/{name}", response_model=dict, summary="Delete a pod", tags=["pods"]) 
async def delete_pod(
    namespace: str,
    name: str,
    grace_period_seconds: int | None = Query(default=None, ge=0),
    service: KubernetesService = Depends(get_kubernetes_service),
    audit: AuditService = Depends(get_audit_service),
) -> dict:
    ok, msg = await service.delete_pod(namespace=namespace, name=name, grace_period_seconds=grace_period_seconds)
    await audit.log(
        action="delete",
        resource="pods",
        namespace=namespace,
        name=name,
        success=bool(ok),
        details={"grace_period_seconds": grace_period_seconds} if grace_period_seconds is not None else None,
    )
    return {"ok": ok, "message": msg}


@router.get(
    "/{namespace}/{name}/logs",
    summary="Stream pod logs (optionally follow)",
)
async def stream_pod_logs(
    namespace: str,
    name: str,
    container: str | None = Query(default=None),
    follow: bool = Query(default=True),
    tailLines: int | None = Query(default=None, ge=0),
    sinceSeconds: int | None = Query(default=None, ge=0),
    service: KubernetesService = Depends(get_kubernetes_service),
):
    iterator = await service.iter_pod_logs(
        namespace=namespace,
        name=name,
        container=container,
        follow=follow,
        tail_lines=tailLines,
        since_seconds=sinceSeconds,
    )
    return StreamingResponse(iterator, media_type="text/plain")


class EphemeralContainerRequest(BaseModel):
    image: str
    command: str | None = None
    target_container: str | None = None
    container_name: str | None = None
    tty: bool = True
    stdin: bool = True


@router.post(
    "/{namespace}/{name}/debug",
    summary="Create an ephemeral debug container in a Pod",
)
async def create_ephemeral_container(
    namespace: str,
    name: str,
    payload: EphemeralContainerRequest,
    service: KubernetesService = Depends(get_kubernetes_service),
    audit: AuditService = Depends(get_audit_service),
):
    cmd_list = None
    if payload.command:
        # naive split by whitespace; client may send full path + args
        cmd_list = [p for p in payload.command.split(" ") if p]
    ok, msg_or_container = await service.create_ephemeral_container(
        namespace=namespace,
        name=name,
        image=payload.image,
        command=cmd_list,
        target_container=payload.target_container,
        container_name=payload.container_name,
        tty=payload.tty,
        stdin=payload.stdin,
    )
    await audit.log(
        action="debug",
        resource="pods",
        namespace=namespace,
        name=name,
        success=bool(ok),
        details={"container": (msg_or_container if ok else None), "image": payload.image, "target": payload.target_container},
    )
    return {"ok": ok, "container": (msg_or_container if ok else None), "message": (None if ok else msg_or_container)}


@router.delete(
    "/{namespace}/{name}/debug/{container}",
    summary="Attempt to remove an ephemeral debug container (not supported by Kubernetes)",
)
async def delete_ephemeral_container(
    namespace: str,
    name: str,
    container: str,
    service: KubernetesService = Depends(get_kubernetes_service),
):
    ok, msg = await service.delete_ephemeral_container(namespace=namespace, name=name, container=container)
    return {"ok": ok, "message": msg}


@router.get(
    "/{namespace}/{name}/yaml",
    response_model=YamlContent,
    summary="Get the YAML manifest for a Pod",
)
async def get_pod_yaml(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> YamlContent:
    content = await service.get_pod_yaml(namespace=namespace, name=name)
    return YamlContent(yaml=content or "")
