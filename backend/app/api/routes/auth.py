from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.security import decode_jwt_token
from app.db import get_session
from app.schemas.auth import ApiKeyCreated, ApiKeyCreateRequest, CreateUserRequest, LoginRequest, RefreshRequest, TokenPair, UserInfo, RegisterRequest, RoleInfo, UpdateUserRequest, ApiKeyInfo, SessionInfo
from app.services.auth import AuthService
from app.db import get_session_factory
from app.models.user import Role, User, ApiKey
from app.config import get_settings
from app.services.audit import AuditService


router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service() -> AuthService:
    return AuthService(get_session_factory())


def get_audit_service() -> AuditService:
    return AuditService(get_session_factory())


@router.post("/login", response_model=TokenPair)
async def login(body: LoginRequest, service: AuthService = Depends(get_auth_service), audit: AuditService = Depends(get_audit_service)) -> TokenPair:
    user = await service.get_user_by_username(body.username)
    if not user or not await service.verify_user_password(user, body.password):
        await audit.log(action="login", resource="auth", success=False, username=body.username, details={"reason": "invalid_credentials"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access, refresh, ttl = await service.issue_tokens(user)
    try:
        await service.set_last_login(user.id)
    except Exception:
        pass
    try:
        await audit.log(action="login", resource="auth", success=True, username=user.username)
    except Exception:
        pass
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=ttl)


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(body: RefreshRequest, service: AuthService = Depends(get_auth_service)) -> TokenPair:
    try:
        payload = decode_jwt_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        username = str(payload.get("sub"))
        jti = str(payload.get("jti"))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await service.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    access, refresh, ttl = await service.rotate_refresh(jti, user)
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=ttl)


@router.post("/logout")
async def logout(body: RefreshRequest, service: AuthService = Depends(get_auth_service), audit: AuditService = Depends(get_audit_service)) -> dict[str, str]:
    try:
        payload = decode_jwt_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        username = str(payload.get("sub"))
        jti = str(payload.get("jti"))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await service.get_user_by_username(username)
    if user:
        await service.revoke_refresh(jti, user)
        try:
            await audit.log(action="logout", resource="auth", success=True, username=user.username)
        except Exception:
            pass
    return {"status": "ok"}


@router.get("/me", response_model=UserInfo)
async def whoami(current: CurrentUser = Depends(get_current_user)) -> UserInfo:
    u = current.user
    return UserInfo(
        id=u.id,
        username=u.username,
        display_name=u.display_name,
        email=u.email,
        roles=[r.name for r in u.roles],
        tenant_id=u.tenant_id,
        is_active=u.is_active,
        created_at=u.created_at,
        updated_at=u.updated_at,
        last_login_at=u.last_login_at,
    )


