from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: int
    ts: datetime
    action: str
    resource: str
    namespace: str | None = None
    name: str | None = None
    username: str | None = None
    success: bool
    details: dict[str, Any] | None = None

