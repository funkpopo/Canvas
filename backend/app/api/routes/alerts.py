from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models.alert_event import AlertEvent
from app.models.alert_status import AlertStatus
from app.services.audit import AuditService
from app.db import get_session_factory
from app.core.auth import get_current_user, CurrentUser


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
    stmt: Select[tuple[AlertEvent]] = select(AlertEvent).order_by(AlertEvent.received_at.desc()).limit(limit)
    rows: list[AlertEvent] = (await session.execute(stmt)).scalars().all()
    out: list[dict[str, Any]] = []
    # fetch statuses for fingerprints
    fps = [r.fingerprint for r in rows if r.fingerprint]
    status_map: dict[str, AlertStatus] = {}
    if fps:
        st_rows = (await session.execute(select(AlertStatus).where(AlertStatus.fingerprint.in_(fps)))).scalars().all()
        status_map = {s.fingerprint: s for s in st_rows if s.fingerprint}
    for r in rows:
        try:
            labels = json.loads(r.labels)
        except Exception:
            labels = {}
        try:
            anns = json.loads(r.annotations)
        except Exception:
            anns = {}
        st = status_map.get(r.fingerprint or "")
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
                "acked": bool(st.acked_at) if st else None,
                "silenced_until": st.silenced_until.isoformat() if st and st.silenced_until else None,
            }
        )
    return out


@router.post("/{fingerprint}/ack")
async def ack_alert(fingerprint: str, session: AsyncSession = Depends(get_session), audit: AuditService = Depends(get_audit_service), current: CurrentUser = Depends(get_current_user)) -> dict[str, str]:
    try:
        now = datetime.now(timezone.utc)
        st = (await session.execute(select(AlertStatus).where(AlertStatus.fingerprint == fingerprint))).scalars().first()
        if not st:
            st = AlertStatus(fingerprint=fingerprint, acked_at=now, silenced_until=None)
            session.add(st)
        else:
            setattr(st, "acked_at", now)
        await session.commit()
        await audit.log(action="alert_ack", resource="alert", success=True, username=current.username, details={"fingerprint": fingerprint})
        return {"status": "ok"}
    except Exception as e:
        await audit.log(action="alert_ack", resource="alert", success=False, username=current.username, details={"error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{fingerprint}/silence")
async def silence_alert_ep(fingerprint: str, payload: dict[str, Any], session: AsyncSession = Depends(get_session), audit: AuditService = Depends(get_audit_service), current: CurrentUser = Depends(get_current_user)) -> dict[str, str]:
    try:
        minutes = int(payload.get("minutes") or 60)
        now = datetime.now(timezone.utc)
        st = (await session.execute(select(AlertStatus).where(AlertStatus.fingerprint == fingerprint))).scalars().first()
        until = now + timedelta(minutes=minutes)
        if not st:
            st = AlertStatus(fingerprint=fingerprint, acked_at=None, silenced_until=until)
            session.add(st)
        else:
            st.silenced_until = until
        await session.commit()
        await audit.log(action="alert_silence", resource="alert", success=True, username=current.username, details={"fingerprint": fingerprint, "minutes": minutes})
        return {"status": "ok"}
    except Exception as e:
        await audit.log(action="alert_silence", resource="alert", success=False, username=current.username, details={"error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trends")
async def alert_trends(window: str = Query(default="1h"), session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    # Return counts over time buckets for firing vs resolved
    # window supports: 1h, 6h, 24h
    try:
        now = datetime.now(timezone.utc)
        hours = 1
        if window.endswith("h"):
            hours = max(1, int(window[:-1]))
        start = now - timedelta(hours=hours)
        # naive bucketing by minute
        rows = (await session.execute(select(AlertEvent.status, func.strftime('%Y-%m-%dT%H:%M:00Z', AlertEvent.received_at)).where(AlertEvent.received_at >= start).group_by(2, 1).with_only_columns(func.count().label("count"), AlertEvent.status, func.strftime('%Y-%m-%dT%H:%M:00Z', AlertEvent.received_at).label("bucket")))).all()
        buckets: dict[str, dict[str, int]] = {}
        for count, status, bucket in rows:
            b = str(bucket)
            m = buckets.setdefault(b, {"firing": 0, "resolved": 0})
            if str(status) == "firing":
                m["firing"] += int(count)
            else:
                m["resolved"] += int(count)
        out = [
            {"ts": ts, "firing": m["firing"], "resolved": m["resolved"]}
            for ts, m in sorted(buckets.items(), key=lambda x: x[0])
        ]
        return out
    except Exception:
        return []
