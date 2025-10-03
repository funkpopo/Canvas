from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.security import decode_jwt_token
from app.db import get_session
from app.schemas.auth import ApiKeyCreated, ApiKeyCreateRequest, CreateUserRequest, LoginRequest, RefreshRequest, TokenPair, UserInfo
from app.services.auth import AuthService
from app.db import get_session_factory
from app.models.user import Role, User


router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service() -> AuthService:
    return AuthService(get_session_factory())


@router.post("/login", response_model=TokenPair)
async def login(body: LoginRequest, service: AuthService = Depends(get_auth_service)) -> TokenPair:
    user = await service.get_user_by_username(body.username)
    if not user or not await service.verify_user_password(user, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access, refresh, ttl = await service.issue_tokens(user)
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
async def logout(body: RefreshRequest, service: AuthService = Depends(get_auth_service)) -> dict[str, str]:
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
        created_at=u.created_at,
        updated_at=u.updated_at,
        last_login_at=u.last_login_at,
    )


@router.post("/users", response_model=UserInfo, dependencies=[Depends(require_roles("admin"))])
async def create_user(body: CreateUserRequest, service: AuthService = Depends(get_auth_service)) -> UserInfo:
    user = await service.create_user(
        username=body.username,
        password=body.password,
        display_name=body.display_name,
        email=body.email,
        tenant_slug=body.tenant_slug,
        roles=body.roles,
    )
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

