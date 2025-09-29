from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import structlog
import yaml
from cachetools import TTLCache
from kubernetes import client, config
from kubernetes.stream import stream
from kubernetes.client import ApiClient
from kubernetes.config.config_exception import ConfigException

from app.config import Settings, get_settings
from app.core.rate_limiter import RateLimiter
from app.models.cluster_config import ClusterConfig
from app.schemas.kubernetes import (
    ClusterOverview,
    EventMessage,
    NamespaceSummary,
    NodeSummary,
    NodeDetail,
    NodeTaint,
    NodeAddress,
    NodeInfo,
    NodeCapacity,
    NodePodSummary,
    NodeMetrics,
    MetricsServerStatus,
    ClusterCapacityMetrics,
    WorkloadSummary,
    ClusterStorageSummary,
    StorageClassSummary,
    StorageClassCreate,
    PersistentVolumeClaimSummary,
    VolumeFileEntry,
    FileContent,
    PodSummary,
    PodDetail,
    ContainerStatus,
    ServiceSummary,
    ServicePort,
)
from app.services.cluster_config import ClusterConfigService

logger = structlog.get_logger(__name__)


class KubernetesService:
    """Thin async wrapper around the Kubernetes Python client."""

    def __init__(
        self,
        settings: Settings | None = None,
        cluster_config_service: ClusterConfigService | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._cluster_config_service = cluster_config_service
        self._cache = TTLCache(maxsize=128, ttl=self.settings.cache_ttl_seconds)
        self._cache_lock = asyncio.Lock()
        self._client_lock = asyncio.Lock()
        self._api_client: ApiClient | None = None
        self._core_v1: client.CoreV1Api | None = None
        self._apps_v1: client.AppsV1Api | None = None
        self._rate_limiter = RateLimiter(self.settings.rate_limit_requests_per_minute)
        self._cluster_display_name = self.settings.kube_context or "default"

    async def get_cluster_overview(self) -> ClusterOverview:
        async def _fetch() -> ClusterOverview:
            await self._rate_limiter.acquire()
            try:
                core_v1, _ = await self._ensure_clients()

                def _collect() -> tuple[Any, Any, Any, Any]:
                    version_api = client.VersionApi(self._api_client)
                    version_info = version_api.get_code()
                    nodes = core_v1.list_node().items
                    pods = core_v1.list_pod_for_all_namespaces(limit=500).items
                    namespaces = core_v1.list_namespace().items
                    return version_info, nodes, pods, namespaces

                version_info, nodes, pods, namespaces = await asyncio.to_thread(_collect)

                ready_nodes = sum(
                    1
                    for node in nodes
                    if any(
                        condition.type == "Ready" and condition.status == "True"
                        for condition in node.status.conditions or []
                    )
                )
                pending_pods = sum(1 for pod in pods if pod.status.phase == "Pending")
                failing_pods = sum(1 for pod in pods if pod.status.phase == "Failed")
                healthy_pods = sum(1 for pod in pods if pod.status.phase == "Running")

                return ClusterOverview(
                    cluster_name=self._cluster_display_name,
                    kubernetes_version=getattr(version_info, "git_version", "unknown"),
                    node_count=len(nodes),
                    ready_nodes=ready_nodes,
                    namespace_count=len(namespaces),
                    total_pods=len(pods),
                    healthy_pods=healthy_pods,
                    pending_pods=pending_pods,
                    failing_pods=failing_pods,
                    generated_at=datetime.now(tz=timezone.utc),
                )
            except Exception as exc:  # pragma: no cover - best effort fallback
                logger.warning("kubernetes.overview_fallback", error=str(exc))
                return ClusterOverview(
                    cluster_name=self._cluster_display_name or "unconfigured",
                    kubernetes_version="unknown",
                    node_count=0,
                    ready_nodes=0,
                    namespace_count=0,
                    total_pods=0,
                    healthy_pods=0,
                    pending_pods=0,
                    failing_pods=0,
                    generated_at=datetime.now(tz=timezone.utc),
                )

        return await self._cached("cluster_overview", _fetch)

    async def list_nodes(self) -> list[NodeSummary]:
        async def _fetch() -> list[NodeSummary]:
            await self._rate_limiter.acquire()
            try:
                core_v1, _ = await self._ensure_clients()

                def _collect() -> list[NodeSummary]:
                    nodes = core_v1.list_node().items
                    summaries: list[NodeSummary] = []
                    for node in nodes:
                        labels = node.metadata.labels or {}
                        spec = getattr(node, "spec", None)
                        schedulable = not bool(getattr(spec, "unschedulable", False)) if spec else True
                        labelled_roles = [
                            label.replace("node-role.kubernetes.io/", "")
                            for label in labels
                            if label.startswith("node-role.kubernetes.io/")
                        ]
                        if not labelled_roles:
                            role_label = labels.get("kubernetes.io/role", "worker")
                            labelled_roles = [part.strip() for part in role_label.split(",") if part]

                        conditions = node.status.conditions or []
                        status = "Unknown"
                        for condition in conditions:
                            if condition.type == "Ready":
                                status = "Ready" if condition.status == "True" else "NotReady"
                                break

                        allocatable = node.status.allocatable or {}
                        cpu_allocatable = allocatable.get("cpu", "0")
                        memory_allocatable = allocatable.get("memory", "0")

                        summaries.append(
                            NodeSummary(
                                name=node.metadata.name,
                                status=status,
                                roles=labelled_roles or ["worker"],
                                cpu_allocatable=cpu_allocatable,
                                memory_allocatable=memory_allocatable,
                                cpu_usage=None,
                                memory_usage=None,
                                age=None,
                                schedulable=schedulable,
                            )
                        )
                    return summaries

                return await asyncio.to_thread(_collect)
            except Exception as exc:  # pragma: no cover
                logger.warning("kubernetes.list_nodes_fallback", error=str(exc))
                return []

        return await self._cached("nodes", _fetch)

    async def get_node_detail(self, name: str) -> NodeDetail:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _load() -> NodeDetail:
                node = core_v1.read_node(name=name)
                md = node.metadata or None
                spec = node.spec or None
                status = node.status or None

                labels = (md.labels or {}) if md else {}
                schedulable = not bool(getattr(spec, "unschedulable", False)) if spec else True
                created = getattr(md, "creation_timestamp", None)
                created_at = created if created else None
                uptime = None
                if created_at:
                    try:
                        uptime = int((datetime.now(tz=timezone.utc) - created_at).total_seconds())
                    except Exception:
                        uptime = None

                conds = []
                ready_status = "Unknown"
                for c in (getattr(status, "conditions", None) or []):
                    d = {
                        "type": getattr(c, "type", None),
                        "status": getattr(c, "status", None),
                        "last_transition_time": getattr(c, "last_transition_time", None),
                        "reason": getattr(c, "reason", None),
                        "message": getattr(c, "message", None),
                    }
                    conds.append(d)
                    if d["type"] == "Ready":
                        ready_status = "Ready" if d["status"] == "True" else "NotReady"

                taints: list[NodeTaint] = []
                for t in (getattr(spec, "taints", None) or []):
                    taints.append(
                        NodeTaint(
                            key=getattr(t, "key", ""),
                            value=getattr(t, "value", None),
                            effect=getattr(t, "effect", ""),
                        )
                    )

                addresses: list[NodeAddress] = []
                for a in (getattr(status, "addresses", None) or []):
                    addresses.append(NodeAddress(type=getattr(a, "type", ""), address=getattr(a, "address", "")))

                ni = getattr(status, "node_info", None)
                info = NodeInfo(
                    os_image=getattr(ni, "os_image", None),
                    kernel_version=getattr(ni, "kernel_version", None),
                    kubelet_version=getattr(ni, "kubelet_version", None),
                    kube_proxy_version=getattr(ni, "kube_proxy_version", None),
                    container_runtime_version=getattr(ni, "container_runtime_version", None),
                    operating_system=getattr(ni, "operating_system", None),
                    architecture=getattr(ni, "architecture", None),
                )

                alloc = getattr(status, "allocatable", None) or {}
                cap = getattr(status, "capacity", None) or {}

                alloc_cap = NodeCapacity(
                    cpu_mcores=self._parse_cpu_to_mcores(alloc.get("cpu")),
                    memory_bytes=self._parse_memory_to_bytes(alloc.get("memory")),
                    pods=int(alloc.get("pods", 0)) if str(alloc.get("pods", "")).isdigit() else None,
                    ephemeral_storage_bytes=self._parse_memory_to_bytes(alloc.get("ephemeral-storage")),
                )
                cap_cap = NodeCapacity(
                    cpu_mcores=self._parse_cpu_to_mcores(cap.get("cpu")),
                    memory_bytes=self._parse_memory_to_bytes(cap.get("memory")),
                    pods=int(cap.get("pods", 0)) if str(cap.get("pods", "")).isdigit() else None,
                    ephemeral_storage_bytes=self._parse_memory_to_bytes(cap.get("ephemeral-storage")),
                )

                images: list[str] = []
                for im in (getattr(status, "images", None) or []):
                    # Aggregate names (first name typically has full repo:tag)
                    names = getattr(im, "names", None) or []
                    if names:
                        images.append(str(names[0]))

                return NodeDetail(
                    name=str(getattr(md, "name", name)),
                    schedulable=schedulable,
                    created_at=created_at,
                    uptime_seconds=uptime,
                    status=ready_status,  # type: ignore[arg-type]
                    conditions=conds,
                    labels=labels,
                    taints=taints,
                    addresses=addresses,
                    node_info=info,
                    allocatable=alloc_cap,
                    capacity=cap_cap,
                    images=images,
                )

            return await asyncio.to_thread(_load)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_node_detail_error", error=str(exc))
            # best-effort minimal response
            return NodeDetail(
                name=name,
                schedulable=True,
                created_at=None,
                uptime_seconds=None,
                status="Unknown",
                conditions=[],
                labels={},
                taints=[],
                addresses=[],
                node_info=NodeInfo(),
                allocatable=NodeCapacity(),
                capacity=NodeCapacity(),
                images=[],
            )

    async def list_node_events(self, name: str) -> list[EventMessage]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[EventMessage]:
                try:
                    events = core_v1.list_event_for_all_namespaces(
                        field_selector=f"involvedObject.kind=Node,involvedObject.name={name}", limit=100
                    ).items
                except Exception:
                    events = []
                results: list[EventMessage] = []
                for e in events:
                    involved_ref = f"Node/{name}"
                    ts = getattr(e, "last_timestamp", None) or getattr(e, "event_time", None) or datetime.now(tz=timezone.utc)
                    results.append(
                        EventMessage(
                            type=getattr(e, "type", None) or "Normal",
                            reason=getattr(e, "reason", None) or "",
                            message=getattr(e, "message", None) or "",
                            involved_object=involved_ref,
                            namespace=(e.metadata.namespace if getattr(e, "metadata", None) else None),
                            timestamp=ts,
                        )
                    )
                results.sort(key=lambda x: x.timestamp, reverse=True)
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.node_events_error", error=str(exc))
            return []

    async def list_pods_on_node(self, name: str) -> list[NodePodSummary]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[NodePodSummary]:
                pods = core_v1.list_pod_for_all_namespaces(field_selector=f"spec.nodeName={name}", limit=1000).items
                items: list[NodePodSummary] = []
                for pod in pods:
                    meta = pod.metadata
                    st = pod.status
                    ns = meta.namespace if meta else "default"
                    nm = meta.name if meta else ""
                    phase = getattr(st, "phase", None) or "Unknown"
                    restarts = 0
                    try:
                        for cs in getattr(st, "container_statuses", None) or []:
                            restarts += int(getattr(cs, "restart_count", 0))
                    except Exception:
                        restarts = 0
                    containers: list[str] = []
                    try:
                        for c in (pod.spec.containers or []):  # type: ignore[attr-defined]
                            containers.append(c.name)
                    except Exception:
                        pass
                    items.append(NodePodSummary(namespace=ns, name=nm, phase=str(phase), restarts=restarts, containers=containers))
                return items

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_on_node_error", error=str(exc))
            return []

    async def get_node_metrics(self, name: str) -> NodeMetrics:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _alloc() -> tuple[int | None, int | None]:
                node = core_v1.read_node(name=name)
                alloc = node.status.allocatable or {}
                return self._parse_cpu_to_mcores(alloc.get("cpu")) or None, self._parse_memory_to_bytes(alloc.get("memory")) or None

            total_cpu_m, total_mem_b = await asyncio.to_thread(_alloc)

            used_cpu_m: int | None = None
            used_mem_b: int | None = None
            has_metrics = False

            try:
                co = client.CustomObjectsApi(self._api_client)

                def _read() -> tuple[int | None, int | None, bool]:
                    try:
                        data = co.list_cluster_custom_object(group="metrics.k8s.io", version="v1beta1", plural="nodes")
                        for it in (data.get("items", []) if isinstance(data, dict) else []):
                            meta = it.get("metadata", {}) if isinstance(it, dict) else {}
                            if str(meta.get("name")) == name:
                                usage = it.get("usage", {}) if isinstance(it, dict) else {}
                                cpu_m = self._parse_cpu_to_mcores(usage.get("cpu"))
                                mem_b = self._parse_memory_to_bytes(usage.get("memory"))
                                return int(cpu_m), int(mem_b), True
                        return None, None, False
                    except Exception:
                        return None, None, False

                used_cpu_m, used_mem_b, has_metrics = await asyncio.to_thread(_read)
            except Exception:
                has_metrics = False

            cpu_pct = None
            mem_pct = None
            if has_metrics and total_cpu_m and used_cpu_m is not None and total_cpu_m > 0:
                cpu_pct = max(0.0, min(100.0, (used_cpu_m / total_cpu_m) * 100.0))
            if has_metrics and total_mem_b and used_mem_b is not None and total_mem_b > 0:
                mem_pct = max(0.0, min(100.0, (used_mem_b / total_mem_b) * 100.0))

            return NodeMetrics(
                has_metrics=has_metrics,
                cpu_mcores_total=total_cpu_m,
                cpu_mcores_used=used_cpu_m,
                cpu_percent=cpu_pct,
                memory_bytes_total=total_mem_b,
                memory_bytes_used=used_mem_b,
                memory_percent=mem_pct,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.node_metrics_error", error=str(exc))
            return NodeMetrics(has_metrics=False)

    async def set_node_schedulable(self, name: str, schedulable: bool) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                body = {"spec": {"unschedulable": (not bool(schedulable))}}
                core_v1.patch_node(name=name, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.set_node_schedulable_error", error=str(exc))
            return False, str(exc)

    async def drain_node(self, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                # Cordon
                core_v1.patch_node(name=name, body={"spec": {"unschedulable": True}})

                pods = core_v1.list_pod_for_all_namespaces(field_selector=f"spec.nodeName={name}", limit=2000).items

                def _is_daemonset_owned(p) -> bool:
                    try:
                        for o in (p.metadata.owner_references or []):
                            if getattr(o, "kind", None) == "DaemonSet":
                                return True
                    except Exception:
                        return False
                    return False

                def _is_mirror_pod(p) -> bool:
                    try:
                        anns = p.metadata.annotations or {}
                        return "kubernetes.io/config.mirror" in anns
                    except Exception:
                        return False

                # Evict all except DaemonSet/mirror pods
                from kubernetes.client import V1ObjectMeta
                from kubernetes.client import V1Eviction  # type: ignore[attr-defined]
                from kubernetes.client import PolicyV1Api

                pol = PolicyV1Api(core_v1.api_client)
                for p in pods:
                    if _is_daemonset_owned(p) or _is_mirror_pod(p):
                        continue
                    nm = p.metadata.name
                    ns = p.metadata.namespace
                    try:
                        body = {
                            "apiVersion": "policy/v1",
                            "kind": "Eviction",
                            "metadata": {"name": nm, "namespace": ns},
                        }
                        pol.create_namespaced_pod_eviction(name=nm, namespace=ns, body=body)  # type: ignore[arg-type]
                    except Exception:
                        # Fallback delete with grace period
                        try:
                            core_v1.delete_namespaced_pod(name=nm, namespace=ns, grace_period_seconds=30)
                        except Exception:
                            # ignore
                            pass

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.drain_node_error", error=str(exc))
            return False, str(exc)

    async def get_node_yaml(self, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> str:
                node = core_v1.read_node(name=name)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(node)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_node_yaml_error", error=str(exc))
            return None

    async def apply_node_yaml(self, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                try:
                    obj = yaml.safe_load(yaml_text) or {}
                except Exception as exc:  # noqa: BLE001
                    raise RuntimeError(f"Invalid YAML: {exc}")
                if not isinstance(obj, dict):
                    raise RuntimeError("YAML must be a mapping")
                kind = obj.get("kind")
                meta = obj.get("metadata", {}) if isinstance(obj, dict) else {}
                nm = meta.get("name") if isinstance(meta, dict) else None
                if kind and str(kind) != "Node":
                    raise RuntimeError("YAML kind must be Node")
                if nm and str(nm) != name:
                    raise RuntimeError("YAML metadata.name must match path name")
                # Patch node
                core_v1.patch_node(name=name, body=obj)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.apply_node_yaml_error", error=str(exc))
            return False, str(exc)

    async def patch_node_labels(self, name: str, labels: dict[str, str]) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                body = {"metadata": {"labels": labels}}
                core_v1.patch_node(name=name, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.patch_node_labels_error", error=str(exc))
            return False, str(exc)

    async def delete_node(self, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                core_v1.delete_node(name=name)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.delete_node_error", error=str(exc))
            return False, str(exc)

    async def list_namespaces(self) -> list[NamespaceSummary]:
        async def _fetch() -> list[NamespaceSummary]:
            await self._rate_limiter.acquire()
            try:
                core_v1, _ = await self._ensure_clients()

                def _collect() -> list[NamespaceSummary]:
                    namespaces = core_v1.list_namespace().items
                    return [
                        NamespaceSummary(
                            name=ns.metadata.name,
                            status=(ns.status.phase or "Active"),  # type: ignore[arg-type]
                            resource_quota=None,
                            labels=ns.metadata.labels or {},
                        )
                        for ns in namespaces
                    ]

                return await asyncio.to_thread(_collect)
            except Exception as exc:  # pragma: no cover
                logger.warning("kubernetes.list_namespaces_fallback", error=str(exc))
                return []

        return await self._cached("namespaces", _fetch)

    async def create_namespace(self, name: str, labels: dict[str, str] | None = None) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                body = {"metadata": {"name": name, "labels": labels or {}}}
                core_v1.create_namespace(body=body)  # type: ignore[arg-type]

            await asyncio.to_thread(_do)
            # Bust cache for namespaces
            await self._set_cached("namespaces", None)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.create_namespace_error", error=str(exc))
            return False, str(exc)

    async def delete_namespace(self, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                core_v1.delete_namespace(name=name)

            await asyncio.to_thread(_do)
            await self._set_cached("namespaces", None)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.delete_namespace_error", error=str(exc))
            return False, str(exc)

    async def list_workloads(self) -> list[WorkloadSummary]:
        async def _fetch() -> list[WorkloadSummary]:
            await self._rate_limiter.acquire()
            try:
                _, apps_v1 = await self._ensure_clients()

                def _collect() -> list[WorkloadSummary]:
                    deployments = apps_v1.list_deployment_for_all_namespaces(limit=100).items
                    items: list[WorkloadSummary] = []
                    for deployment in deployments:
                        status = deployment.status
                        ready = status.ready_replicas or 0
                        desired = status.replicas or 0
                        items.append(
                            WorkloadSummary(
                                name=deployment.metadata.name,
                                namespace=deployment.metadata.namespace,
                                kind="Deployment",
                                replicas_desired=desired,
                                replicas_ready=ready,
                                version=(
                                    deployment.metadata.annotations.get("deployment.kubernetes.io/revision")
                                    if deployment.metadata.annotations
                                    else None
                                ),
                                status="Healthy" if ready == desired else "Warning",
                                updated_at=datetime.now(tz=timezone.utc),
                            )
                        )
                    return items

                return await asyncio.to_thread(_collect)
            except Exception as exc:  # pragma: no cover
                logger.warning("kubernetes.list_workloads_fallback", error=str(exc))
                return []

        return await self._cached("workloads", _fetch)

    async def get_storage_summary(self) -> ClusterStorageSummary:
        async def _fetch() -> ClusterStorageSummary:
            await self._rate_limiter.acquire()
            try:
                core_v1, _ = await self._ensure_clients()

                def _collect() -> ClusterStorageSummary:
                    pvc_list = core_v1.list_persistent_volume_claim_for_all_namespaces(limit=1000).items
                    pv_list = core_v1.list_persistent_volume().items

                    pvc_by_status: dict[str, int] = {}
                    pvc_by_namespace: dict[str, int] = {}
                    for pvc in pvc_list:
                        status = (pvc.status.phase or "Unknown") if pvc.status else "Unknown"
                        pvc_by_status[status] = pvc_by_status.get(status, 0) + 1
                        ns = pvc.metadata.namespace if pvc.metadata else "default"
                        pvc_by_namespace[ns] = pvc_by_namespace.get(ns, 0) + 1

                    pv_by_phase: dict[str, int] = {}
                    for pv in pv_list:
                        phase = (pv.status.phase or "Unknown") if pv.status else "Unknown"
                        pv_by_phase[phase] = pv_by_phase.get(phase, 0) + 1

                    return ClusterStorageSummary(
                        pvc_total=len(pvc_list),
                        pvc_by_status=pvc_by_status,
                        pvc_by_namespace=pvc_by_namespace,
                        pv_total=len(pv_list),
                        pv_by_phase=pv_by_phase,
                    )

                return await asyncio.to_thread(_collect)
            except Exception as exc:  # pragma: no cover
                logger.warning("kubernetes.storage_summary_error", error=str(exc))
                return ClusterStorageSummary(
                    pvc_total=0,
                    pvc_by_status={},
                    pvc_by_namespace={},
                    pv_total=0,
                    pv_by_phase={},
                )

        return await self._cached("storage_summary", _fetch)

    async def list_storage_classes(self) -> list[StorageClassSummary]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            storage_v1 = client.StorageV1Api(self._api_client)

            def _collect() -> list[StorageClassSummary]:
                try:
                    classes = storage_v1.list_storage_class().items
                except Exception:
                    classes = []
                items: list[StorageClassSummary] = []
                for sc in classes:
                    md = getattr(sc, "metadata", None)
                    params = getattr(sc, "parameters", None) or {}
                    items.append(
                        StorageClassSummary(
                            name=getattr(md, "name", ""),
                            provisioner=getattr(sc, "provisioner", None),
                            reclaim_policy=getattr(sc, "reclaim_policy", None),
                            volume_binding_mode=getattr(sc, "volume_binding_mode", None),
                            allow_volume_expansion=getattr(sc, "allow_volume_expansion", None),
                            parameters={str(k): str(v) for k, v in params.items()} if isinstance(params, dict) else {},
                            created_at=getattr(md, "creation_timestamp", None),
                        )
                    )
                return items

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_storage_classes_error", error=str(exc))
            return []

    async def create_storage_class(self, spec: StorageClassCreate) -> tuple[bool, str | None]:
        """Create a StorageClass. If sc_type == NFS, also install an NFS client provisioner in the selected namespace.

        - Supports mount_options on the StorageClass
        - For NFS type, accepts nfs_server, nfs_path, image_source/private_image, and optional nfs_capacity (stored as parameter)
        """
        await self._rate_limiter.acquire()
        try:
            if getattr(spec, "sc_type", "Generic") == "NFS":
                return await self._create_nfs_storage_class(spec)

            await self._ensure_clients()
            storage_v1 = client.StorageV1Api(self._api_client)

            def _do() -> None:
                body = client.V1StorageClass(
                    metadata=client.V1ObjectMeta(name=spec.name),
                    provisioner=spec.provisioner,
                    reclaim_policy=spec.reclaim_policy,
                    volume_binding_mode=spec.volume_binding_mode,
                    allow_volume_expansion=spec.allow_volume_expansion,
                    parameters=spec.parameters or {},
                    mount_options=(spec.mount_options or None),
                )
                storage_v1.create_storage_class(body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.create_storage_class_error", error=str(exc))
            return False, str(exc)

    async def _create_nfs_storage_class(self, spec: StorageClassCreate) -> tuple[bool, str | None]:
        """Install NFS client provisioner and create the StorageClass.

        This uses a minimal manifest for the eipwork/nfs-client-provisioner image, installing:
          - SA/Role/RoleBinding/ClusterRole/ClusterRoleBinding
          - Deployment in the target namespace
          - StorageClass with the generated or provided provisioner name
        """
        await self._ensure_clients()

        from kubernetes.utils import create_from_yaml
        import tempfile

        ns = spec.namespace or "default"
        image = (
            spec.private_image.strip() if (spec.image_source == "private" and spec.private_image) else "eipwork/nfs-client-provisioner:latest"
        )
        prov_name = spec.provisioner or f"{ns}.nfs-client-provisioner"

        # Merge parameters and append optional declared capacity for visibility
        params = dict(spec.parameters or {})
        if getattr(spec, "nfs_capacity", None):
            params.setdefault("nfs.capacity", str(spec.nfs_capacity))
        # Always disable archive to avoid surprise, can be changed later by editing SC
        params.setdefault("archiveOnDelete", "false")

        # Build manifest docs
        docs: list[dict] = [
            {
                "apiVersion": "v1",
                "kind": "ServiceAccount",
                "metadata": {"name": "nfs-client-provisioner", "namespace": ns},
            },
            {
                "apiVersion": "rbac.authorization.k8s.io/v1",
                "kind": "ClusterRole",
                "metadata": {"name": "nfs-client-provisioner-runner"},
                "rules": [
                    {"apiGroups": [""], "resources": ["persistentvolumes"], "verbs": ["get", "list", "watch", "create", "delete"]},
                    {"apiGroups": [""], "resources": ["persistentvolumeclaims"], "verbs": ["get", "list", "watch", "update"]},
                    {"apiGroups": ["storage.k8s.io"], "resources": ["storageclasses"], "verbs": ["get", "list", "watch"]},
                    {"apiGroups": [""], "resources": ["events"], "verbs": ["list", "watch", "create", "update", "patch"]},
                    {"apiGroups": ["storage.k8s.io"], "resources": ["volumeattachments"], "verbs": ["get", "list", "watch"]},
                ],
            },
            {
                "apiVersion": "rbac.authorization.k8s.io/v1",
                "kind": "ClusterRoleBinding",
                "metadata": {"name": "run-nfs-client-provisioner"},
                "subjects": [
                    {"kind": "ServiceAccount", "name": "nfs-client-provisioner", "namespace": ns}
                ],
                "roleRef": {"kind": "ClusterRole", "name": "nfs-client-provisioner-runner", "apiGroup": "rbac.authorization.k8s.io"},
            },
            {
                "apiVersion": "rbac.authorization.k8s.io/v1",
                "kind": "Role",
                "metadata": {"name": "leader-locking-nfs-client-provisioner", "namespace": ns},
                "rules": [
                    {"apiGroups": [""], "resources": ["endpoints"], "verbs": ["get", "list", "watch", "create", "update", "patch"]}
                ],
            },
            {
                "apiVersion": "rbac.authorization.k8s.io/v1",
                "kind": "RoleBinding",
                "metadata": {"name": "leader-locking-nfs-client-provisioner", "namespace": ns},
                "subjects": [
                    {"kind": "ServiceAccount", "name": "nfs-client-provisioner", "namespace": ns}
                ],
                "roleRef": {"kind": "Role", "name": "leader-locking-nfs-client-provisioner", "apiGroup": "rbac.authorization.k8s.io"},
            },
            {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "nfs-client-provisioner", "namespace": ns},
                "spec": {
                    "replicas": 1,
                    "strategy": {"type": "Recreate"},
                    "selector": {"matchLabels": {"app": "nfs-client-provisioner"}},
                    "template": {
                        "metadata": {"labels": {"app": "nfs-client-provisioner"}},
                        "spec": {
                            "serviceAccountName": "nfs-client-provisioner",
                            "containers": [
                                {
                                    "name": "nfs-client-provisioner",
                                    "image": image,
                                    "imagePullPolicy": "IfNotPresent",
                                    "env": [
                                        {"name": "PROVISIONER_NAME", "value": prov_name},
                                        {"name": "NFS_SERVER", "value": spec.nfs_server or ""},
                                        {"name": "NFS_PATH", "value": spec.nfs_path or ""},
                                    ],
                                    "volumeMounts": [
                                        {"name": "nfs-client-root", "mountPath": "/persistentvolumes"}
                                    ],
                                }
                            ],
                            "volumes": [
                                {
                                    "name": "nfs-client-root",
                                    "nfs": {"server": spec.nfs_server or "", "path": spec.nfs_path or ""},
                                }
                            ],
                        },
                    },
                },
            },
            {
                "apiVersion": "storage.k8s.io/v1",
                "kind": "StorageClass",
                "metadata": {"name": spec.name},
                "provisioner": prov_name,
                "parameters": params,
                **({"reclaimPolicy": spec.reclaim_policy} if spec.reclaim_policy else {}),
                **({"volumeBindingMode": spec.volume_binding_mode} if spec.volume_binding_mode else {}),
                **({"allowVolumeExpansion": bool(spec.allow_volume_expansion)} if spec.allow_volume_expansion is not None else {}),
                **({"mountOptions": list(spec.mount_options)} if (getattr(spec, "mount_options", None)) else {}),
            },
        ]

        def _apply() -> None:
            with tempfile.NamedTemporaryFile("w+", suffix=".yaml", delete=True) as tf:
                yaml.safe_dump_all(docs, tf)
                tf.flush()
                try:
                    create_from_yaml(self._api_client, tf.name, verbose=False)
                except Exception:
                    # Some resources might already exist; proceed best-effort
                    pass

        try:
            await asyncio.to_thread(_apply)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.create_nfs_storage_class_error", error=str(exc))
            return False, str(exc)

    async def delete_storage_class(self, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            storage_v1 = client.StorageV1Api(self._api_client)

            def _do() -> None:
                storage_v1.delete_storage_class(name=name)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.delete_storage_class_error", error=str(exc))
            return False, str(exc)

    async def list_pvcs(self, namespace: str | None = None) -> list[PersistentVolumeClaimSummary]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[PersistentVolumeClaimSummary]:
                if namespace and namespace != "all":
                    pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace=namespace, limit=1000).items
                else:
                    pvcs = core_v1.list_persistent_volume_claim_for_all_namespaces(limit=1000).items
                items: list[PersistentVolumeClaimSummary] = []
                for pvc in pvcs:
                    md = getattr(pvc, "metadata", None)
                    stat = getattr(pvc, "status", None)
                    spec = getattr(pvc, "spec", None)
                    cap = None
                    try:
                        capd = getattr(stat, "capacity", None) or {}
                        cap = str(capd.get("storage")) if capd else None
                    except Exception:
                        cap = None
                    access_modes = list(getattr(spec, "access_modes", []) or [])
                    items.append(
                        PersistentVolumeClaimSummary(
                            namespace=getattr(md, "namespace", "default"),
                            name=getattr(md, "name", ""),
                            status=(getattr(stat, "phase", None) or None),
                            storage_class=getattr(spec, "storage_class_name", None),
                            capacity=cap,
                            access_modes=[str(m) for m in access_modes],
                            volume_name=getattr(stat, "volume_name", None),
                            created_at=getattr(md, "creation_timestamp", None),
                        )
                    )
                return items

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pvcs_error", error=str(exc))
            return []

    async def _ensure_browser_pod(self, namespace: str, pvc: str) -> str:
        core_v1, _ = await self._ensure_clients()

        def _ensure() -> str:
            name = f"canvas-pvc-browse-{pvc[:40]}"
            try:
                pod = core_v1.read_namespaced_pod(name=name, namespace=namespace)
                phase = getattr(pod.status, "phase", None)
                if phase == "Running":
                    return name
            except Exception:
                # create it
                pass
            body = client.V1Pod(
                metadata=client.V1ObjectMeta(name=name, labels={"app": "canvas-pvc-browser"}),
                spec=client.V1PodSpec(
                    restart_policy="Never",
                    containers=[
                        client.V1Container(
                            name="sh",
                            image="busybox:1.36",
                            command=["sh", "-c", "sleep 43200"],
                            volume_mounts=[client.V1VolumeMount(name="data", mount_path="/data")],
                        )
                    ],
                    volumes=[client.V1Volume(name="data", persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(claim_name=pvc))],
                ),
            )
            try:
                core_v1.create_namespaced_pod(namespace=namespace, body=body)
            except Exception:
                # ignore if already exists or cannot create
                pass
            return name

        name = await asyncio.to_thread(_ensure)
        # Wait briefly for Running
        for _ in range(30):
            try:
                pod = core_v1.read_namespaced_pod(name=name, namespace=namespace)
                if getattr(pod.status, "phase", None) == "Running":
                    break
            except Exception:
                pass
            await asyncio.sleep(0.5)
        return name

    async def _exec_in_pod(self, namespace: str, pod: str, cmd: list[str]) -> str:
        core_v1, _ = await self._ensure_clients()
        return await asyncio.to_thread(
            lambda: stream(core_v1.connect_get_namespaced_pod_exec, pod, namespace, command=cmd, stderr=True, stdin=False, stdout=True, tty=False)
        )

    async def list_volume_path(self, namespace: str, pvc: str, path: str) -> list[VolumeFileEntry]:
        await self._rate_limiter.acquire()
        try:
            pod = await self._ensure_browser_pod(namespace, pvc)
            norm = "/" + path.strip("/") if path and path != "/" else "/"
            full = f"/data{norm}"
            out = await self._exec_in_pod(namespace, pod, ["sh", "-c", f"ls -al {full} || true"])
            entries: list[VolumeFileEntry] = []
            for line in out.splitlines():
                line = line.rstrip("\n")
                if not line or line.startswith("total "):
                    continue
                parts = line.split()
                if len(parts) < 6:
                    continue
                perm = parts[0]
                # busybox ls -al often: perms, links, user, group, size, mon, day, time|year, name
                try:
                    size = int(parts[4])
                except Exception:
                    size = None
                name = " ".join(parts[8:]) if len(parts) > 8 else parts[-1]
                if name in (".", ".."):
                    continue
                is_dir = perm.startswith("d")
                # crude mtime join
                mtime = None
                if len(parts) >= 8:
                    mtime = f"{parts[5]} {parts[6]} {parts[7]}"
                entries.append(
                    VolumeFileEntry(
                        name=name,
                        path=(norm.rstrip("/") + "/" + name).replace("//", "/"),
                        is_dir=is_dir,
                        permissions=perm,
                        size=size,
                        mtime=mtime,
                    )
                )
            # Sort: dirs first, then by name
            entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
            return entries
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_volume_path_error", error=str(exc))
            return []

    async def read_file_base64(self, namespace: str, pvc: str, path: str) -> FileContent | None:
        await self._rate_limiter.acquire()
        try:
            pod = await self._ensure_browser_pod(namespace, pvc)
            norm = "/" + path.strip("/") if path and path != "/" else "/"
            full = f"/data{norm}"
            out = await self._exec_in_pod(namespace, pod, ["sh", "-c", f"test -f {full} && base64 {full} || true"])
            if not out:
                return None
            return FileContent(path=path, base64_data=out.strip())
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.read_file_error", error=str(exc))
            return None

    async def write_file_base64(self, namespace: str, pvc: str, path: str, base64_data: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            pod = await self._ensure_browser_pod(namespace, pvc)
            norm = "/" + path.strip("/") if path and path != "/" else "/"
            full = f"/data{norm}"
            # Write via temp file
            safe_tmp = "/tmp/canvas_upload.b64"
            script = f"cat > {safe_tmp} << 'EOF'\n{base64_data}\nEOF\nbase64 -d {safe_tmp} > {full}\nrm -f {safe_tmp}"
            await self._exec_in_pod(namespace, pod, ["sh", "-c", script])
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.write_file_error", error=str(exc))
            return False, str(exc)

    async def rename_path(self, namespace: str, pvc: str, old_path: str, new_name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            pod = await self._ensure_browser_pod(namespace, pvc)
            norm = "/" + old_path.strip("/") if old_path and old_path != "/" else "/"
            parent = "/".join(norm.rstrip("/").split("/")[:-1]) or "/"
            src = f"/data{norm}"
            dst = f"/data{parent}/{new_name}".replace("//", "/")
            await self._exec_in_pod(namespace, pod, ["sh", "-c", f"mv {src} {dst} || true"])
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.rename_path_error", error=str(exc))
            return False, str(exc)

    async def stream_events(self) -> list[EventMessage]:
        async def _fetch() -> list[EventMessage]:
            await self._rate_limiter.acquire()
            try:
                core_v1, _ = await self._ensure_clients()

                def _collect() -> list[EventMessage]:
                    events = core_v1.list_event_for_all_namespaces(limit=50).items
                    messages: list[EventMessage] = []
                    for event in events:
                        involved = event.involved_object
                        involved_ref = (
                            f"{involved.kind}/{involved.name}" if involved else "system"
                        )
                        timestamp = (
                            event.last_timestamp
                            or event.event_time
                            or datetime.now(tz=timezone.utc)
                        )
                        messages.append(
                            EventMessage(
                                type=event.type or "Normal",
                                reason=event.reason or "Unknown",
                                message=event.message or "",
                                involved_object=involved_ref,
                                namespace=(event.metadata.namespace if event.metadata else None),
                                timestamp=timestamp,
                            )
                        )
                    messages.sort(key=lambda item: item.timestamp, reverse=True)
                    return messages

                return await asyncio.to_thread(_collect)
            except Exception as exc:  # pragma: no cover
                logger.warning("kubernetes.events_fallback", error=str(exc))
                return []

        return await self._cached("events", _fetch)

    async def invalidate(self) -> None:
        async with self._client_lock:
            api_client = self._api_client
            self._api_client = None
            self._core_v1 = None
            self._apps_v1 = None

        if api_client is not None:
            await asyncio.to_thread(api_client.close)

        async with self._cache_lock:
            self._cache.clear()

        self._cluster_display_name = self.settings.kube_context or "default"

    async def _cached(self, key: str, fetcher: Callable[[], Awaitable[Any]]) -> Any:
        async with self._cache_lock:
            if key in self._cache:
                return self._cache[key]

        result = await fetcher()

        async with self._cache_lock:
            self._cache[key] = result

        return result

    async def _set_cached(self, key: str, value: Any | None) -> None:
        async with self._cache_lock:
            if value is None:
                try:
                    del self._cache[key]
                except KeyError:
                    pass
            else:
                self._cache[key] = value

    async def _ensure_clients(self) -> tuple[client.CoreV1Api, client.AppsV1Api]:
        if self._core_v1 and self._apps_v1:
            return self._core_v1, self._apps_v1

        async with self._client_lock:
            if self._core_v1 and self._apps_v1:
                return self._core_v1, self._apps_v1

            cluster_config = await self._load_cluster_config()

            def _build_clients(config_from_db: ClusterConfig | None) -> tuple[client.CoreV1Api, client.AppsV1Api]:
                display_name = None
                try:
                    if config_from_db:
                        display_name = self._apply_cluster_config(config_from_db)
                    elif self.settings.service_account_token_path:
                        config.load_incluster_config()
                        display_name = config_from_db.name if config_from_db else "in-cluster"
                    else:
                        config.load_kube_config(
                            config_file=self.settings.kube_config_path,
                            context=self.settings.kube_context,
                        )
                        display_name = self.settings.kube_context or "default"
                except ConfigException as exc:
                    logger.warning("kubernetes.config_missing", error=str(exc))
                except Exception as exc:  # pragma: no cover
                    logger.warning("kubernetes.config_load_failed", error=str(exc))

                if display_name:
                    self._cluster_display_name = display_name

                api_client = client.ApiClient()
                core = client.CoreV1Api(api_client)
                apps = client.AppsV1Api(api_client)
                return core, apps

            core_v1, apps_v1 = await asyncio.to_thread(_build_clients, cluster_config)
            self._core_v1 = core_v1
            self._apps_v1 = apps_v1
            self._api_client = core_v1.api_client
            return core_v1, apps_v1

    async def _load_cluster_config(self) -> ClusterConfig | None:
        if not self._cluster_config_service:
            return None
        try:
            return await self._cluster_config_service.get_default()
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.cluster_config_error", error=str(exc))
            return None

    def _apply_cluster_config(self, cluster_config: ClusterConfig) -> str:
        if cluster_config.kubeconfig:
            data = yaml.safe_load(cluster_config.kubeconfig)
            context_name = cluster_config.context or data.get("current-context")
            config.load_kube_config_from_dict(data, context=context_name)
            return cluster_config.name

        if not cluster_config.api_server:
            raise ConfigException("Cluster configuration requires an API server or kubeconfig")

        cluster_name = cluster_config.name or "canvas"
        context_name = cluster_config.context or f"{cluster_name}-context"
        user_name = f"{cluster_name}-user"

        cluster_entry: dict[str, Any] = {"server": cluster_config.api_server}
        if cluster_config.certificate_authority_data:
            cluster_entry["certificate-authority-data"] = cluster_config.certificate_authority_data
        cluster_entry["insecure-skip-tls-verify"] = cluster_config.insecure_skip_tls_verify

        user_entry: dict[str, Any] = {}
        if cluster_config.token:
            user_entry["token"] = cluster_config.token

        context_entry: dict[str, Any] = {
            "cluster": cluster_name,
            "user": user_name,
        }
        if cluster_config.namespace:
            context_entry["namespace"] = cluster_config.namespace

        kubeconfig_dict = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{"name": cluster_name, "cluster": cluster_entry}],
            "contexts": [{"name": context_name, "context": context_entry}],
            "current-context": context_name,
            "users": [{"name": user_name, "user": user_entry}],
            "preferences": {},
        }

        config.load_kube_config_from_dict(kubeconfig_dict, context=context_name)
        return cluster_config.name

    # ---------------------------
    # Metrics & capacity helpers
    # ---------------------------

    def _parse_cpu_to_mcores(self, value: str | int | float | None) -> int:
        if value is None:
            return 0
        if isinstance(value, (int, float)):
            # Interpret whole cores -> mcores
            return int(float(value) * 1000)
        s = str(value).strip()
        try:
            if s.endswith("m"):
                return int(float(s[:-1]))
            if s.endswith("n"):
                # nanocores -> mcores (1m = 1e6 n)
                return int(float(s[:-1]) / 1_000_000.0)
            # plain number -> cores
            return int(float(s) * 1000)
        except Exception:
            return 0

    def _parse_memory_to_bytes(self, value: str | int | float | None) -> int:
        if value is None:
            return 0
        if isinstance(value, (int, float)):
            return int(value)
        s = str(value).strip()
        # Binary suffixes
        factors = {
            "Ei": 1024**6,
            "Pi": 1024**5,
            "Ti": 1024**4,
            "Gi": 1024**3,
            "Mi": 1024**2,
            "Ki": 1024,
            # Decimal suffixes
            "E": 10**18,
            "P": 10**15,
            "T": 10**12,
            "G": 10**9,
            "M": 10**6,
            "k": 10**3,
        }
        for suf, mult in factors.items():
            if s.endswith(suf):
                try:
                    return int(float(s[: -len(suf)]) * mult)
                except Exception:
                    return 0
        try:
            # No suffix -> bytes
            return int(float(s))
        except Exception:
            return 0

    async def get_metrics_server_status(self) -> MetricsServerStatus:
        """Return whether metrics.k8s.io is available and working."""
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            co = client.CustomObjectsApi(self._api_client)

            def _check() -> MetricsServerStatus:
                try:
                    # Quick capability probe
                    resp = co.list_cluster_custom_object(
                        group="metrics.k8s.io", version="v1beta1", plural="nodes"
                    )
                    items = resp.get("items", [])
                    return MetricsServerStatus(
                        installed=True,
                        healthy=True,
                        message=f"metrics-server responding with {len(items)} node metrics",
                    )
                except Exception as exc:  # noqa: BLE001
                    # Could be NotFound (group missing) or other errors
                    return MetricsServerStatus(
                        installed=False,
                        healthy=False,
                        message=str(exc),
                    )

            return await asyncio.to_thread(_check)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.metrics_status_error", error=str(exc))
            return MetricsServerStatus(installed=False, healthy=False, message=str(exc))

    async def install_metrics_server(self, insecure_kubelet_tls: bool = False) -> MetricsServerStatus:
        """Install metrics-server by applying the official components manifest.

        Optionally inject --kubelet-insecure-tls for environments where kubelet
        has self-signed certs (kind/minikube/managed clusters with custom CAs).
        """
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()

            import httpx
            import tempfile
            from kubernetes.utils import create_from_yaml

            url = (
                "https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
            )

            def _download_and_apply() -> MetricsServerStatus:
                # Fetch manifest
                with httpx.Client(timeout=30) as http:
                    r = http.get(url)
                    r.raise_for_status()
                    content = r.text

                # Optionally patch deployment args
                try:
                    docs = list(yaml.safe_load_all(content))
                except Exception as exc:  # noqa: BLE001
                    return MetricsServerStatus(
                        installed=False, healthy=False, message=f"YAML parse failed: {exc}"
                    )

                if insecure_kubelet_tls:
                    for d in docs:
                        if isinstance(d, dict) and d.get("kind") == "Deployment" and d.get("metadata", {}).get("name") == "metrics-server":
                            containers = (
                                d.get("spec", {})
                                .get("template", {})
                                .get("spec", {})
                                .get("containers", [])
                            )
                            if containers:
                                args = containers[0].get("args", []) or []
                                if "--kubelet-insecure-tls" not in args:
                                    args.append("--kubelet-insecure-tls")
                                if not any(a.startswith("--kubelet-preferred-address-types=") for a in args):
                                    args.append(
                                        "--kubelet-preferred-address-types=InternalIP,Hostname,InternalDNS,ExternalDNS,ExternalIP"
                                    )
                                containers[0]["args"] = args

                # Write to temp file and apply via utils
                with tempfile.NamedTemporaryFile("w+", suffix=".yaml", delete=True) as tf:
                    yaml.safe_dump_all(docs, tf)
                    tf.flush()
                    try:
                        create_from_yaml(self._api_client, tf.name, verbose=False)
                    except Exception:
                        # Best-effort: resources may already exist; continue to status probe
                        pass

                return MetricsServerStatus(
                    installed=True,
                    healthy=False,
                    message="metrics-server applied; waiting to become Ready",
                )

            result = await asyncio.to_thread(_download_and_apply)

            # Return status (best-effort quick probe)
            status = await self.get_metrics_server_status()
            if status.installed:
                return status
            return result
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.metrics_install_failed", error=str(exc))
            return MetricsServerStatus(installed=False, healthy=False, message=str(exc))

    async def get_cluster_capacity(self) -> ClusterCapacityMetrics:
        """Aggregate CPU/Memory capacity and live usage (if metrics-server present)."""
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect_capacity() -> tuple[int, int]:
                nodes = core_v1.list_node().items
                total_cpu_m = 0
                total_mem_b = 0
                for n in nodes:
                    alloc = n.status.allocatable or {}
                    total_cpu_m += self._parse_cpu_to_mcores(alloc.get("cpu"))
                    total_mem_b += self._parse_memory_to_bytes(alloc.get("memory"))
                return total_cpu_m, total_mem_b

            cpu_total_m, mem_total_b = await asyncio.to_thread(_collect_capacity)

            usage_cpu_m = None
            usage_mem_b = None
            has_metrics = False

            # Try to get live usage via metrics.k8s.io
            try:
                co = client.CustomObjectsApi(self._api_client)

                def _collect_usage() -> tuple[int, int, bool]:
                    try:
                        data = co.list_cluster_custom_object(
                            group="metrics.k8s.io", version="v1beta1", plural="nodes"
                        )
                        items = data.get("items", [])
                        cpu_used_m = 0
                        mem_used_b = 0
                        for it in items:
                            usage = (it.get("usage") or {}) if isinstance(it, dict) else {}
                            cpu_used_m += self._parse_cpu_to_mcores(usage.get("cpu"))
                            mem_used_b += self._parse_memory_to_bytes(usage.get("memory"))
                        return cpu_used_m, mem_used_b, True
                    except Exception:
                        return 0, 0, False

                u_cpu_m, u_mem_b, ok = await asyncio.to_thread(_collect_usage)
                if ok:
                    usage_cpu_m = u_cpu_m
                    usage_mem_b = u_mem_b
                    has_metrics = True
            except Exception:
                has_metrics = False

            # Build response
            if cpu_total_m <= 0 or mem_total_b <= 0:
                return ClusterCapacityMetrics(has_metrics=has_metrics)

            cpu_pct = None
            mem_pct = None
            if has_metrics and usage_cpu_m is not None and usage_mem_b is not None:
                cpu_pct = max(0.0, min(100.0, (usage_cpu_m / cpu_total_m) * 100.0)) if cpu_total_m else None
                mem_pct = max(0.0, min(100.0, (usage_mem_b / mem_total_b) * 100.0)) if mem_total_b else None

            return ClusterCapacityMetrics(
                has_metrics=has_metrics,
                cpu_total_mcores=cpu_total_m or None,
                cpu_used_mcores=usage_cpu_m if has_metrics else None,
                cpu_percent=cpu_pct,
                memory_total_bytes=mem_total_b or None,
                memory_used_bytes=usage_mem_b if has_metrics else None,
                memory_percent=mem_pct,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.capacity_error", error=str(exc))
            return ClusterCapacityMetrics(has_metrics=False)

    async def list_pods_with_containers(self, namespace: str) -> list[dict[str, object]]:
        """List pods and their container names within a namespace."""
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[dict[str, object]]:
                pods = core_v1.list_namespaced_pod(namespace=namespace, limit=1000).items
                results: list[dict[str, object]] = []
                for pod in pods:
                    name = pod.metadata.name if pod.metadata else ""
                    containers = []
                    try:
                        for c in (pod.spec.containers or []):  # type: ignore[attr-defined]
                            containers.append(c.name)
                    except Exception:
                        containers = []
                    results.append({"name": name, "containers": containers})
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_error", error=str(exc))
            return []

    async def list_pods_summary(
        self,
        namespace: str | None = None,
        name: str | None = None,
        phase: str | None = None,
        restart_policy: str | None = None,
    ) -> list[PodSummary]:
        """List pods with details and optional filters."""
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[PodSummary]:
                pods = (
                    core_v1.list_namespaced_pod(namespace=namespace, limit=2000).items
                    if namespace
                    else core_v1.list_pod_for_all_namespaces(limit=2000).items
                )
                items: list[PodSummary] = []
                for p in pods:
                    md = getattr(p, "metadata", None)
                    sp = getattr(p, "spec", None)
                    st = getattr(p, "status", None)
                    ns = getattr(md, "namespace", None) or namespace or "default"
                    nm = getattr(md, "name", None) or ""
                    conts: list[str] = []
                    try:
                        for c in (getattr(sp, "containers", None) or []):
                            conts.append(getattr(c, "name", ""))
                    except Exception:
                        conts = []
                    ready = None
                    total = None
                    try:
                        statuses = getattr(st, "container_statuses", None) or []
                        total = len(statuses)
                        ready = sum(1 for s in statuses if getattr(s, "ready", False))
                    except Exception:
                        pass
                    node_name = getattr(sp, "node_name", None)
                    node_ip = getattr(st, "host_ip", None)
                    pod_ip = getattr(st, "pod_ip", None)
                    ph = getattr(st, "phase", None)
                    rp = getattr(sp, "restart_policy", None)
                    created = getattr(md, "creation_timestamp", None)

                    item = PodSummary(
                        namespace=str(ns),
                        name=str(nm),
                        containers=conts,
                        ready_containers=ready,
                        total_containers=total,
                        node_name=node_name,
                        node_ip=node_ip,
                        pod_ip=pod_ip,
                        phase=ph,
                        restart_policy=rp,
                        created_at=created,
                    )

                    # Filters
                    if name and name not in item.name:
                        continue
                    if phase and (item.phase or "").lower() != phase.lower():
                        continue
                    if restart_policy and (item.restart_policy or "").lower() != restart_policy.lower():
                        continue
                    items.append(item)
                return items

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_summary_error", error=str(exc))
            return []

    async def get_pod_detail(self, namespace: str, name: str) -> PodDetail:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> PodDetail:
                pod = core_v1.read_namespaced_pod(name=name, namespace=namespace)
                md = getattr(pod, "metadata", None)
                sp = getattr(pod, "spec", None)
                st = getattr(pod, "status", None)
                statuses: list[ContainerStatus] = []
                try:
                    for s in (getattr(st, "container_statuses", None) or []):
                        statuses.append(
                            ContainerStatus(
                                name=getattr(s, "name", ""),
                                ready=getattr(s, "ready", None),
                                restart_count=getattr(s, "restart_count", None),
                                image=getattr(s, "image", None),
                            )
                        )
                except Exception:
                    statuses = []
                return PodDetail(
                    namespace=str(getattr(md, "namespace", namespace)),
                    name=str(getattr(md, "name", name)),
                    containers=statuses,
                    node_name=getattr(sp, "node_name", None),
                    node_ip=getattr(st, "host_ip", None),
                    pod_ip=getattr(st, "pod_ip", None),
                    phase=getattr(st, "phase", None),
                    restart_policy=getattr(sp, "restart_policy", None),
                    created_at=getattr(md, "creation_timestamp", None),
                )

            return await asyncio.to_thread(_do)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_pod_detail_error", error=str(exc))
            return PodDetail(namespace=namespace, name=name)

    async def collect_container_metrics_once(self) -> list[tuple[datetime, str, str, str, int, int]]:
        """Collect a single snapshot of container usage across all namespaces.

        Returns a list of tuples: (ts, namespace, pod, container, cpu_mcores, memory_bytes)
        """
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            co = client.CustomObjectsApi(self._api_client)

            def _collect() -> list[tuple[datetime, str, str, str, int, int]]:
                now = datetime.now(tz=timezone.utc)
                try:
                    data = co.list_cluster_custom_object(
                        group="metrics.k8s.io", version="v1beta1", plural="pods"
                    )
                    items = data.get("items", []) if isinstance(data, dict) else []
                except Exception:
                    items = []
                results: list[tuple[datetime, str, str, str, int, int]] = []
                for it in items:
                    meta = it.get("metadata", {}) if isinstance(it, dict) else {}
                    ns = meta.get("namespace") or it.get("namespace") or "default"
                    pod = meta.get("name") or it.get("name") or ""
                    containers = it.get("containers", []) if isinstance(it, dict) else []
                    for c in containers:
                        name = c.get("name") or ""
                        usage = c.get("usage", {}) if isinstance(c, dict) else {}
                        cpu_m = self._parse_cpu_to_mcores(usage.get("cpu"))
                        mem_b = self._parse_memory_to_bytes(usage.get("memory"))
                        results.append((now, str(ns), str(pod), str(name), int(cpu_m), int(mem_b)))
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.collect_container_metrics_error", error=str(exc))
            return []

    async def collect_node_metrics_once(self) -> list[tuple[datetime, str, int, int]]:
        """Collect a single snapshot of node usage across the cluster.

        Returns a list of tuples: (ts, node, cpu_mcores, memory_bytes)
        """
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            co = client.CustomObjectsApi(self._api_client)

            def _collect() -> list[tuple[datetime, str, int, int]]:
                now = datetime.now(tz=timezone.utc)
                try:
                    data = co.list_cluster_custom_object(
                        group="metrics.k8s.io", version="v1beta1", plural="nodes"
                    )
                    items = data.get("items", []) if isinstance(data, dict) else []
                except Exception:
                    items = []
                results: list[tuple[datetime, str, int, int]] = []
                for it in items:
                    meta = it.get("metadata", {}) if isinstance(it, dict) else {}
                    node = str(meta.get("name") or "")
                    usage = it.get("usage", {}) if isinstance(it, dict) else {}
                    cpu_m = self._parse_cpu_to_mcores(usage.get("cpu"))
                    mem_b = self._parse_memory_to_bytes(usage.get("memory"))
                    results.append((now, node, int(cpu_m), int(mem_b)))
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.collect_node_metrics_error", error=str(exc))
            return []

    # ---------------------------
    # Deployment management APIs
    # ---------------------------

    async def list_pods_for_deployment(self, namespace: str, name: str) -> list[dict[str, object]]:
        """List pods belonging to a Deployment, including their container names.

        Uses the Deployment's label selector (matchLabels) to find pods.
        """
        await self._rate_limiter.acquire()
        try:
            core_v1, apps_v1 = await self._ensure_clients()

            def _collect() -> list[dict[str, object]]:
                dep = apps_v1.read_namespaced_deployment(name=name, namespace=namespace)
                sel = dep.spec.selector

                def _selector_to_string(selector) -> str | None:
                    if not selector:
                        return None
                    parts: list[str] = []
                    try:
                        ml = getattr(selector, "match_labels", None) or {}
                        for k, v in ml.items():
                            parts.append(f"{k}={v}")
                    except Exception:
                        pass
                    try:
                        exprs = getattr(selector, "match_expressions", None) or []
                        for e in exprs:
                            key = getattr(e, "key", None)
                            op = getattr(e, "operator", None)
                            values = getattr(e, "values", None) or []
                            if not key or not op:
                                continue
                            if op == "In" and values:
                                parts.append(f"{key} in ({','.join(map(str, values))})")
                            elif op == "NotIn" and values:
                                parts.append(f"{key} notin ({','.join(map(str, values))})")
                            elif op == "Exists":
                                parts.append(f"{key}")
                            elif op == "DoesNotExist":
                                parts.append(f"!{key}")
                            else:
                                # Unsupported operators (e.g., Gt/Lt) are ignored in string form
                                pass
                    except Exception:
                        pass
                    return ",".join(parts) if parts else None

                label_selector = _selector_to_string(sel)

                pods = (
                    core_v1.list_namespaced_pod(namespace=namespace, label_selector=label_selector).items
                    if label_selector
                    else core_v1.list_namespaced_pod(namespace=namespace).items
                )
                results: list[dict[str, object]] = []
                for pod in pods:
                    name_ = pod.metadata.name if pod.metadata else ""
                    containers: list[str] = []
                    try:
                        for c in (pod.spec.containers or []):  # type: ignore[attr-defined]
                            containers.append(c.name)
                    except Exception:
                        containers = []
                    results.append({"name": name_, "containers": containers})
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_for_deployment_error", error=str(exc))
            return []

    async def restart_deployment(self, namespace: str, name: str) -> tuple[bool, str | None]:
        """Trigger a rollout restart by annotating the pod template."""
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                ts = datetime.now(tz=timezone.utc).isoformat()
                body = {
                    "spec": {
                        "template": {
                            "metadata": {
                                "annotations": {
                                    "kubectl.kubernetes.io/restartedAt": ts
                                }
                            }
                        }
                    }
                }
                apps_v1.patch_namespaced_deployment(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.restart_deployment_error", error=str(exc))
            return False, str(exc)

    async def update_deployment_image(self, namespace: str, name: str, container: str, image: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _patch() -> None:
                dep = apps_v1.read_namespaced_deployment(name=name, namespace=namespace)
                # Build updated containers list
                containers = list(dep.spec.template.spec.containers or [])  # type: ignore[union-attr]
                found = False
                for c in containers:
                    if getattr(c, "name", None) == container:
                        c.image = image
                        found = True
                        break
                if not found:
                    raise RuntimeError(f"Container {container} not found in deployment")
                body = {
                    "spec": {
                        "template": {
                            "spec": {"containers": [{"name": c.name, "image": c.image} for c in containers]}
                        }
                    }
                }
                apps_v1.patch_namespaced_deployment(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_patch)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.update_deployment_image_error", error=str(exc))
            return False, str(exc)

    async def get_deployment_strategy(self, namespace: str, name: str) -> dict:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _get() -> dict:
                dep = apps_v1.read_namespaced_deployment(name=name, namespace=namespace)
                st = getattr(dep.spec, "strategy", None)
                if not st:
                    return {"strategy_type": "RollingUpdate", "max_unavailable": None, "max_surge": None}
                st_type = getattr(st, "type", None) or "RollingUpdate"
                ru = getattr(st, "rolling_update", None)
                max_unavail = getattr(ru, "max_unavailable", None) if ru else None
                max_surge = getattr(ru, "max_surge", None) if ru else None
                # Values may be IntOrString objects; convert to raw
                def _val(v):
                    try:
                        return v if isinstance(v, (str, int)) else (v.value if hasattr(v, "value") else None)
                    except Exception:
                        return None
                return {
                    "strategy_type": str(st_type),
                    "max_unavailable": _val(max_unavail),
                    "max_surge": _val(max_surge),
                }

            return await asyncio.to_thread(_get)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_deployment_strategy_error", error=str(exc))
            return {"strategy_type": "RollingUpdate", "max_unavailable": None, "max_surge": None}

    async def update_deployment_strategy(self, namespace: str, name: str, strategy_type: str, max_unavailable: str | int | None, max_surge: str | int | None) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _patch() -> None:
                body: dict = {"spec": {"strategy": {"type": strategy_type}}}
                if strategy_type == "RollingUpdate":
                    ru: dict[str, str | int] = {}
                    if max_unavailable is not None:
                        ru["maxUnavailable"] = max_unavailable
                    if max_surge is not None:
                        ru["maxSurge"] = max_surge
                    body["spec"]["strategy"]["rollingUpdate"] = ru
                apps_v1.patch_namespaced_deployment(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_patch)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.update_deployment_strategy_error", error=str(exc))
            return False, str(exc)

    async def get_deployment_autoscaling(self, namespace: str, name: str) -> dict:
        await self._rate_limiter.acquire()
        try:
            _, _apps = await self._ensure_clients()
            autoscaling_v2 = client.AutoscalingV2Api(self._api_client)

            def _get() -> dict:
                try:
                    hpas = autoscaling_v2.list_namespaced_horizontal_pod_autoscaler(namespace=namespace).items
                except Exception:
                    hpas = []
                for h in hpas:
                    spec = getattr(h, "spec", None)
                    if not spec:
                        continue
                    target = getattr(spec, "scale_target_ref", None)
                    if target and getattr(target, "kind", None) == "Deployment" and getattr(target, "name", None) == name:
                        min_r = getattr(spec, "min_replicas", None)
                        max_r = getattr(spec, "max_replicas", None)
                        cpu = None
                        try:
                            for m in getattr(spec, "metrics", []) or []:
                                if getattr(m, "type", None) == "Resource" and getattr(m.resource, "name", None) == "cpu":
                                    tgt = getattr(m.resource, "target", None)
                                    if tgt and getattr(tgt, "type", None) == "Utilization":
                                        cpu = getattr(tgt, "average_utilization", None)
                        except Exception:
                            pass
                        return {
                            "enabled": True,
                            "min_replicas": min_r,
                            "max_replicas": max_r,
                            "target_cpu_utilization": cpu,
                        }
                return {"enabled": False, "min_replicas": None, "max_replicas": None, "target_cpu_utilization": None}

            return await asyncio.to_thread(_get)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_hpa_error", error=str(exc))
            return {"enabled": False, "min_replicas": None, "max_replicas": None, "target_cpu_utilization": None}

    async def update_deployment_autoscaling(self, namespace: str, name: str, enabled: bool, min_replicas: int | None, max_replicas: int | None, target_cpu_utilization: int | None) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            autoscaling_v2 = client.AutoscalingV2Api(self._api_client)

            def _ensure() -> None:
                # Discover existing HPA for this deployment
                try:
                    hpas = autoscaling_v2.list_namespaced_horizontal_pod_autoscaler(namespace=namespace).items
                except Exception:
                    hpas = []
                existing = None
                for h in hpas:
                    target = getattr(getattr(h, "spec", None), "scale_target_ref", None)
                    if target and getattr(target, "kind", None) == "Deployment" and getattr(target, "name", None) == name:
                        existing = h
                        break

                if not enabled:
                    if existing:
                        autoscaling_v2.delete_namespaced_horizontal_pod_autoscaler(name=existing.metadata.name, namespace=namespace)
                    return

                # Build HPA spec
                hpa_name = existing.metadata.name if existing else f"{name}"
                spec = {
                    "scaleTargetRef": {"apiVersion": "apps/v1", "kind": "Deployment", "name": name},
                    "minReplicas": min_replicas if min_replicas is not None else 1,
                    "maxReplicas": max_replicas if max_replicas is not None else 3,
                    "metrics": [
                        {
                            "type": "Resource",
                            "resource": {
                                "name": "cpu",
                                "target": {
                                    "type": "Utilization",
                                    "averageUtilization": target_cpu_utilization if target_cpu_utilization is not None else 80,
                                },
                            },
                        }
                    ],
                }

                body = {
                    "apiVersion": "autoscaling/v2",
                    "kind": "HorizontalPodAutoscaler",
                    "metadata": {"name": hpa_name, "namespace": namespace},
                    "spec": spec,
                }

                if existing:
                    autoscaling_v2.patch_namespaced_horizontal_pod_autoscaler(name=hpa_name, namespace=namespace, body=body)
                else:
                    autoscaling_v2.create_namespaced_horizontal_pod_autoscaler(namespace=namespace, body=body)

            await asyncio.to_thread(_ensure)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.update_hpa_error", error=str(exc))
            return False, str(exc)

    async def scale_deployment(self, namespace: str, name: str, replicas: int) -> tuple[bool, str | None]:
        """Scale deployment by patching .spec.replicas."""
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                body = {"spec": {"replicas": int(replicas)}}
                apps_v1.patch_namespaced_deployment(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.scale_deployment_error", error=str(exc))
            return False, str(exc)

    async def delete_deployment(self, namespace: str, name: str) -> tuple[bool, str | None]:
        """Delete a deployment."""
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                apps_v1.delete_namespaced_deployment(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.delete_deployment_error", error=str(exc))
            return False, str(exc)

    async def get_deployment_yaml(self, namespace: str, name: str) -> str | None:
        """Return the YAML manifest for a deployment."""
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> str:
                dep = apps_v1.read_namespaced_deployment(name=name, namespace=namespace)
                # Sanitize to dict then to YAML
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(dep)
                # Remove managedFields to shorten output if present
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_deployment_yaml_error", error=str(exc))
            return None

    async def apply_deployment_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        """Apply changes from YAML by patching the Deployment (spec only)."""
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                try:
                    obj = yaml.safe_load(yaml_text) or {}
                except Exception as exc:  # noqa: BLE001
                    raise RuntimeError(f"Invalid YAML: {exc}")

                if not isinstance(obj, dict):
                    raise RuntimeError("YAML must be a mapping")
                meta = obj.get("metadata", {}) if isinstance(obj, dict) else {}
                spec = obj.get("spec", {}) if isinstance(obj, dict) else {}
                kind = obj.get("kind")
                # Basic validation
                if kind and str(kind) != "Deployment":
                    raise RuntimeError("YAML kind must be Deployment")
                body = {"spec": spec} if spec else {}
                if not body:
                    raise RuntimeError("YAML missing spec to apply")
                # Use namespace/name from path to avoid accidental rename
                apps_v1.patch_namespaced_deployment(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.apply_deployment_yaml_error", error=str(exc))
            return False, str(exc)

    async def list_services(self, namespace: str | None = None) -> list[ServiceSummary]:
        """List Services in a namespace or across all namespaces."""
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[ServiceSummary]:
                svcs = (
                    core_v1.list_namespaced_service(namespace=namespace, limit=2000).items
                    if namespace
                    else core_v1.list_service_for_all_namespaces(limit=2000).items
                )
                items: list[ServiceSummary] = []
                for s in svcs:
                    md = getattr(s, "metadata", None)
                    sp = getattr(s, "spec", None)
                    st = getattr(s, "status", None)
                    ns = getattr(md, "namespace", None) or namespace or "default"
                    nm = getattr(md, "name", None) or ""
                    svc_type = getattr(sp, "type", None)
                    cluster_ip = getattr(sp, "cluster_ip", None) or getattr(sp, "clusterIP", None)
                    ports: list[ServicePort] = []
                    try:
                        for p in (getattr(sp, "ports", None) or []):
                            ports.append(
                                ServicePort(
                                    name=getattr(p, "name", None),
                                    port=getattr(p, "port", None),
                                    target_port=getattr(p, "target_port", None) or getattr(p, "targetPort", None),
                                    node_port=getattr(p, "node_port", None) or getattr(p, "nodePort", None),
                                    protocol=getattr(p, "protocol", None),
                                )
                            )
                    except Exception:
                        ports = []
                    created = getattr(md, "creation_timestamp", None)
                    items.append(
                        ServiceSummary(
                            namespace=str(ns),
                            name=str(nm),
                            type=svc_type,
                            cluster_ip=cluster_ip,
                            ports=ports,
                            created_at=created,
                        )
                    )
                return items

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_services_error", error=str(exc))
            return []

    async def get_service_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> str:
                svc = core_v1.read_namespaced_service(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(svc)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_service_yaml_error", error=str(exc))
            return None

    async def apply_service_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                try:
                    obj = yaml.safe_load(yaml_text) or {}
                except Exception as exc:  # noqa: BLE001
                    raise RuntimeError(f"Invalid YAML: {exc}")
                if not isinstance(obj, dict):
                    raise RuntimeError("YAML must be a mapping")
                kind = obj.get("kind")
                if kind and str(kind) != "Service":
                    raise RuntimeError("YAML kind must be Service")
                # Use server-side apply or patch full object; prefer patch to spec
                core_v1.patch_namespaced_service(name=name, namespace=namespace, body=obj)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.apply_service_yaml_error", error=str(exc))
            return False, str(exc)

    async def create_service_from_yaml(self, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                try:
                    obj = yaml.safe_load(yaml_text) or {}
                except Exception as exc:  # noqa: BLE001
                    raise RuntimeError(f"Invalid YAML: {exc}")
                if not isinstance(obj, dict):
                    raise RuntimeError("YAML must be a mapping")
                kind = obj.get("kind")
                if not kind or str(kind) != "Service":
                    raise RuntimeError("YAML kind must be Service")
                md = obj.get("metadata", {}) if isinstance(obj, dict) else {}
                ns = md.get("namespace")
                name = md.get("name")
                if not ns or not name:
                    raise RuntimeError("metadata.namespace and metadata.name required")
                core_v1.create_namespaced_service(namespace=str(ns), body=obj)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.create_service_error", error=str(exc))
            return False, str(exc)

    async def delete_service(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                core_v1.delete_namespaced_service(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.delete_service_error", error=str(exc))
            return False, str(exc)
