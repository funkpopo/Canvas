"""
告警检查器（后台任务）

注意：
- DB / Kubernetes Python client 均为同步 I/O，需放入线程池执行，避免阻塞 FastAPI 事件循环。
- 该任务建议通过 `ENABLE_BACKGROUND_TASKS` 在单独进程/worker 中启用。
"""

import asyncio
import json
import os
from datetime import datetime
from typing import Any, Dict, Optional

from kubernetes import client as k8s_client
from sqlalchemy.orm import Session

from ..core.logging import get_logger
from ..database import SessionLocal
from ..models import AlertRule, AlertEvent, Cluster
from .k8s import get_node_metrics, KubernetesClientContext

logger = get_logger(__name__)


class AlertChecker:
    """告警检查器"""

    def __init__(self) -> None:
        self.running = False
        try:
            self.check_interval = int(os.getenv("ALERT_CHECK_INTERVAL_SECONDS", "60"))
        except ValueError:
            self.check_interval = 60

    async def start(self) -> None:
        """启动告警检查（异步壳，实际工作在线程池中执行）"""
        self.running = True
        logger.info("告警检查器已启动")

        while self.running:
            try:
                # 线程池执行同步 I/O，避免阻塞事件循环。
                await asyncio.to_thread(self.check_all_rules_sync)
            except Exception as e:
                logger.exception("告警检查失败: %s", e)

            try:
                await asyncio.sleep(self.check_interval)
            except Exception:
                # sleep 被取消等情况：下一轮由 running 控制
                pass

    async def stop(self) -> None:
        """停止告警检查"""
        self.running = False
        logger.info("告警检查器已停止")

    # -------------------------
    # 同步实现（在线程池中运行）
    # -------------------------

    def check_all_rules_sync(self) -> None:
        """检查所有启用的告警规则（同步）"""
        db = SessionLocal()
        try:
            rules = db.query(AlertRule).filter(AlertRule.enabled == True).all()
            for rule in rules:
                try:
                    self.check_rule_sync(db, rule)
                except Exception as e:
                    logger.exception("检查规则 %s 失败: %s", getattr(rule, "name", "<unknown>"), e)
        finally:
            db.close()

    def check_rule_sync(self, db: Session, rule: AlertRule) -> None:
        """检查单个告警规则（同步）"""
        if rule.rule_type == "resource_usage":
            self.check_resource_usage_sync(db, rule)
        elif rule.rule_type == "pod_restart":
            self.check_pod_restart_sync(db, rule)
        elif rule.rule_type == "node_unavailable":
            self.check_node_unavailable_sync(db, rule)

    def _load_threshold_config(self, rule: AlertRule) -> Dict[str, Any]:
        raw = getattr(rule, "threshold_config", None) or "{}"
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def check_resource_usage_sync(self, db: Session, rule: AlertRule) -> None:
        """检查资源使用超限（同步）"""
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            return

        config = self._load_threshold_config(rule)
        cpu_threshold = config.get("cpu_percent")
        memory_threshold = config.get("memory_percent")

        node_metrics = get_node_metrics(cluster)  # 同步 K8s 请求
        if not node_metrics:
            return

        for node_metric in node_metrics:
            cpu_percent = float(node_metric.get("cpu_percentage", 0) or 0)
            memory_percent = float(node_metric.get("memory_percentage", 0) or 0)
            node_name = node_metric.get("name") or "<unknown>"

            if cpu_threshold is not None and cpu_percent > cpu_threshold:
                self.trigger_alert_sync(
                    db,
                    rule,
                    resource_type="node",
                    resource_name=node_name,
                    namespace=None,
                    message=f"节点 {node_name} CPU使用率 {cpu_percent:.1f}% 超过阈值 {cpu_threshold}%",
                    details={"cpu_usage": cpu_percent, "threshold": cpu_threshold},
                )
            elif memory_threshold is not None and memory_percent > memory_threshold:
                self.trigger_alert_sync(
                    db,
                    rule,
                    resource_type="node",
                    resource_name=node_name,
                    namespace=None,
                    message=f"节点 {node_name} 内存使用率 {memory_percent:.1f}% 超过阈值 {memory_threshold}%",
                    details={"memory_usage": memory_percent, "threshold": memory_threshold},
                )
            else:
                self.resolve_alert_sync(
                    db,
                    rule,
                    resource_type="node",
                    resource_name=node_name,
                    namespace=None,
                )

    def check_pod_restart_sync(self, db: Session, rule: AlertRule) -> None:
        """检查Pod异常重启（同步）"""
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            return

        config = self._load_threshold_config(rule)
        try:
            restart_threshold = int(config.get("restart_count", 5) or 5)
        except Exception:
            restart_threshold = 5

        try:
            with KubernetesClientContext(cluster) as api_client:
                if not api_client:
                    return

                core_v1 = k8s_client.CoreV1Api(api_client)
                pods = core_v1.list_pod_for_all_namespaces()

                for pod in pods.items:
                    restart_count = 0
                    for container_status in (pod.status.container_statuses or []):
                        restart_count += int(container_status.restart_count or 0)

                    pod_name = pod.metadata.name
                    pod_ns = pod.metadata.namespace

                    if restart_count >= restart_threshold:
                        self.trigger_alert_sync(
                            db,
                            rule,
                            resource_type="pod",
                            resource_name=pod_name,
                            namespace=pod_ns,
                            message=f"Pod {pod_ns}/{pod_name} 重启次数 {restart_count} 超过阈值 {restart_threshold}",
                            details={"restart_count": restart_count, "threshold": restart_threshold},
                        )
                    else:
                        self.resolve_alert_sync(
                            db,
                            rule,
                            resource_type="pod",
                            resource_name=pod_name,
                            namespace=pod_ns,
                        )
        except Exception as e:
            logger.exception("检查Pod重启失败: %s", e)

    def check_node_unavailable_sync(self, db: Session, rule: AlertRule) -> None:
        """检查节点不可用（同步）"""
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            return

        try:
            with KubernetesClientContext(cluster) as api_client:
                if not api_client:
                    return

                core_v1 = k8s_client.CoreV1Api(api_client)
                nodes = core_v1.list_node()

                for node in nodes.items:
                    is_ready = False
                    for condition in (node.status.conditions or []):
                        if condition.type == "Ready":
                            is_ready = condition.status == "True"
                            break

                    node_name = node.metadata.name

                    if not is_ready:
                        self.trigger_alert_sync(
                            db,
                            rule,
                            resource_type="node",
                            resource_name=node_name,
                            namespace=None,
                            message=f"节点 {node_name} 不可用",
                            details={"ready": is_ready},
                        )
                    else:
                        self.resolve_alert_sync(
                            db,
                            rule,
                            resource_type="node",
                            resource_name=node_name,
                            namespace=None,
                        )
        except Exception as e:
            logger.exception("检查节点可用性失败: %s", e)

    def trigger_alert_sync(
        self,
        db: Session,
        rule: AlertRule,
        resource_type: str,
        resource_name: str,
        message: str,
        namespace: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """触发告警（同步）"""
        q = db.query(AlertEvent).filter(
            AlertEvent.rule_id == rule.id,
            AlertEvent.resource_type == resource_type,
            AlertEvent.resource_name == resource_name,
            AlertEvent.status == "firing",
        )
        if namespace is not None:
            q = q.filter(AlertEvent.namespace == namespace)

        existing_event = q.first()

        if existing_event:
            existing_event.last_triggered_at = datetime.now()
            if details is not None:
                existing_event.details = json.dumps(details)
        else:
            new_event = AlertEvent(
                rule_id=rule.id,
                cluster_id=rule.cluster_id,
                resource_type=resource_type,
                resource_name=resource_name,
                namespace=namespace,
                severity=rule.severity,
                message=message,
                details=json.dumps(details) if details is not None else None,
                status="firing",
            )
            db.add(new_event)
            logger.warning("触发告警: %s", message)

        db.commit()

    def resolve_alert_sync(
        self,
        db: Session,
        rule: AlertRule,
        resource_type: str,
        resource_name: str,
        namespace: Optional[str] = None,
    ) -> None:
        """解决告警（同步）"""
        q = db.query(AlertEvent).filter(
            AlertEvent.rule_id == rule.id,
            AlertEvent.resource_type == resource_type,
            AlertEvent.resource_name == resource_name,
            AlertEvent.status == "firing",
        )
        if namespace is not None:
            q = q.filter(AlertEvent.namespace == namespace)

        existing_event = q.first()

        if existing_event:
            existing_event.status = "resolved"
            existing_event.resolved_at = datetime.now()
            db.commit()
            logger.info("告警已解决: %s/%s", resource_type, resource_name)


alert_checker = AlertChecker()

