from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_roles
from app.db import get_session_factory
from app.schemas.notifications import NotifyConfigOut, NotifyConfigUpdate
from app.services.notify_config import NotifyConfigService


router = APIRouter(prefix="/notifications", tags=["alerts"], dependencies=[Depends(require_roles("admin"))])


def get_service() -> NotifyConfigService:
    return NotifyConfigService(get_session_factory())


@router.get("/config", response_model=NotifyConfigOut)
async def get_notify_config(service: NotifyConfigService = Depends(get_service)) -> NotifyConfigOut:
    eff = await service.get_effective()
    # hide smtp_password
    return NotifyConfigOut(
        enabled=bool(eff.get("enabled")),
        min_interval_seconds=int(eff.get("min_interval_seconds") or 60),
        slack_webhook=eff.get("slack_webhook"),
        slack_webhook_critical=eff.get("slack_webhook_critical"),
        slack_webhook_warning=eff.get("slack_webhook_warning"),
        slack_webhook_info=eff.get("slack_webhook_info"),
        smtp_host=eff.get("smtp_host"),
        smtp_port=int(eff.get("smtp_port") or 587),
        smtp_username=eff.get("smtp_username"),
        smtp_use_tls=bool(eff.get("smtp_use_tls")),
        alert_email_from=eff.get("alert_email_from"),
        alert_email_to=list(eff.get("alert_email_to") or []),
        smtp_password_set=bool(eff.get("smtp_password")),
        dingtalk_webhook=eff.get("dingtalk_webhook"),
        wecom_webhook=eff.get("wecom_webhook"),
        updated_at=eff.get("updated_at"),
    )


@router.put("/config", response_model=NotifyConfigOut)
async def put_notify_config(body: NotifyConfigUpdate, service: NotifyConfigService = Depends(get_service)) -> NotifyConfigOut:
    try:
        row = await service.upsert(
            enabled=body.enabled,
            min_interval_seconds=body.min_interval_seconds,
            slack_webhook=body.slack_webhook,
            slack_webhook_critical=body.slack_webhook_critical,
            slack_webhook_warning=body.slack_webhook_warning,
            slack_webhook_info=body.slack_webhook_info,
            smtp_host=body.smtp_host,
            smtp_port=body.smtp_port,
            smtp_username=body.smtp_username,
            smtp_password=body.smtp_password,
            smtp_use_tls=body.smtp_use_tls,
            alert_email_from=body.alert_email_from,
            alert_email_to=body.alert_email_to,
            dingtalk_webhook=body.dingtalk_webhook,
            wecom_webhook=body.wecom_webhook,
        )
        eff = await service.get_effective()
        return NotifyConfigOut(
            enabled=bool(eff.get("enabled")),
            min_interval_seconds=int(eff.get("min_interval_seconds") or 60),
            slack_webhook=eff.get("slack_webhook"),
            slack_webhook_critical=eff.get("slack_webhook_critical"),
            slack_webhook_warning=eff.get("slack_webhook_warning"),
            slack_webhook_info=eff.get("slack_webhook_info"),
            smtp_host=eff.get("smtp_host"),
            smtp_port=int(eff.get("smtp_port") or 587),
            smtp_username=eff.get("smtp_username"),
            smtp_use_tls=bool(eff.get("smtp_use_tls")),
            alert_email_from=eff.get("alert_email_from"),
            alert_email_to=list(eff.get("alert_email_to") or []),
            smtp_password_set=bool(eff.get("smtp_password")),
            dingtalk_webhook=eff.get("dingtalk_webhook"),
            wecom_webhook=eff.get("wecom_webhook"),
            updated_at=eff.get("updated_at"),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

