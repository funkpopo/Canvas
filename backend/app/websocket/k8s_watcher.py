import asyncio
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable
import structlog
from kubernetes import client, watch
from kubernetes.client import ApiException

from app.schemas.websocket import EventType, WebSocketMessage

logger = structlog.get_logger(__name__)


class K8sWatcher:
    """监听Kubernetes资源变化并发送WebSocket通知"""

    def __init__(
        self,
        apps_v1_api: client.AppsV1Api,
        core_v1_api: client.CoreV1Api,
        on_event: Callable[[WebSocketMessage], Awaitable[None]],
    ):
        self.apps_v1 = apps_v1_api
        self.core_v1 = core_v1_api
        self.on_event = on_event
        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

    async def start(self):
        """启动所有watcher"""
        logger.info("k8s_watcher.starting")
        
        # 启动deployment watcher
        task1 = asyncio.create_task(self._watch_deployments())
        task1.set_name("watch_deployments")
        self._tasks.append(task1)
        
        # 启动pod watcher
        task2 = asyncio.create_task(self._watch_pods())
        task2.set_name("watch_pods")
        self._tasks.append(task2)
        
        logger.info("k8s_watcher.started", tasks=len(self._tasks))

    async def stop(self):
        """停止所有watcher"""
        logger.info("k8s_watcher.stopping")
        self._stop_event.set()
        
        for task in self._tasks:
            task.cancel()
        
        await asyncio.gather(*self._tasks, return_exceptions=True)
        logger.info("k8s_watcher.stopped")

    async def _watch_deployments(self):
        """监听Deployment资源变化"""
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Deployment",
                    watch_func=lambda: watch.Watch().stream(
                        self.apps_v1.list_deployment_for_all_namespaces,
                        timeout_seconds=60,
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.deployment_error", error=str(e))
                await asyncio.sleep(2)  # 重试前等待

    async def _watch_pods(self):
        """监听Pod资源变化"""
        while not self._stop_event.is_set():
            try:
                await self._watch_resource(
                    resource_type="Pod",
                    watch_func=lambda: watch.Watch().stream(
                        self.core_v1.list_pod_for_all_namespaces,
                        timeout_seconds=60,
                    ),
                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("k8s_watcher.pod_error", error=str(e))
                await asyncio.sleep(2)

    async def _watch_resource(self, resource_type: str, watch_func: Callable):
        """通用资源监听逻辑"""
        w = watch.Watch()
        
        def _run_watch():
            """在线程中运行K8s watch"""
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

    async def _handle_event(self, resource_type: str, event: dict[str, Any]):
        """处理单个资源事件"""
        try:
            event_type_raw = event.get("type", "").upper()  # ADDED, MODIFIED, DELETED
            obj = event.get("object")
            
            if not obj:
                return
            
            metadata = getattr(obj, "metadata", None)
            if not metadata:
                return
            
            namespace = getattr(metadata, "namespace", "default")
            name = getattr(metadata, "name", "")
            
            # 映射K8s事件类型到WebSocket事件类型
            event_type_map = {
                ("Deployment", "ADDED"): EventType.DEPLOYMENT_ADDED,
                ("Deployment", "MODIFIED"): EventType.DEPLOYMENT_MODIFIED,
                ("Deployment", "DELETED"): EventType.DEPLOYMENT_DELETED,
                ("Pod", "ADDED"): EventType.POD_ADDED,
                ("Pod", "MODIFIED"): EventType.POD_MODIFIED,
                ("Pod", "DELETED"): EventType.POD_DELETED,
            }
            
            event_type = event_type_map.get((resource_type, event_type_raw))
            if not event_type:
                return
            
            # 提取关键数据
            data = self._extract_resource_data(resource_type, obj)
            
            # 创建并发送WebSocket消息
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

    def _extract_resource_data(self, resource_type: str, obj: Any) -> dict[str, Any]:
        """提取资源关键数据"""
        data: dict[str, Any] = {}
        
        if resource_type == "Deployment":
            status = getattr(obj, "status", None)
            if status:
                data["replicas_desired"] = getattr(status, "replicas", 0) or 0
                data["replicas_ready"] = getattr(status, "ready_replicas", 0) or 0
                ready = data["replicas_ready"]
                desired = data["replicas_desired"]
                data["status"] = "Healthy" if ready == desired else "Warning"
        
        elif resource_type == "Pod":
            status = getattr(obj, "status", None)
            if status:
                data["phase"] = getattr(status, "phase", "Unknown")
                
                # 容器就绪状态
                container_statuses = getattr(status, "container_statuses", []) or []
                data["ready_containers"] = sum(
                    1 for cs in container_statuses if getattr(cs, "ready", False)
                )
                data["total_containers"] = len(container_statuses)
        
        data["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
        
        return data
