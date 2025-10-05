from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.alert_rule import AlertRuleTemplate


class AlertRuleService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._sf = session_factory

    async def list(self) -> list[AlertRuleTemplate]:
        async with self._sf() as session:
            rows = (await session.execute(select(AlertRuleTemplate))).scalars().all()
            return list(rows)

    async def get(self, rule_id: int) -> AlertRuleTemplate | None:
        async with self._sf() as session:
            row = await session.execute(select(AlertRuleTemplate).where(AlertRuleTemplate.id == rule_id))
            return row.scalars().first()

    async def create(
        self,
        *,
        name: str,
        severity: str,
        expr: str,
        summary: str | None = None,
        description: str | None = None,
        labels: dict[str, str] | None = None,
        annotations: dict[str, str] | None = None,
        enabled: bool = True,
    ) -> AlertRuleTemplate:
        now = datetime.now(timezone.utc)
        async with self._sf() as session:
            rule = AlertRuleTemplate(
                name=name,
                severity=severity,
                expr=expr,
                summary=summary,
                description=description,
                labels=json.dumps(labels or {}, ensure_ascii=False),
                annotations=json.dumps(annotations or {}, ensure_ascii=False),
                enabled=enabled,
                created_at=now,
                updated_at=now,
            )
            session.add(rule)
            await session.commit()
            return (await session.execute(select(AlertRuleTemplate).where(AlertRuleTemplate.id == rule.id))).scalars().first()  # type: ignore[return-value]

    async def update(self, rule_id: int, **fields) -> AlertRuleTemplate | None:
        async with self._sf() as session:
            row = await session.execute(select(AlertRuleTemplate).where(AlertRuleTemplate.id == rule_id))
            rule = row.scalars().first()
            if not rule:
                return None
            for k, v in fields.items():
                if k in ("labels", "annotations") and isinstance(v, dict):
                    setattr(rule, k, json.dumps(v, ensure_ascii=False))
                elif v is not None:
                    setattr(rule, k, v)
            rule.updated_at = datetime.now(timezone.utc)
            await session.commit()
            return (await session.execute(select(AlertRuleTemplate).where(AlertRuleTemplate.id == rule_id))).scalars().first()

    async def delete(self, rule_id: int) -> bool:
        async with self._sf() as session:
            row = await session.execute(select(AlertRuleTemplate).where(AlertRuleTemplate.id == rule_id))
            rule = row.scalars().first()
            if not rule:
                return False
            await session.delete(rule)
            await session.commit()
            return True

