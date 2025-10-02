from __future__ import annotations

import asyncio
import yaml
from kubernetes import client, config
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.dependencies import get_kubernetes_service, provide_cluster_config_service
from app.core.crypto import decrypt_if_encrypted
from app.models.cluster_config import ClusterConfig
from app.schemas.config import (
    ClusterConfigDetail,
    ClusterConfigPayload,
    ClusterConfigResponse,
    SelectClusterRequest,
    ClusterHealthResponse,
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


@router.get("/health", response_model=ClusterHealthResponse, summary="Check health of a saved cluster by name")
async def get_cluster_health(
    name: str = Query(..., description="Cluster name to probe"),
    config_service: ClusterConfigService = Depends(provide_cluster_config_service),
) -> ClusterHealthResponse:
    cfg = await config_service.get_by_name(name)
    if not cfg:
        raise HTTPException(status_code=404, detail="Cluster configuration not found")

    from app.core.crypto import decrypt_if_encrypted

    async def _probe() -> ClusterHealthResponse:
        try:
            # Build a temporary kubeconfig for this cluster and create an isolated ApiClient
            kubeconfig_text = decrypt_if_encrypted(cfg.kubeconfig)
            token_text = decrypt_if_encrypted(cfg.token)
            ca_text = decrypt_if_encrypted(cfg.certificate_authority_data)

            if kubeconfig_text:
                data = yaml.safe_load(kubeconfig_text) or {}
                context_name = cfg.context or data.get("current-context")
                config.load_kube_config_from_dict(data, context=context_name)
            else:
                if not cfg.api_server:
                    raise RuntimeError("Cluster missing API server or kubeconfig")
                cluster_name = cfg.name or "canvas"
                user_name = f"{cluster_name}-user"
                context_name = cfg.context or f"{cluster_name}-context"
                cluster_entry: dict[str, object] = {"server": cfg.api_server}
                if ca_text:
                    cluster_entry["certificate-authority-data"] = ca_text
                cluster_entry["insecure-skip-tls-verify"] = cfg.insecure_skip_tls_verify
                user_entry: dict[str, object] = {}
                if token_text:
                    user_entry["token"] = token_text
                context_entry: dict[str, object] = {"cluster": cluster_name, "user": user_name}
                if cfg.namespace:
                    context_entry["namespace"] = cfg.namespace
                kubeconfig_dict = {
                    "apiVersion": "v1",
                    "kind": "Config",
                    "clusters": [{"name": cluster_name, "cluster": cluster_entry}],
                    "users": [{"name": user_name, "user": user_entry}],
                    "contexts": [{"name": context_name, "context": context_entry}],
                    "current-context": context_name,
                    "preferences": {},
                }
                config.load_kube_config_from_dict(kubeconfig_dict, context=context_name)

            api_client = client.ApiClient()
            v1 = client.CoreV1Api(api_client)
            ver = client.VersionApi(api_client)

            def _collect() -> tuple[str, int, int]:
                vinfo = ver.get_code()
                nodes = v1.list_node().items
                ready = sum(
                    1
                    for node in nodes
                    if any(
                        c.type == "Ready" and c.status == "True"
                        for c in (getattr(node.status, "conditions", None) or [])
                    )
                )
                return getattr(vinfo, "git_version", "unknown"), len(nodes), ready

            kubernetes_version, node_count, ready_nodes = await asyncio.to_thread(_collect)
            await asyncio.to_thread(api_client.close)
            return ClusterHealthResponse(
                name=cfg.name,
                reachable=True,
                message=None,
                kubernetes_version=kubernetes_version,
                node_count=node_count,
                ready_nodes=ready_nodes,
            )
        except Exception as exc:
            try:
                # Best-effort cleanup if api_client exists in locals
                api_client.close()  # type: ignore[name-defined]
            except Exception:
                pass
            return ClusterHealthResponse(
                name=cfg.name,
                reachable=False,
                message=str(exc),
                kubernetes_version=None,
                node_count=None,
                ready_nodes=None,
            )

    return await _probe()


@router.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a saved cluster by name")
async def delete_cluster_config(
    name: str,
    config_service: ClusterConfigService = Depends(provide_cluster_config_service),
    kube_service: KubernetesService = Depends(get_kubernetes_service),
) -> Response:
    deleted = await config_service.delete_by_name(name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cluster configuration not found")
    await kube_service.invalidate()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
