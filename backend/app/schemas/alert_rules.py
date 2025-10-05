from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class AlertRuleTemplateIn(BaseModel):
    name: str
    severity: str
    expr: str
    summary: str | None = None
    description: str | None = None
    labels: dict[str, str] | None = None
    annotations: dict[str, str] | None = None
    enabled: bool = True


class AlertRuleTemplateOut(BaseModel):
    id: int
    name: str
    severity: str
    expr: str
    summary: str | None = None
    description: str | None = None
    labels: dict[str, str] | None = None
    annotations: dict[str, str] | None = None
    enabled: bool
    created_at: datetime
    updated_at: datetime

