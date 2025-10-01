from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import (
    PodWithContainers,
    OperationResult,
    YamlContent,
    DeploymentImageUpdate,
    DeploymentStrategy,
    AutoscalingConfig,
)
from app.services.kube_client import KubernetesService
from app.services.audit import AuditService
from app.db import get_session_factory


def get_audit_service() -> AuditService:
    return AuditService(get_session_factory())


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
    "/{namespace}/{name}/restart",
    response_model=OperationResult,
    summary="Rollout restart a deployment",
)
async def restart_deployment(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    ok, msg = await service.restart_deployment(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to restart deployment")
    await audit.log(action="restart", resource="deployments", namespace=namespace, name=name, success=True)
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
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    replicas = int(payload.get("replicas", 0))
    if replicas < 0:
        raise HTTPException(status_code=400, detail="replicas must be >= 0")
    ok, msg = await service.scale_deployment(namespace, name, replicas)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to scale deployment")
    await audit.log(action="scale", resource="deployments", namespace=namespace, name=name, success=True, details={"replicas": replicas})
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
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    ok, msg = await service.delete_deployment(namespace, name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to delete deployment")
    await audit.log(action="delete", resource="deployments", namespace=namespace, name=name, success=True)
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
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    ok, msg = await service.apply_deployment_yaml(namespace, name, payload.yaml)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to apply YAML")
    await audit.log(action="apply", resource="deployments", namespace=namespace, name=name, success=True)
    return OperationResult(ok=True, message=None)


@router.post(
    "/{namespace}/{name}/image",
    response_model=OperationResult,
    summary="Update a specific container image in the deployment",
)
async def update_deployment_image(
    namespace: str,
    name: str,
    payload: DeploymentImageUpdate,
    service: KubernetesService = Depends(get_kubernetes_service),
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    ok, msg = await service.update_deployment_image(namespace, name, payload.container, payload.image)
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to update image")
    await audit.log(action="apply", resource="deployments", namespace=namespace, name=name, success=True, details={"container": payload.container, "image": payload.image})
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/strategy",
    response_model=DeploymentStrategy,
    summary="Get deployment update strategy",
)
async def get_deployment_strategy(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> DeploymentStrategy:
    data = await service.get_deployment_strategy(namespace, name)
    return DeploymentStrategy(**data)


@router.put(
    "/{namespace}/{name}/strategy",
    response_model=OperationResult,
    summary="Update deployment update strategy",
)
async def put_deployment_strategy(
    namespace: str,
    name: str,
    payload: DeploymentStrategy,
    service: KubernetesService = Depends(get_kubernetes_service),
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    ok, msg = await service.update_deployment_strategy(
        namespace,
        name,
        payload.strategy_type,
        payload.max_unavailable,
        payload.max_surge,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to update strategy")
    await audit.log(action="apply", resource="deployments", namespace=namespace, name=name, success=True, details={"strategy": payload.strategy_type})
    return OperationResult(ok=True, message=None)


@router.get(
    "/{namespace}/{name}/autoscaling",
    response_model=AutoscalingConfig,
    summary="Get autoscaling (HPA) config for the deployment",
)
async def get_deployment_autoscaling(
    namespace: str,
    name: str,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> AutoscalingConfig:
    data = await service.get_deployment_autoscaling(namespace, name)
    return AutoscalingConfig(**data)


@router.put(
    "/{namespace}/{name}/autoscaling",
    response_model=OperationResult,
    summary="Enable/disable or update autoscaling (HPA) for the deployment",
)
async def put_deployment_autoscaling(
    namespace: str,
    name: str,
    payload: AutoscalingConfig,
    service: KubernetesService = Depends(get_kubernetes_service),
    audit: AuditService = Depends(get_audit_service),
) -> OperationResult:
    ok, msg = await service.update_deployment_autoscaling(
        namespace,
        name,
        payload.enabled,
        payload.min_replicas,
        payload.max_replicas,
        payload.target_cpu_utilization,
        payload.metrics,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg or "Failed to update autoscaling")
    await audit.log(action="apply", resource="deployments", namespace=namespace, name=name, success=True, details={"enabled": payload.enabled})
    return OperationResult(ok=True, message=None)
