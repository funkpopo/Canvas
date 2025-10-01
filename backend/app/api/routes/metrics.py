from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import (
    ClusterCapacityMetrics,
    MetricsServerStatus,
    ContainerMetricPoint,
    ContainerMetricSeries,
    NodeMetricPoint,
    NodeMetricSeries,
    PodAggregatePoint,
    PodAggregateSeries,
    NamespaceAggregateSeries,
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
from app.models.node_metric import NodeMetric


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


@router.get(
    "/node",
    response_model=NodeMetricSeries,
    summary="Node CPU/Memory usage time-series",
)
async def node_series(
    name: str = Query(..., description="Node name"),
    window: str = Query(_WINDOW_DEFAULT, description="Time window: 10m,30m,1h,3h,6h,12h"),
    session: AsyncSession = Depends(get_session),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> NodeMetricSeries:
    status = await service.get_metrics_server_status()
    minutes = _WINDOWS_ALLOWED.get(window, _WINDOWS_ALLOWED[_WINDOW_DEFAULT])
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(minutes=minutes)

    stmt = (
        select(NodeMetric)
        .where(
            NodeMetric.node == name,
            NodeMetric.ts >= since,
        )
        .order_by(NodeMetric.ts.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    points = [
        NodeMetricPoint(ts=row.ts, cpu_mcores=row.cpu_mcores, memory_bytes=row.memory_bytes)
        for row in rows
    ]
    return NodeMetricSeries(
        has_metrics=bool(status.installed and status.healthy),
        node=name,
        points=points,
    )


@router.get(
    "/aggregate/pod",
    response_model=PodAggregateSeries,
    summary="Aggregate CPU/Memory usage across containers of a Pod",
)
async def aggregate_pod(
    namespace: str = Query(..., description="Pod namespace"),
    pod: str = Query(..., description="Pod name"),
    window: str = Query(_WINDOW_DEFAULT, description="Time window: 10m,30m,1h,3h,6h,12h"),
    session: AsyncSession = Depends(get_session),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> PodAggregateSeries:
    status = await service.get_metrics_server_status()
    minutes = _WINDOWS_ALLOWED.get(window, _WINDOWS_ALLOWED[_WINDOW_DEFAULT])
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(minutes=minutes)

    stmt = (
        select(ContainerMetric)
        .where(
            ContainerMetric.namespace == namespace,
            ContainerMetric.pod == pod,
            ContainerMetric.ts >= since,
        )
        .order_by(ContainerMetric.ts.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    bucket: dict[datetime, tuple[int, int]] = {}
    for r in rows:
        k = r.ts
        cpu = r.cpu_mcores or 0
        mem = r.memory_bytes or 0
        if k in bucket:
            prev = bucket[k]
            bucket[k] = (prev[0] + cpu, prev[1] + mem)
        else:
            bucket[k] = (cpu, mem)
    points = [PodAggregatePoint(ts=ts, cpu_mcores=cpu, memory_bytes=mem) for ts, (cpu, mem) in sorted(bucket.items())]
    return PodAggregateSeries(
        has_metrics=bool(status.installed and status.healthy),
        namespace=namespace,
        pod=pod,
        points=points,
    )


@router.get(
    "/aggregate/namespace",
    response_model=NamespaceAggregateSeries,
    summary="Aggregate CPU/Memory usage across Pods in a Namespace",
)
async def aggregate_namespace(
    namespace: str = Query(..., description="Namespace"),
    window: str = Query(_WINDOW_DEFAULT, description="Time window: 10m,30m,1h,3h,6h,12h"),
    session: AsyncSession = Depends(get_session),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> NamespaceAggregateSeries:
    status = await service.get_metrics_server_status()
    minutes = _WINDOWS_ALLOWED.get(window, _WINDOWS_ALLOWED[_WINDOW_DEFAULT])
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(minutes=minutes)

    stmt = (
        select(ContainerMetric)
        .where(
            ContainerMetric.namespace == namespace,
            ContainerMetric.ts >= since,
        )
        .order_by(ContainerMetric.ts.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    bucket: dict[datetime, tuple[int, int]] = {}
    for r in rows:
        k = r.ts
        cpu = r.cpu_mcores or 0
        mem = r.memory_bytes or 0
        if k in bucket:
            prev = bucket[k]
            bucket[k] = (prev[0] + cpu, prev[1] + mem)
        else:
            bucket[k] = (cpu, mem)
    points = [PodAggregatePoint(ts=ts, cpu_mcores=cpu, memory_bytes=mem) for ts, (cpu, mem) in sorted(bucket.items())]
    return NamespaceAggregateSeries(
        has_metrics=bool(status.installed and status.healthy),
        namespace=namespace,
        points=points,
    )
