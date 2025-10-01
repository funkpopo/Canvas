from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.audit_log import AuditLog


class AuditService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def log(
        self,
        action: str,
        resource: str,
        namespace: str | None = None,
        name: str | None = None,
        success: bool = True,
        username: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Persist an audit log entry. Best-effort; errors are not raised."""
        try:
            async with self._session_factory() as session:
                entry = AuditLog(
                    ts=datetime.now(timezone.utc),
                    action=action,
                    resource=resource,
                    namespace=namespace,
                    name=name,
                    username=username,
                    success=success,
                    details=json.dumps(details) if details is not None else None,
                )
                session.add(entry)
                await session.commit()
        except Exception:
            # Intentionally swallow to avoid impacting primary flow
            pass

    async def list(
        self,
        limit: int = 200,
        action: str | None = None,
        resource: str | None = None,
        namespace: str | None = None,
        name: str | None = None,
    ) -> list[AuditLog]:
        async with self._session_factory() as session:
            stmt: Select[tuple[AuditLog]] = select(AuditLog).order_by(AuditLog.ts.desc()).limit(limit)
            if action:
                stmt = stmt.where(AuditLog.action == action)
            if resource:
                stmt = stmt.where(AuditLog.resource == resource)
            if namespace:
                stmt = stmt.where(AuditLog.namespace == namespace)
            if name:
                stmt = stmt.where(AuditLog.name == name)
            result = await session.execute(stmt)
            rows = result.scalars().all()
            return list(rows)

