from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx

from app.db import get_session_factory
from app.services.notify_config import NotifyConfigService
import time
from asyncio import Lock

_last_sent: dict[str, float] = {}
_sent_lock = Lock()


def _build_email(subject: str, html_body: str, text_body: str | None = None, *, from_addr: str | None = None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = (from_addr or "alerts@localhost")
    msg.attach(MIMEText(text_body or html_body, "plain", _charset="utf-8"))
    msg.attach(MIMEText(html_body, "html", _charset="utf-8"))
    return msg


async def _severity_to_webhook(severity: str | None) -> str | None:
    svc = NotifyConfigService(get_session_factory())
    cfg = await svc.get_effective()
    sev = (severity or "").lower()
    if sev == "critical" and cfg.get("slack_webhook_critical"):
        return cfg.get("slack_webhook_critical")  # type: ignore[return-value]
    if sev in ("warning", "warn") and cfg.get("slack_webhook_warning"):
        return cfg.get("slack_webhook_warning")  # type: ignore[return-value]
    if sev in ("info", "informational") and cfg.get("slack_webhook_info"):
        return cfg.get("slack_webhook_info")  # type: ignore[return-value]
    return cfg.get("slack_webhook")  # type: ignore[return-value]


async def send_slack_notification(payload: dict[str, Any], *, severity: str | None = None) -> None:
    svc = NotifyConfigService(get_session_factory())
    cfg = await svc.get_effective()
    if not cfg.get("enabled"):
        return
    url = await _severity_to_webhook(severity)
    if not url:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(url, json=payload)
        except Exception:
            # Best-effort; do not raise
            pass


async def send_email_notification(subject: str, html_body: str, text_body: str | None = None) -> None:
    svc = NotifyConfigService(get_session_factory())
    cfg = await svc.get_effective()
    if not cfg.get("enabled"):
        return
    if not (cfg.get("smtp_host") and cfg.get("alert_email_from") and cfg.get("alert_email_to")):
        return

    from_addr = cfg.get("alert_email_from") or "alerts@localhost"
    msg = _build_email(subject, html_body, text_body, from_addr=from_addr)
    to_addrs = list(cfg.get("alert_email_to") or [])
    msg["To"] = ", ".join(to_addrs)

    def _send_sync() -> None:
        if cfg.get("smtp_use_tls"):
            server = smtplib.SMTP(cfg.get("smtp_host"), int(cfg.get("smtp_port") or 587))
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(cfg.get("smtp_host"), int(cfg.get("smtp_port") or 465))
        try:
            if cfg.get("smtp_username") and cfg.get("smtp_password"):
                server.login(cfg.get("smtp_username"), cfg.get("smtp_password"))
            server.sendmail(from_addr, to_addrs, msg.as_string())
        finally:
            try:
                server.quit()
            except Exception:
                pass

    try:
        await asyncio.to_thread(_send_sync)
    except Exception:
        # Best-effort; do not raise
        pass


async def send_dingtalk_notification(text: str) -> None:
    svc = NotifyConfigService(get_session_factory())
    cfg = await svc.get_effective()
    if not cfg.get("enabled"):
        return
    url = cfg.get("dingtalk_webhook")
    if not url:
        return
    # DingTalk robot: text message format
    payload = {"msgtype": "text", "text": {"content": text}}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(url, json=payload)
        except Exception:
            pass


async def send_wecom_notification(text: str) -> None:
    svc = NotifyConfigService(get_session_factory())
    cfg = await svc.get_effective()
    if not cfg.get("enabled"):
        return
    url = cfg.get("wecom_webhook")
    if not url:
        return
    # WeCom robot: text message format
    payload = {"msgtype": "text", "text": {"content": text}}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(url, json=payload)
        except Exception:
            pass


def render_alert_markdown(title: str, labels: dict[str, Any], annotations: dict[str, Any]) -> tuple[str, str]:
    # text and html bodies
    kv = "\n".join([f"- {k}: {v}" for k, v in (labels or {}).items()])
    ann = "\n".join([f"- {k}: {v}" for k, v in (annotations or {}).items()])
    text = f"{title}\n\nLabels:\n{kv}\n\nAnnotations:\n{ann}\n"
    html = (
        f"<h3>{title}</h3>"
        f"<p><strong>Labels</strong></p><ul>"
        + "".join([f"<li><code>{k}</code>: {v}</li>" for k, v in (labels or {}).items()])
        + "</ul>"
        + "<p><strong>Annotations</strong></p><ul>"
        + "".join([f"<li><code>{k}</code>: {v}</li>" for k, v in (annotations or {}).items()])
        + "</ul>"
    )
    return text, html


async def should_send_for_severity(severity: str | None) -> bool:
    svc = NotifyConfigService(get_session_factory())
    cfg = await svc.get_effective()
    key = (severity or "_none").lower()
    now = time.time()
    async with _sent_lock:
        last = _last_sent.get(key, 0.0)
        interval = int(cfg.get("min_interval_seconds") or 60)
        if now - last < max(0, interval):
            return False
        _last_sent[key] = now
        return True
