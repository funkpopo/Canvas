from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..database import get_db
from ..models import AlertRule, AlertEvent, Cluster, User
from ..auth import get_current_user
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
from ..core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


class ThresholdConfig(BaseModel):
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    restart_count: Optional[int] = None
    time_window_seconds: Optional[int] = None


class AlertRuleCreate(BaseModel):
    name: str
    cluster_id: int
    rule_type: str
    severity: str = "warning"
    enabled: bool = True
    threshold_config: ThresholdConfig
    notification_channels: Optional[List[str]] = None


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    severity: Optional[str] = None
    enabled: Optional[bool] = None
    threshold_config: Optional[ThresholdConfig] = None
    notification_channels: Optional[List[str]] = None


class AlertRuleResponse(BaseModel):
    id: int
    name: str
    cluster_id: int
    cluster_name: str
    rule_type: str
    severity: str
    enabled: bool
    threshold_config: Dict[str, Any]
    notification_channels: Optional[List[str]]
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class AlertEventResponse(BaseModel):
    id: int
    rule_id: int
    rule_name: str
    cluster_id: int
    cluster_name: str
    resource_type: str
    resource_name: str
    namespace: Optional[str]
    severity: str
    message: str
    details: Optional[Dict[str, Any]]
    status: str
    first_triggered_at: datetime
    last_triggered_at: datetime
    resolved_at: Optional[datetime]
    notification_sent: bool

    class Config:
        from_attributes = True


