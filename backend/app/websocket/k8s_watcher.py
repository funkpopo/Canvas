import asyncio
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable
import structlog
from kubernetes import client, watch
from kubernetes.client import ApiException

from app.schemas.websocket import EventType, WebSocketMessage

logger = structlog.get_logger(__name__)


class K8sWatcher:
    """Watch Kubernetes resources and broadcast WebSocket notifications"""

    def __init__(
        self,
        apps_v1_api: client.AppsV1Api,
        core_v1_api: client.CoreV1Api,
        on_event: Callable[[WebSocketMessage], Awaitable[None]],
    ):
        self.apps_v1 = apps_v1_api
        self.core_v1 = core_v1_api
        try:
            self.batch_v1 = client.BatchV1Api(core_v1_api.api_client)
        except Exception:
            self.batch_v1 = client.BatchV1Api()
        try:
            self.networking_v1 = client.NetworkingV1Api(core_v1_api.api_client)
        except Exception:
            self.networking_v1 = client.NetworkingV1Api()
        self.on_event = on_event
        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        """Start all watchers"""
        logger.info("k8s_watcher.starting")

        # Deployments
        t1 = asyncio.create_task(self._watch_deployments())
        t1.set_name("watch_deployments")
        self._tasks.append(t1)

        # Pods
        t2 = asyncio.create_task(self._watch_pods())
        t2.set_name("watch_pods")
        self._tasks.append(t2)

        # StatefulSets
        t3 = asyncio.create_task(self._watch_statefulsets())
        t3.set_name("watch_statefulsets")
        self._tasks.append(t3)

        # Jobs
        t4 = asyncio.create_task(self._watch_jobs())
        t4.set_name("watch_jobs")
        self._tasks.append(t4)

        # CronJobs
        t5 = asyncio.create_task(self._watch_cronjobs())
        t5.set_name("watch_cronjobs")
        self._tasks.append(t5)

        # Services
        t6 = asyncio.create_task(self._watch_services())
        t6.set_name("watch_services")
        self._tasks.append(t6)

        # Ingresses
        t7 = asyncio.create_task(self._watch_ingresses())
        t7.set_name("watch_ingresses")
        self._tasks.append(t7)

        # Nodes
        t8 = asyncio.create_task(self._watch_nodes())
        t8.set_name("watch_nodes")
        self._tasks.append(t8)

        logger.info("k8s_watcher.started", tasks=len(self._tasks))

    async def stop(self) -> None:
        """Stop all watchers"""
        logger.info("k8s_watcher.stopping")
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        logger.info("k8s_watcher.stopped")

    async def _watch_deployments(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Deployment",
                    watch_func=lambda: watch.Watch().stream(
                        self.apps_v1.list_deployment_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.deployment_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_pods(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Pod",
                    watch_func=lambda: watch.Watch().stream(
                        self.core_v1.list_pod_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.pod_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_statefulsets(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="StatefulSet",
                    watch_func=lambda: watch.Watch().stream(
                        self.apps_v1.list_stateful_set_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.statefulset_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_jobs(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Job",
                    watch_func=lambda: watch.Watch().stream(
                        self.batch_v1.list_job_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.job_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_cronjobs(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="CronJob",
                    watch_func=lambda: watch.Watch().stream(
                        self.batch_v1.list_cron_job_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.cronjob_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_services(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Service",
                    watch_func=lambda: watch.Watch().stream(
                        self.core_v1.list_service_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.service_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_ingresses(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Ingress",
                    watch_func=lambda: watch.Watch().stream(
                        self.networking_v1.list_ingress_for_all_namespaces, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.ingress_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_nodes(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Node",
                    watch_func=lambda: watch.Watch().stream(
                        self.core_v1.list_node, timeout_seconds=60
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.node_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_resource(self, resource_type: str, watch_func: Callable) -> None:
        w = watch.Watch()

        def _run_watch():
            try:
                return list(watch_func())
            except ApiException as e:
                if e.status == 410:  # Resource version too old
                    logger.info(f"k8s_watcher.{resource_type.lower()}_rewatch")
                    return []
                raise

        try:
            for event in await asyncio.to_thread(_run_watch):
                if self._stop_event.is_set():
                    break
                await self._handle_event(resource_type, event)
        finally:
            w.stop()

    async def _handle_event(self, resource_type: str, event: dict[str, Any]) -> None:
        try:
            event_type_raw = str(event.get("type", "")).upper()  # ADDED, MODIFIED, DELETED
            obj = event.get("object")
            if not obj:
                return
            metadata = getattr(obj, "metadata", None)
            if not metadata:
                return
            namespace = getattr(metadata, "namespace", "default")
            name = getattr(metadata, "name", "")

            event_type_map = {
                ("Deployment", "ADDED"): EventType.DEPLOYMENT_ADDED,
                ("Deployment", "MODIFIED"): EventType.DEPLOYMENT_MODIFIED,
                ("Deployment", "DELETED"): EventType.DEPLOYMENT_DELETED,
                ("StatefulSet", "ADDED"): EventType.STATEFULSET_ADDED,
                ("StatefulSet", "MODIFIED"): EventType.STATEFULSET_MODIFIED,
                ("StatefulSet", "DELETED"): EventType.STATEFULSET_DELETED,
                ("Job", "ADDED"): EventType.JOB_ADDED,
                ("Job", "MODIFIED"): EventType.JOB_MODIFIED,
                ("Job", "DELETED"): EventType.JOB_DELETED,
                ("CronJob", "ADDED"): EventType.CRONJOB_ADDED,
                ("CronJob", "MODIFIED"): EventType.CRONJOB_MODIFIED,
                ("CronJob", "DELETED"): EventType.CRONJOB_DELETED,
                ("Pod", "ADDED"): EventType.POD_ADDED,
                ("Pod", "MODIFIED"): EventType.POD_MODIFIED,
                ("Pod", "DELETED"): EventType.POD_DELETED,
                ("Service", "ADDED"): EventType.SERVICE_ADDED,
                ("Service", "MODIFIED"): EventType.SERVICE_MODIFIED,
                ("Service", "DELETED"): EventType.SERVICE_DELETED,
                ("Ingress", "ADDED"): EventType.INGRESS_ADDED,
                ("Ingress", "MODIFIED"): EventType.INGRESS_MODIFIED,
                ("Ingress", "DELETED"): EventType.INGRESS_DELETED,
                ("Node", "ADDED"): EventType.NODE_ADDED,
                ("Node", "MODIFIED"): EventType.NODE_MODIFIED,
                ("Node", "DELETED"): EventType.NODE_DELETED,
            }

            event_type = event_type_map.get((resource_type, event_type_raw))
            if not event_type:
                return

            data = self._extract_resource_data_v2(resource_type, obj)
            message = WebSocketMessage(
                type=event_type,
                resource_type=resource_type,
                namespace=namespace,
                name=name,
                data=data,
            )

            await self.on_event(message)
        except Exception as e:
            logger.warning("k8s_watcher.handle_event_error", error=str(e))

    def _extract_resource_data_v2(self, resource_type: str, obj: Any) -> dict[str, Any]:
        """Extract useful fields for WS consumers."""
        data: dict[str, Any] = {}

        if resource_type == "Deployment":
            status = getattr(obj, "status", None)
            if status:
                data["replicas_desired"] = getattr(status, "replicas", 0) or 0
                data["replicas_ready"] = getattr(status, "ready_replicas", 0) or 0
                ready = data["replicas_ready"]
                desired = data["replicas_desired"]
                data["status"] = "Healthy" if ready == desired else "Warning"
        elif resource_type == "StatefulSet":
            status = getattr(obj, "status", None)
            if status:
                data["replicas_desired"] = getattr(status, "replicas", 0) or 0
                data["replicas_ready"] = getattr(status, "ready_replicas", 0) or 0
                ready = data["replicas_ready"]
                desired = data["replicas_desired"]
                data["status"] = "Healthy" if ready == desired else "Warning"
        elif resource_type == "Job":
            status = getattr(obj, "status", None)
            if status:
                data["active"] = getattr(status, "active", 0) or 0
                data["succeeded"] = getattr(status, "succeeded", 0) or 0
                data["failed"] = getattr(status, "failed", 0) or 0
        elif resource_type == "CronJob":
            status = getattr(obj, "status", None)
            if status:
                try:
                    active = getattr(status, "active", None) or []
                    data["active"] = len(active)
                except Exception:
                    data["active"] = 0
                lss = getattr(status, "last_schedule_time", None)
                data["last_schedule_time"] = lss.isoformat() if lss else None
        elif resource_type == "Pod":
            status = getattr(obj, "status", None)
            if status:
                data["phase"] = getattr(status, "phase", "Unknown")
                container_statuses = getattr(status, "container_statuses", []) or []
                data["ready_containers"] = sum(1 for cs in container_statuses if getattr(cs, "ready", False))
                data["total_containers"] = len(container_statuses)

                containers: list[dict[str, object]] = []
                try:
                    for cs in container_statuses:
                        st = getattr(cs, "state", None)
                        state_val = "Unknown"
                        state_reason = None
                        state_message = None
                        try:
                            if getattr(st, "waiting", None):
                                state_val = "Waiting"
                                state_reason = getattr(st.waiting, "reason", None)
                                state_message = getattr(st.waiting, "message", None)
                            elif getattr(st, "running", None):
                                state_val = "Running"
                            elif getattr(st, "terminated", None):
                                state_val = "Terminated"
                                state_reason = getattr(st.terminated, "reason", None)
                                state_message = getattr(st.terminated, "message", None)
                        except Exception:
                            state_val = "Unknown"
                            state_reason = None
                            state_message = None
                        containers.append(
                            {
                                "name": getattr(cs, "name", ""),
                                "ready": getattr(cs, "ready", None),
                                "restart_count": getattr(cs, "restart_count", None),
                                "image": getattr(cs, "image", None),
                                "state": state_val,
                                "state_reason": state_reason,
                                "state_message": state_message,
                            }
                        )
                except Exception:
                    containers = []
                data["containers"] = containers
        elif resource_type == "Service":
            spec = getattr(obj, "spec", None)
            if spec:
                data["type"] = getattr(spec, "type", None)
                data["cluster_ip"] = getattr(spec, "cluster_ip", None)
                try:
                    ports = getattr(spec, "ports", None) or []
                    data["ports_count"] = len(ports)
                except Exception:
                    data["ports_count"] = 0
        elif resource_type == "Ingress":
            spec = getattr(obj, "spec", None)
            rules = getattr(spec, "rules", None) if spec else None
            try:
                data["rules_count"] = len(rules or [])
            except Exception:
                data["rules_count"] = 0
        elif resource_type == "Node":
            status = getattr(obj, "status", None)
            if status:
                conditions = getattr(status, "conditions", None) or []
                ready_cond = None
                try:
                    for c in conditions:
                        if getattr(c, "type", None) == "Ready":
                            ready_cond = c
                            break
                except Exception:
                    ready_cond = None
                is_ready = None
                try:
                    if ready_cond is not None:
                        is_ready = True if getattr(ready_cond, "status", None) == "True" else False
                except Exception:
                    is_ready = None
                data["status"] = "Ready" if is_ready else "NotReady"

        data["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
        return data
