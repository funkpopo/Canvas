from enum import Enum
from typing import Any
from pydantic import BaseModel


class EventType(str, Enum):
    """WebSocket事件类型"""
    DEPLOYMENT_ADDED = "deployment_added"
    DEPLOYMENT_MODIFIED = "deployment_modified"
    DEPLOYMENT_DELETED = "deployment_deleted"
    POD_ADDED = "pod_added"
    POD_MODIFIED = "pod_modified"
    POD_DELETED = "pod_deleted"


class WebSocketMessage(BaseModel):
    """WebSocket消息格式"""
    type: EventType
    resource_type: str  # "Deployment", "Pod", etc.
    namespace: str
    name: str
    data: dict[str, Any] | None = None

    class Config:
        use_enum_values = True
