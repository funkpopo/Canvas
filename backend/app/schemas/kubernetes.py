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


class NodeAddress(BaseModel):
    type: str
    address: str


class NodeTaint(BaseModel):
    key: str
    value: str | None = None
    effect: str


class NodeInfo(BaseModel):
    os_image: str | None = None
    kernel_version: str | None = None
    kubelet_version: str | None = None
    kube_proxy_version: str | None = None
    container_runtime_version: str | None = None
    operating_system: str | None = None
    architecture: str | None = None


class NodeCapacity(BaseModel):
    cpu_mcores: int | None = None
    memory_bytes: int | None = None
    pods: int | None = None
    ephemeral_storage_bytes: int | None = None


class NodeDetail(BaseModel):
    name: str
    schedulable: bool
    created_at: datetime | None = None
    uptime_seconds: int | None = None
    status: Literal["Ready", "NotReady", "Unknown"]
    conditions: list[dict]
    labels: dict[str, str] = Field(default_factory=dict)
    taints: list[NodeTaint] = Field(default_factory=list)
    addresses: list[NodeAddress] = Field(default_factory=list)
    node_info: NodeInfo
    allocatable: NodeCapacity
    capacity: NodeCapacity
    images: list[str] = Field(default_factory=list)


class NodePodSummary(BaseModel):
    namespace: str
    name: str
    phase: str
    restarts: int
    containers: list[str]


class NodeMetrics(BaseModel):
    has_metrics: bool = False
    cpu_mcores_total: int | None = None
    cpu_mcores_used: int | None = None
    cpu_percent: float | None = None
    memory_bytes_total: int | None = None
    memory_bytes_used: int | None = None
    memory_percent: float | None = None


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


class NodeMetricPoint(BaseModel):
    ts: datetime
    cpu_mcores: int
    memory_bytes: int


class NodeMetricSeries(BaseModel):
    has_metrics: bool = False
    node: str
    points: list[NodeMetricPoint]


class OperationResult(BaseModel):
    ok: bool
    message: str | None = None


class YamlContent(BaseModel):
    yaml: str


# Storage management
class StorageClassSummary(BaseModel):
    name: str
    provisioner: str | None = None
    reclaim_policy: str | None = None
    volume_binding_mode: str | None = None
    allow_volume_expansion: bool | None = None
    parameters: dict[str, str] = Field(default_factory=dict)
    created_at: datetime | None = None


class StorageClassCreate(BaseModel):
    name: str
    provisioner: str
    reclaim_policy: str | None = None
    volume_binding_mode: str | None = None
    allow_volume_expansion: bool | None = None
    parameters: dict[str, str] = Field(default_factory=dict)
    # Extended fields for advanced provisioning
    sc_type: Literal["Generic", "NFS"] = "Generic"
    namespace: str | None = None
    # NFS-specific fields
    nfs_server: str | None = None
    nfs_path: str | None = None
    nfs_capacity: str | None = None
    # StorageClass mountOptions
    mount_options: list[str] = Field(default_factory=list)
    # Image source for NFS client provisioner
    image_source: Literal["public", "private"] | None = None
    private_image: str | None = None


class PersistentVolumeClaimSummary(BaseModel):
    namespace: str
    name: str
    status: str | None = None
    storage_class: str | None = None
    capacity: str | None = None
    access_modes: list[str] = Field(default_factory=list)
    volume_name: str | None = None
    created_at: datetime | None = None


class VolumeFileEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    permissions: str | None = None
    size: int | None = None
    mtime: str | None = None


class FileContent(BaseModel):
    path: str
    base64_data: str
