from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import (
    ClusterCapacityMetrics,
    MetricsServerStatus,
    ContainerMetricPoint,
    ContainerMetricSeries,
)
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/status", response_model=MetricsServerStatus, summary="metrics-server status")
async def metrics_status(
    service: KubernetesService = Depends(get_kubernetes_service),
) -> MetricsServerStatus:
    return await service.get_metrics_server_status()


from pydantic import BaseModel


class InstallMetricsRequest(BaseModel):
    insecure_kubelet_tls: bool = False


@router.post("/install", response_model=MetricsServerStatus, summary="Install metrics-server")
async def install_metrics_server(
    payload: InstallMetricsRequest | None = None,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> MetricsServerStatus:
    insecure = bool(payload.insecure_kubelet_tls) if payload else False
    return await service.install_metrics_server(insecure_kubelet_tls=insecure)


@router.get(
    "/capacity",
    response_model=ClusterCapacityMetrics,
    summary="Aggregate cluster capacity and live usage",
)
async def cluster_capacity(
    service: KubernetesService = Depends(get_kubernetes_service),
) -> ClusterCapacityMetrics:
    return await service.get_cluster_capacity()


# --------------------
# Container time-series
# --------------------
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.models.container_metric import ContainerMetric


_WINDOW_DEFAULT = "10m"
_WINDOWS_ALLOWED = {"10m": 10, "30m": 30, "1h": 60, "3h": 180, "6h": 360, "12h": 720}


@router.get(
    "/container",
    response_model=ContainerMetricSeries,
    summary="Container CPU/Memory usage time-series",
)
async def container_series(
    namespace: str = Query(..., description="Pod namespace"),
    pod: str = Query(..., description="Pod name"),
    container: str = Query(..., description="Container name"),
    window: str = Query(_WINDOW_DEFAULT, description="Time window: 10m,30m,1h,3h,6h,12h"),
    session: AsyncSession = Depends(get_session),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> ContainerMetricSeries:
    status = await service.get_metrics_server_status()
    minutes = _WINDOWS_ALLOWED.get(window, _WINDOWS_ALLOWED[_WINDOW_DEFAULT])
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(minutes=minutes)

    stmt = (
        select(ContainerMetric)
        .where(
            ContainerMetric.namespace == namespace,
            ContainerMetric.pod == pod,
            ContainerMetric.container == container,
            ContainerMetric.ts >= since,
        )
        .order_by(ContainerMetric.ts.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    points = [
        ContainerMetricPoint(ts=row.ts, cpu_mcores=row.cpu_mcores, memory_bytes=row.memory_bytes)
        for row in rows
    ]
    return ContainerMetricSeries(
        has_metrics=bool(status.installed and status.healthy),
        namespace=namespace,
        pod=pod,
        container=container,
        points=points,
    )
