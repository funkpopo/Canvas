from enum import Enum
from typing import Any
from pydantic import BaseModel


class EventType(str, Enum):
    """WebSocket event types"""
    DEPLOYMENT_ADDED = "deployment_added"
    DEPLOYMENT_MODIFIED = "deployment_modified"
    DEPLOYMENT_DELETED = "deployment_deleted"
    STATEFULSET_ADDED = "statefulset_added"
    STATEFULSET_MODIFIED = "statefulset_modified"
    STATEFULSET_DELETED = "statefulset_deleted"
    JOB_ADDED = "job_added"
    JOB_MODIFIED = "job_modified"
    JOB_DELETED = "job_deleted"
    CRONJOB_ADDED = "cronjob_added"
    CRONJOB_MODIFIED = "cronjob_modified"
    CRONJOB_DELETED = "cronjob_deleted"
    POD_ADDED = "pod_added"
    POD_MODIFIED = "pod_modified"
    POD_DELETED = "pod_deleted"
    SERVICE_ADDED = "service_added"
    SERVICE_MODIFIED = "service_modified"
    SERVICE_DELETED = "service_deleted"
    INGRESS_ADDED = "ingress_added"
    INGRESS_MODIFIED = "ingress_modified"
    INGRESS_DELETED = "ingress_deleted"
    NODE_ADDED = "node_added"
    NODE_MODIFIED = "node_modified"
    NODE_DELETED = "node_deleted"


class WebSocketMessage(BaseModel):
    """WebSocket message payload"""
    type: EventType
    resource_type: str  # "Deployment", "Pod", etc.
    namespace: str
    name: str
    data: dict[str, Any] | None = None

    class Config:
        use_enum_values = True
