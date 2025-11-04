import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import AlertRule, AlertEvent, Cluster
from ..k8s_client import get_node_metrics, get_pod_metrics, get_k8s_client
from ..core.logging import get_logger
import json
from typing import Dict, Any, List

logger = get_logger(__name__)


class AlertChecker:
    """告警检查器"""

    def __init__(self):
        self.running = False
        self.check_interval = 60

    async def start(self):
        """启动告警检查"""
        self.running = True
        logger.info("告警检查器已启动")
        while self.running:
            try:
                await self.check_all_rules()
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                logger.exception("告警检查失败: %s", e)
                await asyncio.sleep(self.check_interval)

    async def stop(self):
        """停止告警检查"""
        self.running = False
        logger.info("告警检查器已停止")

    async def check_all_rules(self):
        """检查所有启用的告警规则"""
        db = SessionLocal()
        try:
            rules = db.query(AlertRule).filter(AlertRule.enabled == True).all()

            for rule in rules:
                try:
                    await self.check_rule(db, rule)
                except Exception as e:
                    logger.exception("检查规则 %s 失败: %s", rule.name, e)

        finally:
            db.close()

    async def check_rule(self, db: Session, rule: AlertRule):
        """检查单个告警规则"""
        if rule.rule_type == "resource_usage":
            await self.check_resource_usage(db, rule)
        elif rule.rule_type == "pod_restart":
            await self.check_pod_restart(db, rule)
        elif rule.rule_type == "node_unavailable":
            await self.check_node_unavailable(db, rule)

    async def check_resource_usage(self, db: Session, rule: AlertRule):
        """检查资源使用超限"""
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            return

        config = json.loads(rule.threshold_config)
        cpu_threshold = config.get("cpu_percent")
        memory_threshold = config.get("memory_percent")

        node_metrics = get_node_metrics(cluster)
        if not node_metrics:
            return

        for node_metric in node_metrics:
            cpu_percent = node_metric.get("cpu_percentage", 0)
            memory_percent = node_metric.get("memory_percentage", 0)

            if cpu_threshold and cpu_percent > cpu_threshold:
                await self.trigger_alert(
                    db, rule,
                    resource_type="node",
                    resource_name=node_metric["name"],
                    message=f"节点 {node_metric['name']} CPU使用率 {cpu_percent:.1f}% 超过阈值 {cpu_threshold}%",
                    details={"cpu_usage": cpu_percent, "threshold": cpu_threshold}
                )
            elif memory_threshold and memory_percent > memory_threshold:
                await self.trigger_alert(
                    db, rule,
                    resource_type="node",
                    resource_name=node_metric["name"],
                    message=f"节点 {node_metric['name']} 内存使用率 {memory_percent:.1f}% 超过阈值 {memory_threshold}%",
                    details={"memory_usage": memory_percent, "threshold": memory_threshold}
                )
            else:
                await self.resolve_alert(
                    db, rule,
                    resource_type="node",
                    resource_name=node_metric["name"]
                )

    async def check_pod_restart(self, db: Session, rule: AlertRule):
        """检查Pod异常重启"""
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            return

        config = json.loads(rule.threshold_config)
        restart_threshold = config.get("restart_count", 5)

        try:
            client = get_k8s_client(cluster)
            pods = client.list_pod_for_all_namespaces()

            for pod in pods.items:
                restart_count = 0
                for container_status in (pod.status.container_statuses or []):
                    restart_count += container_status.restart_count

                if restart_count >= restart_threshold:
                    await self.trigger_alert(
                        db, rule,
                        resource_type="pod",
                        resource_name=pod.metadata.name,
                        namespace=pod.metadata.namespace,
                        message=f"Pod {pod.metadata.namespace}/{pod.metadata.name} 重启次数 {restart_count} 超过阈值 {restart_threshold}",
                        details={"restart_count": restart_count, "threshold": restart_threshold}
                    )
                else:
                    await self.resolve_alert(
                        db, rule,
                        resource_type="pod",
                        resource_name=pod.metadata.name,
                        namespace=pod.metadata.namespace
                    )

        except Exception as e:
            logger.exception("检查Pod重启失败: %s", e)

    async def check_node_unavailable(self, db: Session, rule: AlertRule):
        """检查节点不可用"""
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            return

        try:
            client = get_k8s_client(cluster)
            nodes = client.list_node()

            for node in nodes.items:
                is_ready = False
                for condition in node.status.conditions:
                    if condition.type == "Ready":
                        is_ready = condition.status == "True"
                        break

                if not is_ready:
                    await self.trigger_alert(
                        db, rule,
                        resource_type="node",
                        resource_name=node.metadata.name,
                        message=f"节点 {node.metadata.name} 不可用",
                        details={"ready": is_ready}
                    )
                else:
                    await self.resolve_alert(
                        db, rule,
                        resource_type="node",
                        resource_name=node.metadata.name
                    )

        except Exception as e:
            logger.exception("检查节点可用性失败: %s", e)

    async def trigger_alert(
        self,
        db: Session,
        rule: AlertRule,
        resource_type: str,
        resource_name: str,
        message: str,
        namespace: str = None,
        details: Dict[str, Any] = None
    ):
        """触发告警"""
        existing_event = db.query(AlertEvent).filter(
            AlertEvent.rule_id == rule.id,
            AlertEvent.resource_type == resource_type,
            AlertEvent.resource_name == resource_name,
            AlertEvent.status == "firing"
        ).first()

        if existing_event:
            existing_event.last_triggered_at = datetime.now()
            if details:
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
                details=json.dumps(details) if details else None,
                status="firing"
            )
            db.add(new_event)
            logger.warning("触发告警: %s", message)

        db.commit()

    async def resolve_alert(
        self,
        db: Session,
        rule: AlertRule,
        resource_type: str,
        resource_name: str,
        namespace: str = None
    ):
        """解决告警"""
        existing_event = db.query(AlertEvent).filter(
            AlertEvent.rule_id == rule.id,
            AlertEvent.resource_type == resource_type,
            AlertEvent.resource_name == resource_name,
            AlertEvent.status == "firing"
        ).first()

        if existing_event:
            existing_event.status = "resolved"
            existing_event.resolved_at = datetime.now()
            db.commit()
            logger.info("告警已解决: %s/%s", resource_type, resource_name)


alert_checker = AlertChecker()
