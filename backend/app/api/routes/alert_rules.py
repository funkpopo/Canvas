from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user, require_roles
from app.db import get_session_factory
from app.schemas.alert_rules import AlertRuleTemplateIn, AlertRuleTemplateOut
from app.services.alert_rules import AlertRuleService


router = APIRouter(prefix="/alert-rules", tags=["alerts"], dependencies=[Depends(get_current_user)])


def get_service() -> AlertRuleService:
    return AlertRuleService(get_session_factory())


@router.get("/", response_model=list[AlertRuleTemplateOut])
async def list_rules(service: AlertRuleService = Depends(get_service)) -> list[AlertRuleTemplateOut]:
    rows = await service.list()
    out: list[AlertRuleTemplateOut] = []
    for r in rows:
        labels: dict[str, Any] | None = None
        annotations: dict[str, Any] | None = None
        try:
            labels = json.loads(r.labels) if r.labels else None
        except Exception:
            labels = None
        try:
            annotations = json.loads(r.annotations) if r.annotations else None
        except Exception:
            annotations = None
        out.append(
            AlertRuleTemplateOut(
                id=r.id,
                name=r.name,
                severity=r.severity,
                expr=r.expr,
                summary=r.summary,
                description=r.description,
                labels=labels,
                annotations=annotations,
                enabled=r.enabled,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
    return out


@router.post("/", response_model=AlertRuleTemplateOut, dependencies=[Depends(require_roles("operator", "admin"))])
async def create_rule(body: AlertRuleTemplateIn, service: AlertRuleService = Depends(get_service)) -> AlertRuleTemplateOut:
    r = await service.create(
        name=body.name,
        severity=body.severity,
        expr=body.expr,
        summary=body.summary,
        description=body.description,
        labels=body.labels,
        annotations=body.annotations,
        enabled=body.enabled,
    )
    return await _to_out(r)


@router.put("/{rule_id}", response_model=AlertRuleTemplateOut, dependencies=[Depends(require_roles("operator", "admin"))])
async def update_rule(rule_id: int, body: AlertRuleTemplateIn, service: AlertRuleService = Depends(get_service)) -> AlertRuleTemplateOut:
    r = await service.update(
        rule_id,
        name=body.name,
        severity=body.severity,
        expr=body.expr,
        summary=body.summary,
        description=body.description,
        labels=body.labels,
        annotations=body.annotations,
        enabled=body.enabled,
    )
    if not r:
        raise HTTPException(status_code=404, detail="Rule not found")
    return await _to_out(r)


@router.delete("/{rule_id}", dependencies=[Depends(require_roles("operator", "admin"))])
async def delete_rule(rule_id: int, service: AlertRuleService = Depends(get_service)) -> dict[str, str]:
    ok = await service.delete(rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "ok"}


async def _to_out(r) -> AlertRuleTemplateOut:
    labels = None
    annotations = None
    try:
        labels = json.loads(r.labels) if r.labels else None
    except Exception:
        labels = None
    try:
        annotations = json.loads(r.annotations) if r.annotations else None
    except Exception:
        annotations = None
    return AlertRuleTemplateOut(
        id=r.id,
        name=r.name,
        severity=r.severity,
        expr=r.expr,
        summary=r.summary,
        description=r.description,
        labels=labels,
        annotations=annotations,
        enabled=r.enabled,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )

