from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx

from app.config import get_settings
import time
from asyncio import Lock

_last_sent: dict[str, float] = {}
_sent_lock = Lock()


def _build_email(subject: str, html_body: str, text_body: str | None = None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    settings = get_settings()
    msg["From"] = settings.alert_email_from or "alerts@localhost"
    msg.attach(MIMEText(text_body or html_body, "plain", _charset="utf-8"))
    msg.attach(MIMEText(html_body, "html", _charset="utf-8"))
    return msg


def _severity_to_webhook(severity: str | None) -> str | None:
    settings = get_settings()
    sev = (severity or "").lower()
    if sev == "critical" and settings.alert_notify_slack_webhook_critical:
        return settings.alert_notify_slack_webhook_critical
    if sev in ("warning", "warn") and settings.alert_notify_slack_webhook_warning:
        return settings.alert_notify_slack_webhook_warning
    if sev in ("info", "informational") and settings.alert_notify_slack_webhook_info:
        return settings.alert_notify_slack_webhook_info
    return settings.alert_notify_slack_webhook


async def send_slack_notification(payload: dict[str, Any], *, severity: str | None = None) -> None:
    settings = get_settings()
    if not settings.alert_notify_enabled:
        return
    url = _severity_to_webhook(severity)
    if not url:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(url, json=payload)
        except Exception:
            # Best-effort; do not raise
            pass


async def send_email_notification(subject: str, html_body: str, text_body: str | None = None) -> None:
    settings = get_settings()
    if not settings.alert_notify_enabled:
        return
    if not (settings.smtp_host and settings.alert_email_from and settings.alert_email_to):
        return

    msg = _build_email(subject, html_body, text_body)
    to_addrs = settings.alert_email_to
    msg["To"] = ", ".join(to_addrs)

    def _send_sync() -> None:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)
        try:
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.alert_email_from, to_addrs, msg.as_string())
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
    settings = get_settings()
    key = (severity or "_none").lower()
    now = time.time()
    async with _sent_lock:
        last = _last_sent.get(key, 0.0)
        if now - last < max(0, settings.alert_notify_min_interval_seconds):
            return False
        _last_sent[key] = now
        return True
