from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_kubernetes_service, provide_cluster_config_service
from app.core.crypto import decrypt_if_encrypted
from app.models.cluster_config import ClusterConfig
from app.schemas.config import (
    ClusterConfigDetail,
    ClusterConfigPayload,
    ClusterConfigResponse,
    SelectClusterRequest,
)
from app.services.cluster_config import ClusterConfigService
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/cluster/config", tags=["cluster-config"])


def _to_detail(config: ClusterConfig, include_sensitive: bool = True) -> ClusterConfigDetail:
    data = {
        "id": config.id,
        "name": config.name,
        "api_server": config.api_server,
        "namespace": config.namespace,
        "context": config.context,
        "kubeconfig_present": bool(config.kubeconfig),
        "token_present": bool(config.token),
        "certificate_authority_data_present": bool(config.certificate_authority_data),
        "insecure_skip_tls_verify": config.insecure_skip_tls_verify,
        "created_at": config.created_at,
        "updated_at": config.updated_at,
        "kubeconfig": (decrypt_if_encrypted(config.kubeconfig) if include_sensitive else None),
        "token": (decrypt_if_encrypted(config.token) if include_sensitive else None),
        "certificate_authority_data": (
            decrypt_if_encrypted(config.certificate_authority_data) if include_sensitive else None
        ),
    }
    return ClusterConfigDetail(**data)


@router.get("/", response_model=ClusterConfigDetail | None, summary="Get active cluster configuration")
async def get_cluster_config(
    config_service: ClusterConfigService = Depends(provide_cluster_config_service),
) -> ClusterConfigDetail | None:
    config = await config_service.get_default()
    if not config:
        return None
    return _to_detail(config)


@router.put("/", response_model=ClusterConfigDetail, summary="Save cluster configuration")
async def upsert_cluster_config(
    payload: ClusterConfigPayload,
    config_service: ClusterConfigService = Depends(provide_cluster_config_service),
    kube_service: KubernetesService = Depends(get_kubernetes_service),
) -> ClusterConfigDetail:
    config = await config_service.upsert_default(payload)
    await kube_service.invalidate()
    return _to_detail(config)


@router.get(
    "/all",
    response_model=list[ClusterConfigResponse],
    summary="List all saved cluster configurations",
)
async def list_cluster_configs(
    config_service: ClusterConfigService = Depends(provide_cluster_config_service),
) -> list[ClusterConfigResponse]:
    configs = await config_service.list_configs()
    return [
        ClusterConfigResponse(
            id=c.id,
            name=c.name,
            api_server=c.api_server,
            namespace=c.namespace,
            context=c.context,
            kubeconfig_present=bool(c.kubeconfig),
            token_present=bool(c.token),
            certificate_authority_data_present=bool(c.certificate_authority_data),
            insecure_skip_tls_verify=c.insecure_skip_tls_verify,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in configs
    ]


@router.post(
    "/select",
    response_model=ClusterConfigDetail,
    summary="Select active cluster by name or id",
)
async def select_active_cluster(
    payload: SelectClusterRequest,
    config_service: ClusterConfigService = Depends(provide_cluster_config_service),
    kube_service: KubernetesService = Depends(get_kubernetes_service),
) -> ClusterConfigDetail:
    # For now support selection by name only (simple, name is unique)
    if payload.name:
        config = await config_service.set_default_by_name(payload.name)
    else:
        raise HTTPException(status_code=400, detail="Selection requires 'name'")

    if not config:
        raise HTTPException(status_code=404, detail="Cluster configuration not found")

    await kube_service.invalidate()
    return _to_detail(config, include_sensitive=False)
