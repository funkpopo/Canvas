from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request, WebSocket, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_jwt_token, verify_password
from app.db import get_session
from app.models.user import ApiKey, Role, User


class CurrentUser:
    def __init__(self, user: User):
        self.user = user

    @property
    def id(self) -> int:
        return self.user.id

    @property
    def username(self) -> str:
        return self.user.username

    @property
    def roles(self) -> list[str]:
        return [r.name for r in self.user.roles]

    @property
    def tenant_id(self) -> int | None:
        return self.user.tenant_id


async def get_current_user(request: Request, session: AsyncSession = Depends(get_session)) -> CurrentUser:
    # Accept: Authorization: Bearer <token>
    authz = request.headers.get("Authorization")
    if not authz or not authz.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")
    token = authz.split(" ", 1)[1].strip()
    # Try JWT first
    try:
        payload = decode_jwt_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        username = str(payload.get("sub"))
        user = (await session.execute(select(User).where(User.username == username))).scalars().first()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled")
        return CurrentUser(user)
    except HTTPException:
        raise
    except Exception:
        # Fallback: API key format sk_live_<id>_<secret>
        try:
            if token.startswith("sk_"):
                parts = token.split("_")
                if len(parts) < 3:
                    raise ValueError
                key_id = parts[2]
                secret = "_".join(parts[3:]) if len(parts) > 3 else ""
                ak = (await session.execute(select(ApiKey).where(ApiKey.key_id == key_id, ApiKey.is_active == True))).scalars().first()  # noqa: E712
                if not ak:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
                if ak.expires_at and ak.expires_at <= datetime.now(timezone.utc):
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key expired")
                if not verify_password(secret, ak.key_hash):
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key secret")
                user = (await session.execute(select(User).where(User.id == ak.user_id))).scalars().first()
                if not user or not user.is_active:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled")
                # best-effort update last_used_at
                try:
                    ak.last_used_at = datetime.now(timezone.utc)
                    await session.commit()
                except Exception:
                    pass
                return CurrentUser(user)
        except HTTPException:
            raise
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def require_roles(*allowed: str):
    async def _dep(current: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        for r in current.roles:
            if r in allowed:
                return current
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    return _dep


async def _authenticate_token(token: str, session: AsyncSession) -> CurrentUser:
    """Authenticate a bearer JWT or API key token and return CurrentUser.

    - JWT: must be an access token with valid signature and not expired.
    - API key: accepts format sk_<env>_<key_id>_<secret> and verifies secret hash.
    """
    # Try JWT first
    try:
        payload = decode_jwt_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        username = str(payload.get("sub"))
        user = (await session.execute(select(User).where(User.username == username))).scalars().first()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled")
        return CurrentUser(user)
    except HTTPException:
        raise
    except Exception:
        # Fallback to API key
        try:
            if token.startswith("sk_"):
                parts = token.split("_")
                if len(parts) < 3:
                    raise ValueError
                key_id = parts[2]
                secret = "_".join(parts[3:]) if len(parts) > 3 else ""
                ak = (await session.execute(select(ApiKey).where(ApiKey.key_id == key_id, ApiKey.is_active == True))).scalars().first()  # noqa: E712
                if not ak:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
                if ak.expires_at and ak.expires_at <= datetime.now(timezone.utc):
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key expired")
                if not verify_password(secret, ak.key_hash):
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key secret")
                user = (await session.execute(select(User).where(User.id == ak.user_id))).scalars().first()
                if not user or not user.is_active:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled")
                try:
                    ak.last_used_at = datetime.now(timezone.utc)
                    await session.commit()
                except Exception:
                    pass
                return CurrentUser(user)
        except HTTPException:
            raise
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user_ws(websocket: WebSocket, session: AsyncSession) -> CurrentUser:
    """Authenticate WebSocket connections using either `token` query param
    or `Authorization: Bearer <token>` header. Returns CurrentUser on success.
    """
    # Prefer token from query param for browser compatibility
    token = (websocket.query_params.get("token") or "").strip()
    if not token:
        authz = websocket.headers.get("Authorization")
        if authz and authz.lower().startswith("bearer "):
            token = authz.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return await _authenticate_token(token, session)
