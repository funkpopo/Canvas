from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ClusterOverview(BaseModel):
    cluster_name: str = Field(default="unknown")
    kubernetes_version: str
    node_count: int
    ready_nodes: int
    namespace_count: int
    total_pods: int
    healthy_pods: int
    pending_pods: int
    failing_pods: int
    generated_at: datetime


class NodeSummary(BaseModel):
    name: str
    status: Literal["Ready", "NotReady", "Unknown"]
    roles: list[str]
    cpu_allocatable: str
    memory_allocatable: str
    cpu_usage: float | None = None
    memory_usage: float | None = None
    age: str | None = None


class NamespaceSummary(BaseModel):
    name: str
    status: Literal["Active", "Terminating", "Unknown"]
    resource_quota: dict[str, str] | None = None
    labels: dict[str, str] = Field(default_factory=dict)


class WorkloadSummary(BaseModel):
    name: str
    namespace: str
    kind: Literal["Deployment", "StatefulSet", "DaemonSet", "CronJob", "Job"]
    replicas_desired: int | None = None
    replicas_ready: int | None = None
    version: str | None = None
    status: Literal["Healthy", "Degraded", "Warning", "Unknown"] = "Unknown"
    updated_at: datetime | None = None


class EventMessage(BaseModel):
    type: str
    reason: str
    message: str
    involved_object: str
    namespace: str | None = None
    timestamp: datetime


class MetricsServerStatus(BaseModel):
    installed: bool
    healthy: bool
    message: str | None = None


class ClusterCapacityMetrics(BaseModel):
    has_metrics: bool = False
    cpu_total_mcores: int | None = None
    cpu_used_mcores: int | None = None
    cpu_percent: float | None = None
    memory_total_bytes: int | None = None
    memory_used_bytes: int | None = None
    memory_percent: float | None = None


class ClusterStorageSummary(BaseModel):
    """Summary of PVC/PV across the cluster.

    - pvc_by_status keys typically: Bound, Pending, Lost
    - pv_by_phase keys typically: Available, Bound, Released, Failed
    """
    pvc_total: int
    pvc_by_status: dict[str, int]
    pvc_by_namespace: dict[str, int]
    pv_total: int
    pv_by_phase: dict[str, int]


class PodWithContainers(BaseModel):
    name: str
    containers: list[str]


class ContainerMetricPoint(BaseModel):
    ts: datetime
    cpu_mcores: int
    memory_bytes: int


class ContainerMetricSeries(BaseModel):
    has_metrics: bool = False
    namespace: str
    pod: str
    container: str
    points: list[ContainerMetricPoint]
