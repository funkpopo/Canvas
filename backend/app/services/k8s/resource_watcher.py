"""
Kubernetes资源监听器模块
提供实时资源监控功能
"""

import asyncio
import threading
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor

from kubernetes import client, watch

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import create_one_off_k8s_client, close_one_off_k8s_client
from .utils import calculate_age


logger = get_logger(__name__)


class KubernetesResourceWatcher:
    """Kubernetes资源监听器"""

    def __init__(self, cluster: Cluster):
        self.cluster = cluster
        self.client_instance = None
        self._client_temp_files = []
        self.watchers: Dict[str, Any] = {}  # 存储不同资源类型的监听器
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix=f"k8s-watcher-{cluster.id}")
        self.running = False
        self.loop = None
        self.loop_thread = None

    def start(self):
        """启动资源监听"""
        if self.running:
            return

        self.running = True
        self.client_instance, self._client_temp_files = create_one_off_k8s_client(self.cluster)

        if not self.client_instance:
            logger.error(f"Failed to create Kubernetes client for cluster {self.cluster.id}")
            return

        # 在新线程中运行事件循环
        self.loop_thread = threading.Thread(
            target=self._run_event_loop,
            daemon=True,
            name=f"k8s-watcher-loop-{self.cluster.id}"
        )
        self.loop_thread.start()

        logger.info(f"Started Kubernetes resource watchers for cluster {self.cluster.id}")

    def _run_event_loop(self):
        """在独立线程中运行事件循环"""
        try:
            # 创建新的事件循环
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

            # 启动各个资源类型的监听
            self.loop.create_task(self._start_pod_watcher())
            self.loop.create_task(self._start_deployment_watcher())
            self.loop.create_task(self._start_job_watcher())
            self.loop.create_task(self._start_service_watcher())

            # 运行事件循环直到被停止
            self.loop.run_forever()
        except Exception as e:
            logger.error(f"Error in watcher event loop for cluster {self.cluster.id}: {e}")
        finally:
            if self.loop and not self.loop.is_closed():
                self.loop.close()

    def stop(self):
        """停止资源监听"""
        if not self.running:
            return

        self.running = False

        # 停止所有监听器
        for watcher_name, watcher in self.watchers.items():
            try:
                watcher.stop()
            except Exception as e:
                logger.error(f"Error stopping watcher {watcher_name}: {e}")

        self.watchers.clear()

        # 停止事件循环
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)

        # 等待线程结束
        if self.loop_thread and self.loop_thread.is_alive():
            self.loop_thread.join(timeout=5)

        # 关闭客户端连接
        if self.client_instance:
            try:
                close_one_off_k8s_client(self.client_instance, self._client_temp_files)
            except Exception as e:
                logger.error(f"Error closing Kubernetes client: {e}")
            self.client_instance = None
            self._client_temp_files = []

        # 关闭线程池
        self.executor.shutdown(wait=False)

        logger.info(f"Stopped Kubernetes resource watchers for cluster {self.cluster.id}")

    async def _start_pod_watcher(self):
        """启动Pod监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            core_v1 = client.CoreV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['pods'] = w

            logger.info(f"Starting pod watcher for cluster {self.cluster.id}")

            for event in w.stream(core_v1.list_pod_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_pod_event(event)
                except Exception as e:
                    logger.error(f"Error handling pod event: {e}")

        except Exception as e:
            logger.error(f"Pod watcher error for cluster {self.cluster.id}: {e}")

    async def _start_deployment_watcher(self):
        """启动Deployment监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            apps_v1 = client.AppsV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['deployments'] = w

            logger.info(f"Starting deployment watcher for cluster {self.cluster.id}")

            for event in w.stream(apps_v1.list_deployment_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_deployment_event(event)
                except Exception as e:
                    logger.error(f"Error handling deployment event: {e}")

        except Exception as e:
            logger.error(f"Deployment watcher error for cluster {self.cluster.id}: {e}")

    async def _start_job_watcher(self):
        """启动Job监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            batch_v1 = client.BatchV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['jobs'] = w

            logger.info(f"Starting job watcher for cluster {self.cluster.id}")

            for event in w.stream(batch_v1.list_job_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_job_event(event)
                except Exception as e:
                    logger.error(f"Error handling job event: {e}")

        except Exception as e:
            logger.error(f"Job watcher error for cluster {self.cluster.id}: {e}")

    async def _start_service_watcher(self):
        """启动Service监听器"""
        if not self.running or not self.client_instance:
            return

        try:
            core_v1 = client.CoreV1Api(self.client_instance)
            w = watch.Watch()

            self.watchers['services'] = w

            logger.info(f"Starting service watcher for cluster {self.cluster.id}")

            for event in w.stream(core_v1.list_service_for_all_namespaces):
                if not self.running:
                    break

                try:
                    await self._handle_service_event(event)
                except Exception as e:
                    logger.error(f"Error handling service event: {e}")

        except Exception as e:
            logger.error(f"Service watcher error for cluster {self.cluster.id}: {e}")

    async def _handle_pod_event(self, event):
        """处理Pod事件"""
        try:
            from ...websocket_manager import manager
        except ImportError:
            from websocket_manager import manager

        event_type = event['type']  # ADDED, MODIFIED, DELETED
        pod = event['object']

        # 构建Pod数据
        pod_data = {
            'name': pod.metadata.name,
            'namespace': pod.metadata.namespace,
            'status': pod.status.phase,
            'node_name': pod.spec.node_name,
            'restart_count': sum(container.restart_count for container in (pod.status.container_statuses or [])),
            'ready_containers': f"{sum(1 for cs in (pod.status.container_statuses or []) if cs.ready)}/{len(pod.spec.containers)}",
            'age': self._calculate_age(pod.metadata.creation_timestamp),
            'labels': pod.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='pods',
            resource_data=pod_data,
            namespace=pod.metadata.namespace
        )

    async def _handle_deployment_event(self, event):
        """处理Deployment事件"""
        try:
            from ...websocket_manager import manager
        except ImportError:
            from websocket_manager import manager

        event_type = event['type']
        deployment = event['object']

        # 构建Deployment数据
        deployment_data = {
            'name': deployment.metadata.name,
            'namespace': deployment.metadata.namespace,
            'replicas': deployment.spec.replicas,
            'ready_replicas': deployment.status.ready_replicas or 0,
            'available_replicas': deployment.status.available_replicas or 0,
            'unavailable_replicas': deployment.status.unavailable_replicas or 0,
            'age': self._calculate_age(deployment.metadata.creation_timestamp),
            'labels': deployment.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='deployments',
            resource_data=deployment_data,
            namespace=deployment.metadata.namespace
        )

    async def _handle_job_event(self, event):
        """处理Job事件"""
        try:
            from ...websocket_manager import manager
        except ImportError:
            from websocket_manager import manager

        event_type = event['type']
        job = event['object']

        # 构建Job数据
        job_data = {
            'name': job.metadata.name,
            'namespace': job.metadata.namespace,
            'completions': job.spec.completions,
            'succeeded': job.status.succeeded or 0,
            'failed': job.status.failed or 0,
            'active': job.status.active or 0,
            'age': self._calculate_age(job.metadata.creation_timestamp),
            'status': self._get_job_status(job),
            'labels': job.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='jobs',
            resource_data=job_data,
            namespace=job.metadata.namespace
        )

    async def _handle_service_event(self, event):
        """处理Service事件"""
        try:
            from ...websocket_manager import manager
        except ImportError:
            from websocket_manager import manager

        event_type = event['type']
        service = event['object']

        # 构建Service数据
        service_data = {
            'name': service.metadata.name,
            'namespace': service.metadata.namespace,
            'type': service.spec.type,
            'cluster_ip': service.spec.cluster_ip,
            'external_ip': (service.status.load_balancer.ingress[0].ip
                          if service.status.load_balancer.ingress else None),
            'ports': [{'port': p.port, 'target_port': p.target_port, 'protocol': p.protocol}
                     for p in (service.spec.ports or [])],
            'selector': service.spec.selector or {},
            'age': self._calculate_age(service.metadata.creation_timestamp),
            'labels': service.metadata.labels or {},
            'event_type': event_type
        }

        # 广播更新
        await manager.broadcast_resource_update(
            cluster_id=self.cluster.id,
            resource_type='services',
            resource_data=service_data,
            namespace=service.metadata.namespace
        )

    def _calculate_age(self, creation_timestamp) -> str:
        """计算资源年龄"""
        if not creation_timestamp:
            return "Unknown"

        now = datetime.utcnow().replace(tzinfo=creation_timestamp.tzinfo)
        age_seconds = (now - creation_timestamp).total_seconds()

        if age_seconds < 60:
            return f"{int(age_seconds)}s"
        elif age_seconds < 3600:
            return f"{int(age_seconds / 60)}m"
        elif age_seconds < 86400:
            return f"{int(age_seconds / 3600)}h"
        else:
            return f"{int(age_seconds / 86400)}d"

    def _get_job_status(self, job) -> str:
        """获取Job状态"""
        if not job.status.conditions:
            return "Pending"

        # 按时间排序，取最新的条件
        latest_condition = max(job.status.conditions, key=lambda c: c.last_transition_time or "")
        return latest_condition.type


class KubernetesWatcherManager:
    """Kubernetes监听器管理器"""

    def __init__(self):
        self.watchers: Dict[int, KubernetesResourceWatcher] = {}
        self.running = False

    def start_watcher(self, cluster: Cluster):
        """启动集群监听器"""
        if cluster.id in self.watchers:
            return

        watcher = KubernetesResourceWatcher(cluster)
        self.watchers[cluster.id] = watcher
        watcher.start()

        logger.info(f"Started watcher for cluster {cluster.id}")

    def stop_watcher(self, cluster_id: int):
        """停止集群监听器"""
        if cluster_id in self.watchers:
            watcher = self.watchers[cluster_id]
            watcher.stop()
            del self.watchers[cluster_id]

            logger.info(f"Stopped watcher for cluster {cluster_id}")

    def stop_all_watchers(self):
        """停止所有监听器"""
        for cluster_id, watcher in self.watchers.items():
            try:
                watcher.stop()
            except Exception as e:
                logger.error(f"Error stopping watcher for cluster {cluster_id}: {e}")

        self.watchers.clear()
        logger.info("Stopped all Kubernetes watchers")

    def get_watcher_stats(self) -> Dict[str, Any]:
        """获取监听器统计信息"""
        return {
            "active_watchers": len(self.watchers),
            "cluster_ids": list(self.watchers.keys())
        }


# 全局监听器管理器实例
watcher_manager = KubernetesWatcherManager()


# 全局线程池用于异步启动watcher
_watcher_startup_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="watcher-startup")


def start_watcher_async(cluster: Cluster):
    """在线程池中异步启动watcher，避免阻塞API请求"""
    def _start():
        try:
            watcher_manager.start_watcher(cluster)
        except Exception as e:
            logger.error(f"Error starting watcher for cluster {cluster.id}: {e}")

    _watcher_startup_executor.submit(_start)
