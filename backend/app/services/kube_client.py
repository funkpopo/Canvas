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
    CRDSummary,
    GenericResourceEntry,
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

    async def patch_node_taints(self, name: str, taints: list[NodeTaint]) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                items = [
                    {"key": t.key, "value": t.value, "effect": t.effect}
                    for t in (taints or [])
                ]
                body = {"spec": {"taints": items}}
                core_v1.patch_node(name=name, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.patch_node_taints_error", error=str(exc))
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
                core_v1, apps_v1 = await self._ensure_clients()
                batch_v1 = client.BatchV1Api(self._api_client)

                def _collect() -> list[WorkloadSummary]:
                    items: list[WorkloadSummary] = []

                    # Deployments
                    deployments = apps_v1.list_deployment_for_all_namespaces(limit=1000).items
                    for deployment in deployments:
                        status = deployment.status
                        ready = getattr(status, "ready_replicas", 0) or 0
                        desired = getattr(status, "replicas", 0) or 0
                        items.append(
                            WorkloadSummary(
                                name=deployment.metadata.name,
                                namespace=deployment.metadata.namespace,
                                kind="Deployment",
                                replicas_desired=int(desired),
                                replicas_ready=int(ready),
                                version=(
                                    deployment.metadata.annotations.get("deployment.kubernetes.io/revision")
                                    if deployment.metadata.annotations
                                    else None
                                ),
                                status="Healthy" if ready == desired else "Warning",
                                updated_at=datetime.now(tz=timezone.utc),
                            )
                        )

                    # StatefulSets
                    ssets = apps_v1.list_stateful_set_for_all_namespaces(limit=1000).items
                    for ss in ssets:
                        st = ss.status
                        ready = getattr(st, "ready_replicas", 0) or 0
                        desired = getattr(st, "replicas", 0) or 0
                        items.append(
                            WorkloadSummary(
                                name=ss.metadata.name,
                                namespace=ss.metadata.namespace,
                                kind="StatefulSet",
                                replicas_desired=int(desired),
                                replicas_ready=int(ready),
                                version=None,
                                status="Healthy" if ready == desired else "Warning",
                                updated_at=datetime.now(tz=timezone.utc),
                            )
                        )

                    # DaemonSets
                    dsets = apps_v1.list_daemon_set_for_all_namespaces(limit=1000).items
                    for ds in dsets:
                        st = ds.status
                        desired = getattr(st, "desired_number_scheduled", 0) or 0
                        ready = getattr(st, "number_ready", 0) or 0
                        items.append(
                            WorkloadSummary(
                                name=ds.metadata.name,
                                namespace=ds.metadata.namespace,
                                kind="DaemonSet",
                                replicas_desired=int(desired),
                                replicas_ready=int(ready),
                                version=None,
                                status="Healthy" if ready == desired else "Warning",
                                updated_at=datetime.now(tz=timezone.utc),
                            )
                        )

                    # CronJobs
                    cjs = batch_v1.list_cron_job_for_all_namespaces(limit=1000).items
                    for cj in cjs:
                        last = None
                        try:
                            last = getattr(cj.status, "last_schedule_time", None)
                        except Exception:
                            last = None
                        items.append(
                            WorkloadSummary(
                                name=cj.metadata.name,
                                namespace=cj.metadata.namespace,
                                kind="CronJob",
                                replicas_desired=None,
                                replicas_ready=None,
                                version=None,
                                status="Healthy",
                                updated_at=last,
                            )
                        )

                    # Jobs
                    jobs = batch_v1.list_job_for_all_namespaces(limit=1000).items
                    for jb in jobs:
                        st = jb.status
                        succ = getattr(st, "succeeded", 0) or 0
                        compl = getattr(jb.spec, "completions", None) if getattr(jb, "spec", None) else None
                        desired = int(compl) if compl is not None else None
                        items.append(
                            WorkloadSummary(
                                name=jb.metadata.name,
                                namespace=jb.metadata.namespace,
                                kind="Job",
                                replicas_desired=desired,
                                replicas_ready=int(succ),
                                version=None,
                                status="Healthy" if desired is not None and succ >= desired else "Warning",
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

    # ---------------------------
    # Ingress & NetworkPolicy
    # ---------------------------

    async def list_ingresses(self, namespace: str | None = None) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _collect() -> list[dict[str, object]]:
                items = (
                    net.list_namespaced_ingress(namespace=namespace, limit=1000).items if namespace else net.list_ingress_for_all_namespaces(limit=1000).items
                )
                results: list[dict[str, object]] = []
                for ing in items:
                    md = getattr(ing, "metadata", None)
                    spec = getattr(ing, "spec", None)
                    ns = getattr(md, "namespace", None) or "default"
                    nm = getattr(md, "name", None) or ""
                    hosts: list[str] = []
                    try:
                        for rule in (getattr(spec, "rules", None) or []):
                            hosts.append(getattr(rule, "host", None) or "*")
                    except Exception:
                        pass
                    results.append({"namespace": str(ns), "name": str(nm), "hosts": hosts, "created_at": getattr(md, "creation_timestamp", None)})
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_ingresses_error", error=str(exc))
            return []

    async def get_ingress_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _do() -> str:
                obj = net.read_namespaced_ingress(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_ingress_yaml_error", error=str(exc))
            return None

    async def apply_ingress_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "Ingress":
                    raise RuntimeError("YAML kind must be Ingress")
                net.patch_namespaced_ingress(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_ingress_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_ingress(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _do() -> None:
                net.delete_namespaced_ingress(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_ingress_error", error=str(exc))
            return False, str(exc)

    async def list_network_policies(self, namespace: str | None = None) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _collect() -> list[dict[str, object]]:
                items = (
                    net.list_namespaced_network_policy(namespace=namespace, limit=1000).items if namespace else net.list_network_policy_for_all_namespaces(limit=1000).items
                )
                results: list[dict[str, object]] = []
                for np in items:
                    md = getattr(np, "metadata", None)
                    ns = getattr(md, "namespace", None) or "default"
                    nm = getattr(md, "name", None) or ""
                    results.append({"namespace": str(ns), "name": str(nm), "created_at": getattr(md, "creation_timestamp", None)})
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:
            logger.warning("kubernetes.list_networkpolicies_error", error=str(exc))
            return []

    async def get_network_policy_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _do() -> str:
                obj = net.read_namespaced_network_policy(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_networkpolicy_yaml_error", error=str(exc))
            return None

    async def apply_network_policy_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "NetworkPolicy":
                    raise RuntimeError("YAML kind must be NetworkPolicy")
                net.patch_namespaced_network_policy(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_networkpolicy_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_network_policy(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()
            net = client.NetworkingV1Api(self._api_client)

            def _do() -> None:
                net.delete_namespaced_network_policy(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_networkpolicy_error", error=str(exc))
            return False, str(exc)

    # ---------------------------
    # ConfigMap & Secret
    # ---------------------------

    async def list_configmaps(self, namespace: str | None = None) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[dict[str, object]]:
                items = (
                    core_v1.list_namespaced_config_map(namespace=namespace, limit=1000).items if namespace else core_v1.list_config_map_for_all_namespaces(limit=1000).items
                )
                results: list[dict[str, object]] = []
                for cm in items:
                    md = getattr(cm, "metadata", None)
                    ns = getattr(md, "namespace", None) or "default"
                    nm = getattr(md, "name", None) or ""
                    results.append({"namespace": str(ns), "name": str(nm), "created_at": getattr(md, "creation_timestamp", None)})
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:
            logger.warning("kubernetes.list_configmaps_error", error=str(exc))
            return []

    async def get_configmap_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> str:
                obj = core_v1.read_namespaced_config_map(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_configmap_yaml_error", error=str(exc))
            return None

    async def apply_configmap_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "ConfigMap":
                    raise RuntimeError("YAML kind must be ConfigMap")
                core_v1.patch_namespaced_config_map(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_configmap_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_configmap(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                core_v1.delete_namespaced_config_map(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_configmap_error", error=str(exc))
            return False, str(exc)

    async def list_secrets(self, namespace: str | None = None) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _collect() -> list[dict[str, object]]:
                items = (
                    core_v1.list_namespaced_secret(namespace=namespace, limit=1000).items if namespace else core_v1.list_secret_for_all_namespaces(limit=1000).items
                )
                results: list[dict[str, object]] = []
                for sec in items:
                    md = getattr(sec, "metadata", None)
                    ns = getattr(md, "namespace", None) or "default"
                    nm = getattr(md, "name", None) or ""
                    sec_type = getattr(sec, "type", None)
                    results.append({"namespace": str(ns), "name": str(nm), "type": sec_type, "created_at": getattr(md, "creation_timestamp", None)})
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:
            logger.warning("kubernetes.list_secrets_error", error=str(exc))
            return []

    async def get_secret_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> str:
                obj = core_v1.read_namespaced_secret(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_secret_yaml_error", error=str(exc))
            return None

    async def apply_secret_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "Secret":
                    raise RuntimeError("YAML kind must be Secret")
                core_v1.patch_namespaced_secret(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_secret_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_secret(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                core_v1.delete_namespaced_secret(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_secret_error", error=str(exc))
            return False, str(exc)

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
        from app.core.crypto import decrypt_if_encrypted

        kubeconfig_text = decrypt_if_encrypted(cluster_config.kubeconfig)
        token_text = decrypt_if_encrypted(cluster_config.token)
        ca_text = decrypt_if_encrypted(cluster_config.certificate_authority_data)

        if kubeconfig_text:
            data = yaml.safe_load(kubeconfig_text)
            context_name = cluster_config.context or data.get("current-context")
            config.load_kube_config_from_dict(data, context=context_name)
            return cluster_config.name

        if not cluster_config.api_server:
            raise ConfigException("Cluster configuration requires an API server or kubeconfig")

        cluster_name = cluster_config.name or "canvas"
        context_name = cluster_config.context or f"{cluster_name}-context"
        user_name = f"{cluster_name}-user"

        cluster_entry: dict[str, Any] = {"server": cluster_config.api_server}
        if ca_text:
            cluster_entry["certificate-authority-data"] = ca_text
        cluster_entry["insecure-skip-tls-verify"] = cluster_config.insecure_skip_tls_verify

        user_entry: dict[str, Any] = {}
        if token_text:
            user_entry["token"] = token_text

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
                        # Extract detailed container state
                        state_val = None
                        state_reason = None
                        state_message = None
                        try:
                            cs_state = getattr(s, "state", None)
                            if getattr(cs_state, "waiting", None):
                                state_val = "Waiting"
                                state_reason = getattr(cs_state.waiting, "reason", None)
                                state_message = getattr(cs_state.waiting, "message", None)
                            elif getattr(cs_state, "running", None):
                                state_val = "Running"
                                # running state typically has no reason/message
                            elif getattr(cs_state, "terminated", None):
                                state_val = "Terminated"
                                state_reason = getattr(cs_state.terminated, "reason", None)
                                state_message = getattr(cs_state.terminated, "message", None)
                        except Exception:
                            state_val = None
                            state_reason = None
                            state_message = None
                        statuses.append(
                            ContainerStatus(
                                name=getattr(s, "name", ""),
                                ready=getattr(s, "ready", None),
                                restart_count=getattr(s, "restart_count", None),
                                image=getattr(s, "image", None),
                                state=state_val,  # type: ignore[arg-type]
                                state_reason=state_reason,
                                state_message=state_message,
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

    async def delete_pod(self, namespace: str, name: str, grace_period_seconds: int | None = None) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                body = client.V1DeleteOptions(grace_period_seconds=grace_period_seconds)
                core_v1.delete_namespaced_pod(name=name, namespace=namespace, body=body)  # type: ignore[arg-type]

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.delete_pod_error", error=str(exc))
            return False, str(exc)

    async def iter_pod_logs(
        self,
        namespace: str,
        name: str,
        container: str | None = None,
        follow: bool = True,
        tail_lines: int | None = None,
        since_seconds: int | None = None,
    ):
        """Async iterator yielding pod log bytes suitable for StreamingResponse.

        Uses Kubernetes client's streaming (urllib3) with _preload_content=False, read in chunks.
        """
        await self._rate_limiter.acquire()
        core_v1, _ = await self._ensure_clients()

        def _open():
            return core_v1.read_namespaced_pod_log(
                name=name,
                namespace=namespace,
                container=container,
                follow=bool(follow),
                tail_lines=tail_lines,
                since_seconds=since_seconds,
                _preload_content=False,
                timestamps=False,
            )

        resp = await asyncio.to_thread(_open)

        async def _gen():
            try:
                while True:
                    chunk = await asyncio.to_thread(resp.read, 1024)
                    if not chunk:
                        break
                    # Ensure bytes
                    if isinstance(chunk, bytes):
                        yield chunk
                    else:
                        yield str(chunk).encode()
            finally:
                try:
                    await asyncio.to_thread(resp.close)
                except Exception:
                    pass

        return _gen()

    async def check_access(
        self,
        *,
        verb: str,
        resource: str,
        namespace: str | None = None,
        group: str | None = None,
        subresource: str | None = None,
    ) -> bool:
        """SelfSubjectAccessReview for the current identity.

        Caches results in a TTL cache to avoid spamming the API server.
        """
        cache_key = ("authz", verb, resource, namespace or "", group or "", subresource or "")
        async with self._cache_lock:
            if cache_key in self._cache:
                val = self._cache.get(cache_key)
                if isinstance(val, bool):
                    return val

        await self._rate_limiter.acquire()
        try:
            await self._ensure_clients()

            def _do() -> bool:
                auth = client.AuthorizationV1Api(self._api_client)
                attrs = client.V1ResourceAttributes(
                    namespace=namespace,
                    verb=verb,
                    group=group or "",
                    resource=resource,
                    subresource=subresource,
                )
                sar = client.V1SelfSubjectAccessReview(
                    spec=client.V1SelfSubjectAccessReviewSpec(resource_attributes=attrs)
                )
                resp = auth.create_self_subject_access_review(body=sar)
                status = getattr(resp, "status", None)
                return bool(getattr(status, "allowed", False))

            allowed = await asyncio.to_thread(_do)
            async with self._cache_lock:
                self._cache[cache_key] = allowed
            return allowed
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.sar_error", error=str(exc))
            return False

    async def get_pod_yaml(self, namespace: str, name: str) -> str | None:
        """Return the YAML manifest for a Pod."""
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> str:
                pod = core_v1.read_namespaced_pod(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(pod)
                # Trim managedFields to shorten output
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_pod_yaml_error", error=str(exc))
            return None

    async def create_ephemeral_container(
        self,
        namespace: str,
        name: str,
        image: str,
        command: list[str] | None = None,
        target_container: str | None = None,
        container_name: str | None = None,
        tty: bool = True,
        stdin: bool = True,
    ) -> tuple[bool, str | None]:
        """Create an ephemeral debug container in the given Pod.

        Uses the EphemeralContainers subresource via patch_namespaced_pod_ephemeralcontainers.
        Returns (ok, message_or_container_name).
        """
        await self._rate_limiter.acquire()
        try:
            core_v1, _ = await self._ensure_clients()

            def _do() -> str:
                pod = core_v1.read_namespaced_pod(name=name, namespace=namespace)
                # Gather existing ephemeral containers if any
                spec = getattr(pod, "spec", None)
                existing = []
                try:
                    for ec in getattr(spec, "ephemeral_containers", None) or []:  # type: ignore[attr-defined]
                        existing.append(
                            {
                                "name": getattr(ec, "name", None),
                                "image": getattr(ec, "image", None),
                                "command": getattr(ec, "command", None),
                                "args": getattr(ec, "args", None),
                                "stdin": getattr(ec, "stdin", None),
                                "tty": getattr(ec, "tty", None),
                                "targetContainerName": getattr(ec, "target_container_name", None)
                                or getattr(ec, "targetContainerName", None),
                            }
                        )
                except Exception:
                    existing = []

                # Generate a name if not provided
                import random, string

                def _gen_name() -> str:
                    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
                    return f"debug-{suffix}"

                new_name = container_name or _gen_name()
                new_ec: dict[str, object] = {
                    "name": new_name,
                    "image": image,
                    "stdin": bool(stdin),
                    "tty": bool(tty),
                }
                if command:
                    new_ec["command"] = command
                if target_container:
                    new_ec["targetContainerName"] = target_container

                body = {
                    "apiVersion": "v1",
                    "kind": "EphemeralContainers",
                    "metadata": {"name": name},
                    "ephemeralContainers": existing + [new_ec],
                }
                core_v1.patch_namespaced_pod_ephemeralcontainers(
                    name=name,
                    namespace=namespace,
                    body=body,  # type: ignore[arg-type]
                )
                return new_name

            created_name = await asyncio.to_thread(_do)
            return True, created_name
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.create_ephemeral_container_error", error=str(exc))
            return False, str(exc)

    async def delete_ephemeral_container(
        self, namespace: str, name: str, container: str
    ) -> tuple[bool, str | None]:
        """Ephemeral containers cannot be removed once added to a running pod.

        This method returns (False, message) to indicate the limitation.
        """
        return False, "Ephemeral containers cannot be deleted from an existing Pod"

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
                    st = getattr(pod, "status", None)
                    containers: list[str] = []
                    try:
                        for c in (pod.spec.containers or []):  # type: ignore[attr-defined]
                            containers.append(c.name)
                    except Exception:
                        containers = []
                    # Container readiness and phase for UI without extra calls
                    try:
                        cs_list = getattr(st, "container_statuses", None) or []
                        ready_containers = sum(1 for cs in cs_list if getattr(cs, "ready", False))
                        total_containers = len(cs_list)
                    except Exception:
                        ready_containers = None
                        total_containers = None
                    phase = getattr(st, "phase", None)
                    results.append({
                        "name": name_,
                        "containers": containers,
                        "ready_containers": ready_containers if ready_containers is not None else 0,
                        "total_containers": total_containers if total_containers is not None else len(containers),
                        "phase": str(phase) if phase else None,
                    })
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_for_deployment_error", error=str(exc))
            return []

    async def _list_pods_by_selector(self, namespace: str, selector: object) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        core_v1, _ = await self._ensure_clients()

        def _selector_to_string(sel) -> str | None:
            if not sel:
                return None
            parts: list[str] = []
            try:
                ml = getattr(sel, "match_labels", None) or {}
                for k, v in ml.items():
                    parts.append(f"{k}={v}")
            except Exception:
                pass
            try:
                exprs = getattr(sel, "match_expressions", None) or []
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
            except Exception:
                pass
            return ",".join(parts) if parts else None

        def _collect() -> list[dict[str, object]]:
            label_selector = _selector_to_string(selector)
            pods = (
                core_v1.list_namespaced_pod(namespace=namespace, label_selector=label_selector).items
                if label_selector
                else core_v1.list_namespaced_pod(namespace=namespace).items
            )
            results: list[dict[str, object]] = []
            for pod in pods:
                name_ = pod.metadata.name if pod.metadata else ""
                st = getattr(pod, "status", None)
                containers: list[str] = []
                try:
                    for c in (pod.spec.containers or []):  # type: ignore[attr-defined]
                        containers.append(c.name)
                except Exception:
                    containers = []
                try:
                    cs_list = getattr(st, "container_statuses", None) or []
                    ready_containers = sum(1 for cs in cs_list if getattr(cs, "ready", False))
                    total_containers = len(cs_list)
                except Exception:
                    ready_containers = None
                    total_containers = None
                phase = getattr(st, "phase", None)
                results.append(
                    {
                        "name": name_,
                        "containers": containers,
                        "ready_containers": ready_containers if ready_containers is not None else 0,
                        "total_containers": total_containers if total_containers is not None else len(containers),
                        "phase": str(phase) if phase else None,
                    }
                )
            return results

        return await asyncio.to_thread(_collect)

    async def list_pods_for_statefulset(self, namespace: str, name: str) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _get_sel():
                ss = apps_v1.read_namespaced_stateful_set(name=name, namespace=namespace)
                return getattr(ss.spec, "selector", None)

            sel = await asyncio.to_thread(_get_sel)
            return await self._list_pods_by_selector(namespace, sel)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_for_statefulset_error", error=str(exc))
            return []

    async def list_pods_for_daemonset(self, namespace: str, name: str) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _get_sel():
                ds = apps_v1.read_namespaced_daemon_set(name=name, namespace=namespace)
                return getattr(ds.spec, "selector", None)

            sel = await asyncio.to_thread(_get_sel)
            return await self._list_pods_by_selector(namespace, sel)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_for_daemonset_error", error=str(exc))
            return []

    async def list_pods_for_job(self, namespace: str, name: str) -> list[dict[str, object]]:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _get_sel():
                jb = batch_v1.read_namespaced_job(name=name, namespace=namespace)
                return getattr(jb.spec, "selector", None) or getattr(jb.spec, "pod_selector", None)

            sel = await asyncio.to_thread(_get_sel)
            return await self._list_pods_by_selector(namespace, sel)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.list_pods_for_job_error", error=str(exc))
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

    # ---------------------------
    # StatefulSet/DaemonSet/Job/CronJob helpers
    # ---------------------------

    async def scale_statefulset(self, namespace: str, name: str, replicas: int) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                body = {"spec": {"replicas": replicas}}
                apps_v1.patch_namespaced_stateful_set_scale(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            await self._set_cached("workloads", None)
            return True, None
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.scale_statefulset_error", error=str(exc))
            return False, str(exc)

    async def delete_statefulset(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                apps_v1.delete_namespaced_stateful_set(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            await self._set_cached("workloads", None)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_statefulset_error", error=str(exc))
            return False, str(exc)

    async def get_statefulset_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> str:
                obj = apps_v1.read_namespaced_stateful_set(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_statefulset_yaml_error", error=str(exc))
            return None

    async def apply_statefulset_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "StatefulSet":
                    raise RuntimeError("YAML kind must be StatefulSet")
                spec = body.get("spec", {}) if isinstance(body, dict) else {}
                if not spec:
                    raise RuntimeError("YAML missing spec to apply")
                apps_v1.patch_namespaced_stateful_set(name=name, namespace=namespace, body={"spec": spec})

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_statefulset_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_daemonset(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                apps_v1.delete_namespaced_daemon_set(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            await self._set_cached("workloads", None)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_daemonset_error", error=str(exc))
            return False, str(exc)

    async def get_daemonset_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> str:
                obj = apps_v1.read_namespaced_daemon_set(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_daemonset_yaml_error", error=str(exc))
            return None

    async def apply_daemonset_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            _, apps_v1 = await self._ensure_clients()

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "DaemonSet":
                    raise RuntimeError("YAML kind must be DaemonSet")
                spec = body.get("spec", {}) if isinstance(body, dict) else {}
                if not spec:
                    raise RuntimeError("YAML missing spec to apply")
                apps_v1.patch_namespaced_daemon_set(name=name, namespace=namespace, body={"spec": spec})

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_daemonset_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_job(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _do() -> None:
                batch_v1.delete_namespaced_job(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            await self._set_cached("workloads", None)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_job_error", error=str(exc))
            return False, str(exc)

    async def get_job_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _do() -> str:
                obj = batch_v1.read_namespaced_job(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_job_yaml_error", error=str(exc))
            return None

    async def apply_job_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "Job":
                    raise RuntimeError("YAML kind must be Job")
                spec = body.get("spec", {}) if isinstance(body, dict) else {}
                if not spec:
                    raise RuntimeError("YAML missing spec to apply")
                batch_v1.patch_namespaced_job(name=name, namespace=namespace, body={"spec": spec})

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_job_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_cronjob(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _do() -> None:
                batch_v1.delete_namespaced_cron_job(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            await self._set_cached("workloads", None)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.delete_cronjob_error", error=str(exc))
            return False, str(exc)

    async def run_cronjob_now(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)
            core_v1, _ = await self._ensure_clients()

            def _do() -> None:
                cj = batch_v1.read_namespaced_cron_job(name=name, namespace=namespace)
                tpl = getattr(getattr(getattr(cj, "spec", None), "job_template", None), "spec", None)
                if not tpl:
                    raise RuntimeError("CronJob has no jobTemplate.spec")
                # Create a job with a unique name
                from kubernetes.client import V1Job, V1ObjectMeta, V1JobSpec
                job_name = f"{name}-manual-{int(datetime.now(tz=timezone.utc).timestamp())}"
                job = V1Job(
                    metadata=V1ObjectMeta(name=job_name, namespace=namespace),
                    spec=V1JobSpec(template=tpl.template, backoff_limit=tpl.backoff_limit, ttl_seconds_after_finished=getattr(tpl, "ttl_seconds_after_finished", None)),
                )
                batch_v1.create_namespaced_job(namespace=namespace, body=job)

            await asyncio.to_thread(_do)
            await self._set_cached("workloads", None)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.run_cronjob_now_error", error=str(exc))
            return False, str(exc)

    async def get_cronjob_yaml(self, namespace: str, name: str) -> str | None:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _do() -> str:
                obj = batch_v1.read_namespaced_cron_job(name=name, namespace=namespace)
                api_client = self._api_client or ApiClient()
                data = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("kubernetes.get_cronjob_yaml_error", error=str(exc))
            return None

    async def apply_cronjob_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        try:
            batch_v1 = client.BatchV1Api(self._api_client)

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "CronJob":
                    raise RuntimeError("YAML kind must be CronJob")
                spec = body.get("spec", {}) if isinstance(body, dict) else {}
                if not spec:
                    raise RuntimeError("YAML missing spec to apply")
                batch_v1.patch_namespaced_cron_job(name=name, namespace=namespace, body={"spec": spec})

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("kubernetes.apply_cronjob_yaml_error", error=str(exc))
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
                        metrics_out: list[dict] = []
                        try:
                            for m in getattr(spec, "metrics", []) or []:
                                mtype = getattr(m, "type", None)
                                if mtype == "Resource":
                                    res = getattr(m, "resource", None)
                                    if not res:
                                        continue
                                    res_name = getattr(res, "name", None)
                                    tgt = getattr(res, "target", None)
                                    target_type = getattr(tgt, "type", None) if tgt else None
                                    avg_util = getattr(tgt, "average_utilization", None) if tgt else None
                                    avg_val = getattr(tgt, "average_value", None) if tgt else None
                                    val = getattr(tgt, "value", None) if tgt else None
                                    # Derive legacy cpu utilization field
                                    if str(res_name) == "cpu" and str(target_type) == "Utilization" and cpu is None:
                                        cpu = avg_util
                                    metrics_out.append({
                                        "type": "Resource",
                                        "resource": {
                                            "name": res_name,
                                            "target": {
                                                "type": target_type,
                                                "average_utilization": avg_util,
                                                "average_value": (str(avg_val) if avg_val is not None else None),
                                                "value": (str(val) if val is not None else None),
                                            },
                                        },
                                    })
                                elif mtype == "Pods":
                                    pods = getattr(m, "pods", None)
                                    if not pods:
                                        continue
                                    metric = getattr(pods, "metric", None)
                                    metric_name = getattr(metric, "name", None) if metric else None
                                    tgt = getattr(pods, "target", None)
                                    target_type = getattr(tgt, "type", None) if tgt else None
                                    avg_val = getattr(tgt, "average_value", None) if tgt else None
                                    val = getattr(tgt, "value", None) if tgt else None
                                    metrics_out.append({
                                        "type": "Pods",
                                        "pods": {
                                            "metric_name": metric_name,
                                            "target": {
                                                "type": target_type,
                                                "average_value": (str(avg_val) if avg_val is not None else None),
                                                "value": (str(val) if val is not None else None),
                                            },
                                        },
                                    })
                                elif mtype == "External":
                                    ext = getattr(m, "external", None)
                                    if not ext:
                                        continue
                                    metric = getattr(ext, "metric", None)
                                    metric_name = getattr(metric, "name", None) if metric else None
                                    selector = getattr(metric, "selector", None)
                                    selector_labels = None
                                    try:
                                        if selector and getattr(selector, "match_labels", None):
                                            selector_labels = dict(getattr(selector, "match_labels"))
                                    except Exception:
                                        selector_labels = None
                                    tgt = getattr(ext, "target", None)
                                    target_type = getattr(tgt, "type", None) if tgt else None
                                    avg_val = getattr(tgt, "average_value", None) if tgt else None
                                    val = getattr(tgt, "value", None) if tgt else None
                                    metrics_out.append({
                                        "type": "External",
                                        "external": {
                                            "metric_name": metric_name,
                                            "selector": selector_labels,
                                            "target": {
                                                "type": target_type,
                                                "average_value": (str(avg_val) if avg_val is not None else None),
                                                "value": (str(val) if val is not None else None),
                                            },
                                        },
                                    })
                        except Exception:
                            pass
                        return {
                            "enabled": True,
                            "min_replicas": min_r,
                            "max_replicas": max_r,
                            "target_cpu_utilization": cpu,
                            "metrics": metrics_out,
                        }
                return {"enabled": False, "min_replicas": None, "max_replicas": None, "target_cpu_utilization": None, "metrics": []}

            return await asyncio.to_thread(_get)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.get_hpa_error", error=str(exc))
            return {"enabled": False, "min_replicas": None, "max_replicas": None, "target_cpu_utilization": None, "metrics": []}

    async def update_deployment_autoscaling(self, namespace: str, name: str, enabled: bool, min_replicas: int | None, max_replicas: int | None, target_cpu_utilization: int | None, metrics: list[dict] | None = None) -> tuple[bool, str | None]:
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
                spec: dict = {
                    "scaleTargetRef": {"apiVersion": "apps/v1", "kind": "Deployment", "name": name},
                    "minReplicas": min_replicas if min_replicas is not None else 1,
                    "maxReplicas": max_replicas if max_replicas is not None else 3,
                }

                metrics_body: list[dict] = []
                mlist = metrics or []
                if mlist:
                    for m in mlist:
                        mtype = str(m.get("type")) if isinstance(m, dict) else None
                        if mtype == "Resource":
                            res = (m.get("resource") or {}) if isinstance(m.get("resource"), dict) else {}
                            name_ = res.get("name")
                            tgt = (res.get("target") or {}) if isinstance(res.get("target"), dict) else {}
                            ttype = tgt.get("type")
                            entry: dict = {
                                "type": "Resource",
                                "resource": {
                                    "name": name_,
                                    "target": {"type": ttype},
                                },
                            }
                            if ttype == "Utilization" and tgt.get("average_utilization") is not None:
                                entry["resource"]["target"]["averageUtilization"] = int(tgt.get("average_utilization"))
                            if ttype == "AverageValue" and tgt.get("average_value") is not None:
                                entry["resource"]["target"]["averageValue"] = str(tgt.get("average_value"))
                            if ttype == "Value" and tgt.get("value") is not None:
                                entry["resource"]["target"]["value"] = str(tgt.get("value"))
                            metrics_body.append(entry)
                        elif mtype == "Pods":
                            pods = (m.get("pods") or {}) if isinstance(m.get("pods"), dict) else {}
                            metric_name = pods.get("metric_name")
                            tgt = (pods.get("target") or {}) if isinstance(pods.get("target"), dict) else {}
                            ttype = tgt.get("type")
                            entry = {
                                "type": "Pods",
                                "pods": {
                                    "metric": {"name": metric_name},
                                    "target": {"type": ttype},
                                },
                            }
                            if ttype == "AverageValue" and tgt.get("average_value") is not None:
                                entry["pods"]["target"]["averageValue"] = str(tgt.get("average_value"))
                            if ttype == "Value" and tgt.get("value") is not None:
                                entry["pods"]["target"]["value"] = str(tgt.get("value"))
                            metrics_body.append(entry)
                        elif mtype == "External":
                            ext = (m.get("external") or {}) if isinstance(m.get("external"), dict) else {}
                            metric_name = ext.get("metric_name")
                            selector = ext.get("selector") if isinstance(ext.get("selector"), dict) else None
                            tgt = (ext.get("target") or {}) if isinstance(ext.get("target"), dict) else {}
                            ttype = tgt.get("type")
                            metric_dict = {"name": metric_name}
                            if selector:
                                metric_dict["selector"] = {"matchLabels": selector}
                            entry = {
                                "type": "External",
                                "external": {
                                    "metric": metric_dict,
                                    "target": {"type": ttype},
                                },
                            }
                            if ttype == "AverageValue" and tgt.get("average_value") is not None:
                                entry["external"]["target"]["averageValue"] = str(tgt.get("average_value"))
                            if ttype == "Value" and tgt.get("value") is not None:
                                entry["external"]["target"]["value"] = str(tgt.get("value"))
                            metrics_body.append(entry)

                if metrics_body:
                    spec["metrics"] = metrics_body
                else:
                    # Fallback to legacy single CPU utilization metric
                    spec["metrics"] = [
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
                    ]

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

    # ---------------------------
    # CRDs & Generic resources
    # ---------------------------

    async def list_crds(self) -> list[CRDSummary]:
        async def _fetch() -> list[CRDSummary]:
            await self._rate_limiter.acquire()
            await self._ensure_clients()

            def _list() -> list[CRDSummary]:
                api_ext = client.ApiextensionsV1Api(self._api_client)
                crds = api_ext.list_custom_resource_definition().items
                items: list[CRDSummary] = []
                for crd in crds:
                    spec = getattr(crd, "spec", None)
                    if not spec:
                        continue
                    group = getattr(spec, "group", "")
                    versions = [getattr(v, "name", "") for v in getattr(spec, "versions", [])]
                    scope = getattr(spec, "scope", "Namespaced")
                    names = getattr(spec, "names", None)
                    kind = getattr(names, "kind", "") if names else ""
                    plural = getattr(names, "plural", "") if names else ""
                    # metadata can be model; use getattr fallback
                    meta = getattr(crd, "metadata", None)
                    crd_name = getattr(meta, "name", None) if meta is not None else None
                    if not crd_name and isinstance(meta, dict):
                        crd_name = meta.get("name")
                    items.append(
                        CRDSummary(
                            name=crd_name or "",
                            group=group,
                            versions=[v for v in versions if v] or [],
                            scope=scope,
                            kind=kind,
                            plural=plural,
                        )
                    )
                return items

            return await asyncio.to_thread(_list)

        key = "crds:list"
        try:
            return await self._cached(key, _fetch)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.crds_list_error", error=str(exc))
            return []

    async def list_crd_resources(self, crd_name: str, namespace: str | None = None) -> list[GenericResourceEntry]:
        async def _fetch() -> list[GenericResourceEntry]:
            await self._rate_limiter.acquire()
            await self._ensure_clients()

            def _list() -> list[GenericResourceEntry]:
                api_ext = client.ApiextensionsV1Api(self._api_client)
                crd = api_ext.read_custom_resource_definition(crd_name)
                spec = getattr(crd, "spec", None)
                if not spec:
                    return []
                group = getattr(spec, "group", "")
                names = getattr(spec, "names", None)
                plural = getattr(names, "plural", "") if names else ""
                scope = getattr(spec, "scope", "Namespaced")
                version = None
                for v in getattr(spec, "versions", []) or []:
                    if getattr(v, "served", False) and getattr(v, "storage", False):
                        version = getattr(v, "name", None)
                        break
                if not version:
                    for v in getattr(spec, "versions", []) or []:
                        if getattr(v, "served", False):
                            version = getattr(v, "name", None)
                            break
                if not version and getattr(spec, "versions", []):
                    try:
                        version = getattr(spec.versions[0], "name", None)
                    except Exception:
                        pass

                co = client.CustomObjectsApi(self._api_client)
                items: list[dict] = []
                if scope == "Namespaced":
                    if namespace and namespace != "all":
                        data = co.list_namespaced_custom_object(group, version, namespace, plural)
                        items = data.get("items", []) if isinstance(data, dict) else []
                    else:
                        data = co.list_cluster_custom_object(group, version, plural)
                        items = data.get("items", []) if isinstance(data, dict) else []
                else:
                    data = co.list_cluster_custom_object(group, version, plural)
                    items = data.get("items", []) if isinstance(data, dict) else []

                results: list[GenericResourceEntry] = []
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    md = it.get("metadata", {}) if isinstance(it, dict) else {}
                    name = md.get("name")
                    ns = md.get("namespace")
                    # creationTimestamp may exist but we keep None for now to avoid parsing
                    results.append(GenericResourceEntry(namespace=ns, name=name, created_at=None))
                return results

            return await asyncio.to_thread(_list)

        try:
            return await _fetch()
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.crd_resources_error", error=str(exc))
            return []

    async def get_generic_resource_yaml(
        self,
        group: str,
        version: str,
        plural: str,
        name: str,
        namespace: str | None = None,
    ) -> str | None:
        await self._rate_limiter.acquire()
        await self._ensure_clients()

        def _get() -> str | None:
            co = client.CustomObjectsApi(self._api_client)
            if namespace:
                obj = co.get_namespaced_custom_object(group, version, namespace, plural, name)
            else:
                obj = co.get_cluster_custom_object(group, version, plural, name)
            try:
                return yaml.safe_dump(obj, sort_keys=False)
            except Exception:
                return yaml.safe_dump(obj)

        try:
            return await asyncio.to_thread(_get)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.generic_get_error", error=str(exc))
            return None

    async def put_generic_resource_yaml(
        self,
        group: str,
        version: str,
        plural: str,
        name: str,
        yaml_text: str,
        namespace: str | None = None,
    ) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        await self._ensure_clients()

        def _put() -> tuple[bool, str | None]:
            body = yaml.safe_load(yaml_text)
            if not isinstance(body, dict):
                return False, "YAML must represent a Kubernetes object"
            md = body.get("metadata", {}) if isinstance(body, dict) else {}
            body_name = md.get("name")
            body_ns = md.get("namespace")
            if body_name and body_name != name:
                return False, "metadata.name does not match"
            if namespace and body_ns and body_ns != namespace:
                return False, "metadata.namespace does not match"

            co = client.CustomObjectsApi(self._api_client)
            if namespace:
                co.replace_namespaced_custom_object(group, version, namespace, plural, name, body)
            else:
                co.replace_cluster_custom_object(group, version, plural, name, body)
            return True, None

        try:
            return await asyncio.to_thread(_put)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.generic_put_error", error=str(exc))
            return False, str(exc)

    async def delete_generic_resource(
        self,
        group: str,
        version: str,
        plural: str,
        name: str,
        namespace: str | None = None,
    ) -> tuple[bool, str | None]:
        await self._rate_limiter.acquire()
        await self._ensure_clients()

        def _delete() -> tuple[bool, str | None]:
            co = client.CustomObjectsApi(self._api_client)
            if namespace:
                co.delete_namespaced_custom_object(group, version, namespace, plural, name)
            else:
                co.delete_cluster_custom_object(group, version, plural, name)
            return True, None

        try:
            return await asyncio.to_thread(_delete)
        except Exception as exc:  # pragma: no cover
            logger.warning("kubernetes.generic_delete_error", error=str(exc))
            return False, str(exc)
