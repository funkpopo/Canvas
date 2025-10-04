from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx

from app.config import get_settings


def _build_email(subject: str, html_body: str, text_body: str | None = None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    settings = get_settings()
    msg["From"] = settings.alert_email_from or "alerts@localhost"
    msg.attach(MIMEText(text_body or html_body, "plain", _charset="utf-8"))
    msg.attach(MIMEText(html_body, "html", _charset="utf-8"))
    return msg


async def send_slack_notification(payload: dict[str, Any]) -> None:
    settings = get_settings()
    if not settings.alert_notify_enabled:
        return
    url = settings.alert_notify_slack_webhook
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