@router.post("/register", response_model=UserInfo)
async def register(body: RegisterRequest, service: AuthService = Depends(get_auth_service), audit: AuditService = Depends(get_audit_service)) -> UserInfo:
    settings = get_settings()
    if not settings.allow_self_registration:
        raise HTTPException(status_code=403, detail="Self-registration disabled")
    # default role viewer, default tenant
    tenant_slug = body.tenant_slug or "default"
    user = await service.create_user(
        username=body.username,
        password=body.password,
        display_name=body.display_name,
        email=body.email,
        tenant_slug=tenant_slug,
        roles=["viewer"],
    )
    try:
        await audit.log(action="register", resource="auth", success=True, username=user.username)
    except Exception:
        pass
    return UserInfo(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        roles=[r.name for r in user.roles],
        tenant_id=user.tenant_id,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


@router.post("/users", response_model=UserInfo, dependencies=[Depends(require_roles("admin"))])
async def create_user(body: CreateUserRequest, service: AuthService = Depends(get_auth_service), audit: AuditService = Depends(get_audit_service)) -> UserInfo:
    user = await service.create_user(
        username=body.username,
        password=body.password,
        display_name=body.display_name,
        email=body.email,
        tenant_slug=body.tenant_slug,
        roles=body.roles,
    )
    try:
        await audit.log(action="user_create", resource="user", success=True, username=user.username, details={"roles": body.roles})
    except Exception:
        pass
    return UserInfo(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        roles=[r.name for r in user.roles],
        tenant_id=user.tenant_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


@router.get("/users", response_model=list[UserInfo], dependencies=[Depends(require_roles("admin"))])
async def list_users(session: AsyncSession = Depends(get_session)) -> list[UserInfo]:
    rows = (await session.execute(select(User))).scalars().all()
    return [
        UserInfo(
            id=u.id,
            username=u.username,
            display_name=u.display_name,
            email=u.email,
            roles=[r.name for r in u.roles],
            tenant_id=u.tenant_id,
            is_active=u.is_active,
            created_at=u.created_at,
            updated_at=u.updated_at,
            last_login_at=u.last_login_at,
        )
        for u in rows
    ]


@router.post("/apikeys", response_model=ApiKeyCreated)
async def create_api_key(body: ApiKeyCreateRequest, current: CurrentUser = Depends(get_current_user), service: AuthService = Depends(get_auth_service)) -> ApiKeyCreated:
    ak, full = await service.create_api_key(current.user, body.name, body.scopes, body.expires_days)
    return ApiKeyCreated(id=ak.id, key=full, name=ak.name, created_at=ak.created_at)


@router.get("/apikeys", response_model=list[ApiKeyInfo])
async def list_api_keys(current: CurrentUser = Depends(get_current_user), service: AuthService = Depends(get_auth_service), user_id: int | None = None) -> list[ApiKeyInfo]:
    # Admin can list other users' keys; otherwise force own user_id
    target_user_id = user_id if (user_id is not None and "admin" in current.roles) else current.id
    rows = await service.list_api_keys(user_id=target_user_id)
    return [
        ApiKeyInfo(
            id=r.id,
            name=r.name,
            created_at=r.created_at,
            last_used_at=r.last_used_at,
            expires_at=r.expires_at,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.delete("/apikeys/{key_id}")
async def revoke_api_key(key_id: int, current: CurrentUser = Depends(get_current_user), service: AuthService = Depends(get_auth_service), session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    # Only owner or admin can revoke
    row = await session.execute(select(ApiKey).where(ApiKey.id == key_id))
    ak = row.scalars().first()
    if not ak:
        raise HTTPException(status_code=404, detail="API key not found")
    if ak.user_id != current.id and "admin" not in current.roles:
        raise HTTPException(status_code=403, detail="Forbidden")
    ok = await service.revoke_api_key(key_id=key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "ok"}


@router.get("/roles", response_model=list[RoleInfo], dependencies=[Depends(require_roles("admin"))])
async def list_roles(service: AuthService = Depends(get_auth_service)) -> list[RoleInfo]:
    rows = await service.list_roles()
    return [RoleInfo(id=r.id, name=r.name) for r in rows]


@router.patch("/users/{user_id}", response_model=UserInfo, dependencies=[Depends(require_roles("admin"))])
async def update_user(user_id: int, body: UpdateUserRequest, service: AuthService = Depends(get_auth_service), audit: AuditService = Depends(get_audit_service)) -> UserInfo:
    user = await service.update_user(user_id, is_active=body.is_active)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    # roles update if provided
    if body.roles is not None:
        user = await service.set_user_roles(user_id, body.roles) or user
    try:
        await audit.log(action="user_update", resource="user", success=True, username=user.username, details={"is_active": body.is_active, "roles": body.roles})
    except Exception:
        pass
    return UserInfo(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        roles=[r.name for r in user.roles],
        tenant_id=user.tenant_id,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


@router.get("/sessions", response_model=list[SessionInfo])
async def list_sessions(current: CurrentUser = Depends(get_current_user), service: AuthService = Depends(get_auth_service)) -> list[SessionInfo]:
    rows = await service.list_sessions(user_id=current.id)
    return [
        SessionInfo(id=r.id, jti=r.jti, created_at=r.created_at, expires_at=r.expires_at, revoked=r.revoked)
        for r in rows
    ]


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: int, current: CurrentUser = Depends(get_current_user), service: AuthService = Depends(get_auth_service)) -> dict[str, str]:
    ok = await service.revoke_session(session_id=session_id, actor=current.user)
    if not ok:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"status": "ok"}
