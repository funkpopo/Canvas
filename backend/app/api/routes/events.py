import asyncio
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import EventMessage
from app.services.kube_client import KubernetesService
from app.db import get_session
from app.models.alert_event import AlertEvent

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=list[EventMessage], summary="Latest cluster events")
async def list_events(service: KubernetesService = Depends(get_kubernetes_service), session: AsyncSession = Depends(get_session)) -> list[EventMessage]:
    # K8s events
    events = await service.stream_events()
    # Recent alerts mapped into EventMessage
    alert_rows = (await session.execute(select(AlertEvent).order_by(AlertEvent.received_at.desc()).limit(20))).scalars().all()
    for a in alert_rows:
        import json
        try:
            labels = json.loads(a.labels)
        except Exception:
            labels = {}
        try:
            anns = json.loads(a.annotations)
        except Exception:
            anns = {}
        ns = str(labels.get("namespace") or labels.get("kubernetes_namespace") or "")
        reason = str(labels.get("alertname") or "Alert")
        message = str(anns.get("summary") or anns.get("description") or "")
        events.append(
            EventMessage(
                type="Warning",
                reason=reason,
                message=message,
                involved_object=f"Alert/{reason}",
                namespace=ns or None,
                timestamp=a.received_at,
            )
        )
    # Sort by timestamp desc (best-effort)
    events.sort(key=lambda e: e.timestamp or 0, reverse=True)
    return events


@router.websocket("/stream")
async def events_stream(websocket: WebSocket, service: KubernetesService = Depends(get_kubernetes_service)) -> None:
    await websocket.accept()
    try:
        while True:
            events = await service.stream_events()
            payload = [event.model_dump(mode="json") for event in events]
            await websocket.send_json({"events": payload})
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        return
