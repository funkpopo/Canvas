from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.crypto import decrypt_if_encrypted, encrypt_if_configured
from app.models.notify_config import AlertNotifyConfig


class NotifyConfigService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._sf = session_factory

    async def get_row(self) -> AlertNotifyConfig | None:
        async with self._sf() as session:
            row = await session.execute(select(AlertNotifyConfig))
            return row.scalars().first()

    async def get_effective(self) -> dict[str, Any]:
        """Return the effective config from DB. If no row present, return disabled defaults.

        Note: No fallback to environment variables by design.
        """
        row = await self.get_row()
        if row:
            email_to = []
            try:
                # support comma-separated or JSON list serialized (future-proof)
                if row.alert_email_to and row.alert_email_to.strip().startswith("["):
                    email_to = json.loads(row.alert_email_to)
                else:
                    email_to = [x.strip() for x in (row.alert_email_to or "").split(",") if x.strip()]
            except Exception:
                email_to = []
            return {
                "enabled": bool(row.enabled),
                "min_interval_seconds": int(row.min_interval_seconds or 60),
                "slack_webhook": decrypt_if_encrypted(row.slack_webhook),
                "slack_webhook_critical": decrypt_if_encrypted(row.slack_webhook_critical),
                "slack_webhook_warning": decrypt_if_encrypted(row.slack_webhook_warning),
                "slack_webhook_info": decrypt_if_encrypted(row.slack_webhook_info),
                "smtp_host": row.smtp_host,
                "smtp_port": int(row.smtp_port or 587),
                "smtp_username": row.smtp_username,
                "smtp_password": decrypt_if_encrypted(row.smtp_password),
                "smtp_use_tls": bool(row.smtp_use_tls),
                "alert_email_from": row.alert_email_from,
                "alert_email_to": email_to,
                "dingtalk_webhook": decrypt_if_encrypted(row.dingtalk_webhook),
                "wecom_webhook": decrypt_if_encrypted(row.wecom_webhook),
                "updated_at": row.updated_at,
            }
        # No DB row -> disabled default (no env fallback)
        return {
            "enabled": False,
            "min_interval_seconds": 60,
            "slack_webhook": None,
            "slack_webhook_critical": None,
            "slack_webhook_warning": None,
            "slack_webhook_info": None,
            "smtp_host": None,
            "smtp_port": 587,
            "smtp_username": None,
            "smtp_password": None,
            "smtp_use_tls": True,
            "alert_email_from": None,
            "alert_email_to": [],
            "dingtalk_webhook": None,
            "wecom_webhook": None,
            "updated_at": None,
        }

    async def upsert(self, **fields: Any) -> AlertNotifyConfig:
        now = datetime.now(timezone.utc)
        async with self._sf() as session:
            row = (await session.execute(select(AlertNotifyConfig))).scalars().first()
            if not row:
                row = AlertNotifyConfig(
                    enabled=bool(fields.get("enabled", False)),
                    min_interval_seconds=int(fields.get("min_interval_seconds", 60)),
                    slack_webhook=encrypt_if_configured(fields.get("slack_webhook")),
                    slack_webhook_critical=encrypt_if_configured(fields.get("slack_webhook_critical")),
                    slack_webhook_warning=encrypt_if_configured(fields.get("slack_webhook_warning")),
                    slack_webhook_info=encrypt_if_configured(fields.get("slack_webhook_info")),
                    smtp_host=fields.get("smtp_host"),
                    smtp_port=int(fields.get("smtp_port") or 587),
                    smtp_username=fields.get("smtp_username"),
                    smtp_password=encrypt_if_configured(fields.get("smtp_password")) if fields.get("smtp_password") is not None else None,
                    smtp_use_tls=bool(fields.get("smtp_use_tls", True)),
                    alert_email_from=fields.get("alert_email_from"),
                    alert_email_to=self._serialize_email_to(fields.get("alert_email_to")),
                    dingtalk_webhook=encrypt_if_configured(fields.get("dingtalk_webhook")),
                    wecom_webhook=encrypt_if_configured(fields.get("wecom_webhook")),
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
            else:
                # update in place; for smtp_password: None => keep, "" => clear, str => set
                for key in (
                    "enabled",
                    "min_interval_seconds",
                    "smtp_host",
                    "smtp_port",
                    "smtp_username",
                    "smtp_use_tls",
                    "alert_email_from",
                ):
                    if key in fields and fields[key] is not None:
                        setattr(row, key, fields[key])
                if "alert_email_to" in fields and fields["alert_email_to"] is not None:
                    row.alert_email_to = self._serialize_email_to(fields["alert_email_to"])
                for key in (
                    "slack_webhook",
                    "slack_webhook_critical",
                    "slack_webhook_warning",
                    "slack_webhook_info",
                    "dingtalk_webhook",
                    "wecom_webhook",
                ):
                    if key in fields:
                        val = fields.get(key)
                        setattr(row, key, encrypt_if_configured(val) if val else None)
                if "smtp_password" in fields:
                    pwd = fields.get("smtp_password")
                    if pwd is None:
                        # keep
                        pass
                    elif pwd == "":
                        row.smtp_password = None
                    else:
                        row.smtp_password = encrypt_if_configured(pwd)
                row.updated_at = now
            await session.commit()
            return (await session.execute(select(AlertNotifyConfig))).scalars().first()  # type: ignore[return-value]

    @staticmethod
    def _serialize_email_to(email_to: list[str] | None) -> str | None:
        if email_to is None:
            return None
        # store comma-separated for simplicity
        return ",".join([x.strip() for x in email_to if x and x.strip()]) or None
