from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AlertNotifyConfig(Base):
    __tablename__ = "alert_notify_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # global switch and throttle
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    min_interval_seconds: Mapped[int] = mapped_column(Integer, default=60)

    # Slack
    slack_webhook: Mapped[str | None] = mapped_column(Text, nullable=True)
    slack_webhook_critical: Mapped[str | None] = mapped_column(Text, nullable=True)
    slack_webhook_warning: Mapped[str | None] = mapped_column(Text, nullable=True)
    slack_webhook_info: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Email (SMTP)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    alert_email_from: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alert_email_to: Mapped[str | None] = mapped_column(Text, nullable=True)  # comma-separated

    # DingTalk / WeCom
    dingtalk_webhook: Mapped[str | None] = mapped_column(Text, nullable=True)
    wecom_webhook: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

