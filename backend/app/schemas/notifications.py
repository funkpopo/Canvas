from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NotifyConfigOut(BaseModel):
    enabled: bool = False
    min_interval_seconds: int = Field(default=60, ge=0)

    slack_webhook: str | None = None
    slack_webhook_critical: str | None = None
    slack_webhook_warning: str | None = None
    slack_webhook_info: str | None = None

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_use_tls: bool = True
    alert_email_from: str | None = None
    alert_email_to: list[str] = []
    smtp_password_set: bool = False

    dingtalk_webhook: str | None = None
    wecom_webhook: str | None = None

    updated_at: datetime | None = None


class NotifyConfigUpdate(BaseModel):
    enabled: bool
    min_interval_seconds: int = Field(default=60, ge=0)

    slack_webhook: Optional[str] = None
    slack_webhook_critical: Optional[str] = None
    slack_webhook_warning: Optional[str] = None
    slack_webhook_info: Optional[str] = None

    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None  # None: keep, "": clear, other: set
    smtp_use_tls: Optional[bool] = True
    alert_email_from: Optional[str] = None
    alert_email_to: Optional[list[str]] = None

    dingtalk_webhook: Optional[str] = None
    wecom_webhook: Optional[str] = None

