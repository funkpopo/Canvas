from __future__ import annotations

import asyncio
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_roles
from app.db import get_session_factory
from app.schemas.notifications import NotifyConfigOut, NotifyConfigUpdate
from app.services.notify_config import NotifyConfigService
from app.services.alert_notify import send_email_notification, send_slack_notification, send_dingtalk_notification, send_wecom_notification


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


@router.post("/test")
async def test_notifications(service: NotifyConfigService = Depends(get_service)) -> dict[str, str]:
    """Send test notifications to all configured channels."""
    try:
        cfg = await service.get_effective()
        if not cfg.get("enabled"):
            raise HTTPException(status_code=400, detail="Notifications are disabled")
        
        title = "[TEST] Canvas Alert Notification Test"
        text_body = "This is a test notification from Canvas Kubernetes Dashboard. If you see this, your notification channel is configured correctly."
        html_body = f"<h3>{title}</h3><p>{text_body}</p>"
        
        tasks = []
        sent_channels = []
        
        # Test Slack
        if cfg.get("slack_webhook"):
            tasks.append(send_slack_notification({"text": text_body}, severity="info"))
            sent_channels.append("slack")
        
        # Test Email
        if cfg.get("smtp_host") and cfg.get("alert_email_to"):
            tasks.append(send_email_notification(title, html_body, text_body))
            sent_channels.append("email")
        
        # Test DingTalk
        if cfg.get("dingtalk_webhook"):
            tasks.append(send_dingtalk_notification(text_body))
            sent_channels.append("dingtalk")
        
        # Test WeCom
        if cfg.get("wecom_webhook"):
            tasks.append(send_wecom_notification(text_body))
            sent_channels.append("wecom")
        
        if not tasks:
            raise HTTPException(status_code=400, detail="No notification channels configured")
        
        # Send all notifications
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Check for errors
        errors = [str(r) for r in results if isinstance(r, Exception)]
        if errors:
            return {
                "status": "partial",
                "message": f"Sent to {len(sent_channels)} channels with some errors",
                "channels": ", ".join(sent_channels),
                "errors": "; ".join(errors)
            }
        
        return {
            "status": "ok",
            "message": f"Test notifications sent successfully to {len(sent_channels)} channels",
            "channels": ", ".join(sent_channels)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

