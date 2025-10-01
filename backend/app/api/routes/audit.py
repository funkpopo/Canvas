from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_kubernetes_service
from app.services.audit import AuditService
from app.db import get_session_factory
from app.schemas.audit import AuditLogEntry


def get_audit_service() -> AuditService:
    return AuditService(get_session_factory())


router = APIRouter(prefix="/audit", tags=["audit"]) 


@router.get("/logs", response_model=list[AuditLogEntry], summary="List audit logs")
async def list_audit_logs(
    limit: int = Query(default=200, ge=1, le=1000),
    action: str | None = Query(default=None),
    resource: str | None = Query(default=None),
    namespace: str | None = Query(default=None),
    name: str | None = Query(default=None),
    audit: AuditService = Depends(get_audit_service),
) -> list[AuditLogEntry]:
    rows = await audit.list(limit=limit, action=action, resource=resource, namespace=namespace, name=name)
    items: list[AuditLogEntry] = []
    for r in rows:
        details: dict[str, Any] | None = None
        if r.details:
            try:
                import json

                details = json.loads(r.details)
            except Exception:
                details = None
        items.append(
            AuditLogEntry(
                id=r.id,
                ts=r.ts,
                action=r.action,
                resource=r.resource,
                namespace=r.namespace,
                name=r.name,
                username=r.username,
                success=r.success,
                details=details,
            )
        )
    return items