@router.post("/rules", response_model=AlertRuleResponse)
async def create_alert_rule(
    rule: AlertRuleCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建告警规则"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        db_rule = AlertRule(
            name=rule.name,
            cluster_id=rule.cluster_id,
            rule_type=rule.rule_type,
            severity=rule.severity,
            enabled=rule.enabled,
            threshold_config=json.dumps(rule.threshold_config.model_dump(exclude_none=True)),
            notification_channels=json.dumps(rule.notification_channels) if rule.notification_channels else None,
            created_by=current_user["id"]
        )
        db.add(db_rule)
        db.commit()
        db.refresh(db_rule)

        return AlertRuleResponse(
            id=db_rule.id,
            name=db_rule.name,
            cluster_id=db_rule.cluster_id,
            cluster_name=cluster.name,
            rule_type=db_rule.rule_type,
            severity=db_rule.severity,
            enabled=db_rule.enabled,
            threshold_config=json.loads(db_rule.threshold_config),
            notification_channels=json.loads(db_rule.notification_channels) if db_rule.notification_channels else None,
            created_by=db_rule.created_by,
            created_at=db_rule.created_at,
            updated_at=db_rule.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("创建告警规则失败: %s", e)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建告警规则失败: {str(e)}")


@router.get("/rules", response_model=List[AlertRuleResponse])
async def list_alert_rules(
    cluster_id: Optional[int] = Query(None),
    enabled: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取告警规则列表"""
    try:
        query = db.query(AlertRule)

        if cluster_id is not None:
            query = query.filter(AlertRule.cluster_id == cluster_id)
        if enabled is not None:
            query = query.filter(AlertRule.enabled == enabled)

        rules = query.all()

        result = []
        for rule in rules:
            cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()
            result.append(AlertRuleResponse(
                id=rule.id,
                name=rule.name,
                cluster_id=rule.cluster_id,
                cluster_name=cluster.name if cluster else "Unknown",
                rule_type=rule.rule_type,
                severity=rule.severity,
                enabled=rule.enabled,
                threshold_config=json.loads(rule.threshold_config),
                notification_channels=json.loads(rule.notification_channels) if rule.notification_channels else None,
                created_by=rule.created_by,
                created_at=rule.created_at,
                updated_at=rule.updated_at
            ))

        return result

    except Exception as e:
        logger.exception("获取告警规则列表失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取告警规则列表失败: {str(e)}")


@router.get("/rules/{rule_id}", response_model=AlertRuleResponse)
async def get_alert_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取告警规则详情"""
    try:
        rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="告警规则不存在")

        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()

        return AlertRuleResponse(
            id=rule.id,
            name=rule.name,
            cluster_id=rule.cluster_id,
            cluster_name=cluster.name if cluster else "Unknown",
            rule_type=rule.rule_type,
            severity=rule.severity,
            enabled=rule.enabled,
            threshold_config=json.loads(rule.threshold_config),
            notification_channels=json.loads(rule.notification_channels) if rule.notification_channels else None,
            created_by=rule.created_by,
            created_at=rule.created_at,
            updated_at=rule.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("获取告警规则详情失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取告警规则详情失败: {str(e)}")


@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: int,
    rule_update: AlertRuleUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新告警规则"""
    try:
        rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="告警规则不存在")

        if rule_update.name is not None:
            rule.name = rule_update.name
        if rule_update.severity is not None:
            rule.severity = rule_update.severity
        if rule_update.enabled is not None:
            rule.enabled = rule_update.enabled
        if rule_update.threshold_config is not None:
            rule.threshold_config = json.dumps(rule_update.threshold_config.model_dump(exclude_none=True))
        if rule_update.notification_channels is not None:
            rule.notification_channels = json.dumps(rule_update.notification_channels)

        db.commit()
        db.refresh(rule)

        cluster = db.query(Cluster).filter(Cluster.id == rule.cluster_id).first()

        return AlertRuleResponse(
            id=rule.id,
            name=rule.name,
            cluster_id=rule.cluster_id,
            cluster_name=cluster.name if cluster else "Unknown",
            rule_type=rule.rule_type,
            severity=rule.severity,
            enabled=rule.enabled,
            threshold_config=json.loads(rule.threshold_config),
            notification_channels=json.loads(rule.notification_channels) if rule.notification_channels else None,
            created_by=rule.created_by,
            created_at=rule.created_at,
            updated_at=rule.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("更新告警规则失败: %s", e)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新告警规则失败: {str(e)}")


@router.delete("/rules/{rule_id}")
async def delete_alert_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除告警规则"""
    try:
        rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="告警规则不存在")

        db.delete(rule)
        db.commit()

        return {"message": "告警规则已删除"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("删除告警规则失败: %s", e)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除告警规则失败: {str(e)}")


@router.get("/events", response_model=List[AlertEventResponse])
async def list_alert_events(
    cluster_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取告警事件列表"""
    try:
        query = db.query(AlertEvent)

        if cluster_id is not None:
            query = query.filter(AlertEvent.cluster_id == cluster_id)
        if status is not None:
            query = query.filter(AlertEvent.status == status)
        if severity is not None:
            query = query.filter(AlertEvent.severity == severity)

        events = query.order_by(AlertEvent.last_triggered_at.desc()).limit(limit).all()

        result = []
        for event in events:
            rule = db.query(AlertRule).filter(AlertRule.id == event.rule_id).first()
            cluster = db.query(Cluster).filter(Cluster.id == event.cluster_id).first()

            result.append(AlertEventResponse(
                id=event.id,
                rule_id=event.rule_id,
                rule_name=rule.name if rule else "Unknown",
                cluster_id=event.cluster_id,
                cluster_name=cluster.name if cluster else "Unknown",
                resource_type=event.resource_type,
                resource_name=event.resource_name,
                namespace=event.namespace,
                severity=event.severity,
                message=event.message,
                details=json.loads(event.details) if event.details else None,
                status=event.status,
                first_triggered_at=event.first_triggered_at,
                last_triggered_at=event.last_triggered_at,
                resolved_at=event.resolved_at,
                notification_sent=event.notification_sent
            ))

        return result

    except Exception as e:
        logger.exception("获取告警事件列表失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取告警事件列表失败: {str(e)}")


@router.post("/events/{event_id}/resolve")
async def resolve_alert_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """标记告警事件为已解决"""
    try:
        event = db.query(AlertEvent).filter(AlertEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="告警事件不存在")

        event.status = "resolved"
        event.resolved_at = datetime.now()
        db.commit()

        return {"message": "告警事件已标记为已解决"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("解决告警事件失败: %s", e)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"解决告警事件失败: {str(e)}")


@router.get("/stats")
async def get_alert_stats(
    cluster_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取告警统计信息"""
    try:
        query = db.query(AlertEvent)
        if cluster_id is not None:
            query = query.filter(AlertEvent.cluster_id == cluster_id)

        total = query.count()
        firing = query.filter(AlertEvent.status == "firing").count()
        resolved = query.filter(AlertEvent.status == "resolved").count()

        critical = query.filter(and_(AlertEvent.severity == "critical", AlertEvent.status == "firing")).count()
        warning = query.filter(and_(AlertEvent.severity == "warning", AlertEvent.status == "firing")).count()
        info = query.filter(and_(AlertEvent.severity == "info", AlertEvent.status == "firing")).count()

        return {
            "total": total,
            "firing": firing,
            "resolved": resolved,
            "by_severity": {
                "critical": critical,
                "warning": warning,
                "info": info
            }
        }

    except Exception as e:
        logger.exception("获取告警统计信息失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取告警统计信息失败: {str(e)}")
