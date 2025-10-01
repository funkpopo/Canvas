from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import get_settings
from app.services.helm import HelmService
from app.services.audit import AuditService
from app.db import get_session_factory
from app.schemas.kubernetes import OperationResult


class InstallPayload(BaseModel):
    release: str
    chart: str
    namespace: str
    values_yaml: str | None = None


router = APIRouter(prefix="/helm", tags=["helm"])


def _ensure_enabled() -> None:
    if not get_settings().helm_enabled:
        raise HTTPException(status_code=404, detail="Helm integration disabled")


def get_audit_service() -> AuditService:
    return AuditService(get_session_factory())


@router.get("/releases")
async def list_releases(namespace: str | None = Query(default=None)) -> list[dict[str, Any]]:
    _ensure_enabled()
    svc = HelmService()
    return await svc.list_releases(namespace)


@router.get("/charts/search")
async def search_charts(q: str = Query(..., description="Search query"), source: str = Query("hub", description="hub or repo")) -> list[dict[str, Any]]:
    _ensure_enabled()
    svc = HelmService()
    return await svc.search_charts(q, source=source)


@router.post("/install", response_model=OperationResult)
async def install(payload: InstallPayload, audit: AuditService = Depends(get_audit_service)) -> OperationResult:
    _ensure_enabled()
    svc = HelmService()
    ok, msg = await svc.install(
        release=payload.release,
        chart=payload.chart,
        namespace=payload.namespace,
        values_yaml=payload.values_yaml,
    )
    await audit.log(action="helm_install", resource="helm", success=ok, details=payload.model_dump())
    return OperationResult(ok=ok, message=msg)


@router.post("/upgrade", response_model=OperationResult)
async def upgrade(payload: InstallPayload, audit: AuditService = Depends(get_audit_service)) -> OperationResult:
    _ensure_enabled()
    svc = HelmService()
    ok, msg = await svc.upgrade(
        release=payload.release,
        chart=payload.chart,
        namespace=payload.namespace,
        values_yaml=payload.values_yaml,
    )
    await audit.log(action="helm_upgrade", resource="helm", success=ok, details=payload.model_dump())
    return OperationResult(ok=ok, message=msg)


@router.delete("/uninstall/{namespace}/{release}", response_model=OperationResult)
async def uninstall(namespace: str, release: str, audit: AuditService = Depends(get_audit_service)) -> OperationResult:
    _ensure_enabled()
    svc = HelmService()
    ok, msg = await svc.uninstall(release=release, namespace=namespace)
    await audit.log(action="helm_uninstall", resource="helm", success=ok, details={"namespace": namespace, "release": release})
    return OperationResult(ok=ok, message=msg)
