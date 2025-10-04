from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_jwt_token, hash_password, verify_password
from app.models.user import ApiKey, RefreshToken, Role, Tenant, User, UserRole
from app.config import get_settings


class AuthService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def get_user_by_username(self, username: str) -> User | None:
        async with self._session_factory() as session:
            stmt = select(User).where(User.username == username)
            row = await session.execute(stmt)
            return row.scalars().first()

    async def ensure_roles(self, names: Iterable[str]) -> list[Role]:
        async with self._session_factory() as session:
            roles: list[Role] = []
            for nm in names:
                stmt = select(Role).where(Role.name == nm)
                row = await session.execute(stmt)
                role = row.scalars().first()
                if not role:
                    role = Role(name=nm)
                    session.add(role)
            await session.commit()
            # fetch again
            for nm in names:
                r = (await session.execute(select(Role).where(Role.name == nm))).scalars().first()
                if r:
                    roles.append(r)
            return roles

    async def create_user(self, username: str, password: str, *, display_name: str | None = None, email: str | None = None, tenant_slug: str | None = None, roles: Iterable[str] = ()) -> User:
        async with self._session_factory() as session:
            now = datetime.now(timezone.utc)
            tenant_id: int | None = None
            tenant: Tenant | None = None
            if tenant_slug:
                row = await session.execute(select(Tenant).where(Tenant.slug == tenant_slug))
                tenant = row.scalars().first()
                if not tenant:
                    tenant = Tenant(name=tenant_slug, slug=tenant_slug, created_at=now)
                    session.add(tenant)
                    await session.flush()
                tenant_id = tenant.id
            user = User(
                username=username,
                display_name=display_name,
                email=email,
                password_hash=hash_password(password),
                is_active=True,
                tenant_id=tenant_id,
                created_at=now,
                updated_at=now,
                last_login_at=None,
            )
            session.add(user)
            await session.flush()
            if roles:
                ensured = await self.ensure_roles(roles)
                for r in ensured:
                    session.add(UserRole(user_id=user.id, role_id=r.id))
            await session.commit()
            # reload with roles
            return (await session.execute(select(User).where(User.id == user.id))).scalars().first()  # type: ignore[return-value]

    async def verify_user_password(self, user: User, password: str) -> bool:
        return verify_password(password, user.password_hash)

    async def issue_tokens(self, user: User) -> tuple[str, str, int]:
        settings = get_settings()
        roles = [r.name for r in user.roles]
        tenant_id = user.tenant_id
        access_ttl = timedelta(minutes=settings.access_token_exp_minutes)
        refresh_ttl = timedelta(days=settings.refresh_token_exp_days)
        jti = secrets.token_hex(16)
        access = create_jwt_token(user.username, roles=roles, tenant_id=tenant_id, expires_delta=access_ttl, token_type="access")
        refresh = create_jwt_token(user.username, roles=roles, tenant_id=tenant_id, expires_delta=refresh_ttl, token_type="refresh", jti=jti)
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            session.add(RefreshToken(jti=jti, user_id=user.id, created_at=now, expires_at=now + refresh_ttl, revoked=False))
            await session.commit()
        return access, refresh, int(access_ttl.total_seconds())

    async def set_last_login(self, user_id: int) -> None:
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            row = await session.execute(select(User).where(User.id == user_id))
            u = row.scalars().first()
            if u:
                u.last_login_at = now
                u.updated_at = now
                await session.commit()

    async def rotate_refresh(self, refresh_jti: str, user: User) -> tuple[str, str, int]:
        # revoke old jti
        settings = get_settings()
        async with self._session_factory() as session:
            row = await session.execute(select(RefreshToken).where(RefreshToken.jti == refresh_jti, RefreshToken.user_id == user.id))
            rt = row.scalars().first()
            if not rt or rt.revoked:
                raise ValueError("invalid_refresh")
            rt.revoked = True
            await session.flush()
        return await self.issue_tokens(user)

    async def revoke_refresh(self, refresh_jti: str, user: User) -> None:
        async with self._session_factory() as session:
            row = await session.execute(select(RefreshToken).where(RefreshToken.jti == refresh_jti, RefreshToken.user_id == user.id))
            rt = row.scalars().first()
            if rt:
                rt.revoked = True
                await session.commit()

    async def create_api_key(self, user: User, name: str, scopes: list[str] | None = None, expires_days: int | None = None) -> tuple[ApiKey, str]:
        # key format: sk_live_<keyid>_<secret>
        now = datetime.now(timezone.utc)
        key_id = secrets.token_urlsafe(9).replace("_", "").replace("-", "")[:18]
        secret = secrets.token_urlsafe(24).replace("_", "").replace("-", "")
        full = f"sk_live_{key_id}_{secret}"
        # hash secret
        key_hash = hash_password(secret)
        async with self._session_factory() as session:
            ak = ApiKey(
                key_id=key_id,
                key_hash=key_hash,
                name=name,
                user_id=user.id,
                tenant_id=user.tenant_id,
                scopes=",".join(scopes or []),
                created_at=now,
                last_used_at=None,
                expires_at=(now + timedelta(days=expires_days)) if expires_days else None,
                is_active=True,
            )
            session.add(ak)
            await session.commit()
            return ak, full

    async def list_api_keys(self, *, user_id: int | None = None) -> list[ApiKey]:
        async with self._session_factory() as session:
            stmt = select(ApiKey)
            if user_id is not None:
                stmt = stmt.where(ApiKey.user_id == user_id)
            rows = (await session.execute(stmt.order_by(ApiKey.created_at.desc()))).scalars().all()
            return list(rows)

    async def revoke_api_key(self, *, key_id: int) -> bool:
        async with self._session_factory() as session:
            row = await session.execute(select(ApiKey).where(ApiKey.id == key_id))
            ak = row.scalars().first()
            if not ak:
                return False
            ak.is_active = False
            await session.commit()
            return True

    async def list_roles(self) -> list[Role]:
        async with self._session_factory() as session:
            rows = (await session.execute(select(Role))).scalars().all()
            return list(rows)

    async def update_user(self, user_id: int, *, is_active: bool | None = None) -> User | None:
        async with self._session_factory() as session:
            row = await session.execute(select(User).where(User.id == user_id))
            user = row.scalars().first()
            if not user:
                return None
            changed = False
            if is_active is not None:
                user.is_active = is_active
                changed = True
            if changed:
                user.updated_at = datetime.now(timezone.utc)
                await session.commit()
            return (await session.execute(select(User).where(User.id == user_id))).scalars().first()

    async def set_user_roles(self, user_id: int, role_names: list[str]) -> User | None:
        async with self._session_factory() as session:
            row = await session.execute(select(User).where(User.id == user_id))
            user = row.scalars().first()
            if not user:
                return None
            # ensure roles exist
            ensured = await self.ensure_roles(role_names)
            # clear existing
            await session.execute(
                select(UserRole).where(UserRole.user_id == user_id)
            )
            # The above select doesn't delete; need to delete via delete() in SQLAlchemy 2.0
            from sqlalchemy import delete as sqla_delete

            await session.execute(sqla_delete(UserRole).where(UserRole.user_id == user_id))
            for r in ensured:
                session.add(UserRole(user_id=user_id, role_id=r.id))
            await session.commit()
            return (await session.execute(select(User).where(User.id == user_id))).scalars().first()
