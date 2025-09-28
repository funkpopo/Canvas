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
