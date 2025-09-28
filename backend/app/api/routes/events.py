import asyncio
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import EventMessage
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=list[EventMessage], summary="Latest cluster events")
async def list_events(service: KubernetesService = Depends(get_kubernetes_service)) -> list[EventMessage]:
    return await service.stream_events()


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
