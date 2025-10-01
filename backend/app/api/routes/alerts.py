from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models.alert_event import AlertEvent
from app.services.audit import AuditService
from app.db import get_session_factory


router = APIRouter(prefix="/alerts", tags=["alerts"])


def get_audit_service() -> AuditService:
    return AuditService(get_session_factory())


@router.post("/webhook", summary="Alertmanager webhook receiver")
async def alertmanager_webhook(
    payload: dict[str, Any],
    request: Request,
    session: AsyncSession = Depends(get_session),
    audit: AuditService = Depends(get_audit_service),
) -> dict[str, str]:
    try:
        alerts = payload.get("alerts") or []
        if not isinstance(alerts, list):
            raise HTTPException(status_code=400, detail="alerts must be a list")
        now = datetime.now(tz=timezone.utc)
        objects: list[AlertEvent] = []
        for a in alerts:
            status = str(a.get("status", "firing"))
            labels = a.get("labels") or {}
            annotations = a.get("annotations") or {}
            starts_at = a.get("startsAt") or None
            ends_at = a.get("endsAt") or None
            generator_url = a.get("generatorURL") or None
            fingerprint = a.get("fingerprint") or None
            obj = AlertEvent(
                received_at=now,
                status=status,
                labels=json.dumps(labels, ensure_ascii=False),
                annotations=json.dumps(annotations, ensure_ascii=False),
                starts_at=str(starts_at) if starts_at else None,
                ends_at=str(ends_at) if ends_at else None,
                generator_url=str(generator_url) if generator_url else None,
                fingerprint=str(fingerprint) if fingerprint else None,
            )
            objects.append(obj)
        if objects:
            session.add_all(objects)
            await session.commit()
        await audit.log(
            action="alert_webhook",
            resource="alert",
            success=True,
            details={"count": len(objects)},
        )
        # Optionally broadcast via WS if needed later
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        await audit.log(action="alert_webhook", resource="alert", success=False, details={"error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", summary="List recent alerts")
async def list_alerts(limit: int = Query(default=50, ge=1, le=500), session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    stmt = select(AlertEvent).order_by(AlertEvent.received_at.desc()).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        try:
            labels = json.loads(r.labels)
        except Exception:
            labels = {}
        try:
            anns = json.loads(r.annotations)
        except Exception:
            anns = {}
        out.append(
            {
                "received_at": r.received_at.isoformat() if r.received_at else None,
                "status": r.status,
                "labels": labels,
                "annotations": anns,
                "starts_at": r.starts_at,
                "ends_at": r.ends_at,
                "generator_url": r.generator_url,
                "fingerprint": r.fingerprint,
            }
        )
    return out

