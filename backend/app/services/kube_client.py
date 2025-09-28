from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import structlog
import yaml
from cachetools import TTLCache
from kubernetes import client, config
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
    MetricsServerStatus,
    ClusterCapacityMetrics,
    WorkloadSummary,
    ClusterStorageSummary,
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
                            )
                        )
                    return summaries

                return await asyncio.to_thread(_collect)
            except Exception as exc:  # pragma: no cover
                logger.warning("kubernetes.list_nodes_fallback", error=str(exc))
                return []

        return await self._cached("nodes", _fetch)

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
