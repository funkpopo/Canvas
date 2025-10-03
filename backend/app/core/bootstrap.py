from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import hash_password
from app.models.user import Role, Tenant, User, UserRole


async def ensure_bootstrap(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with session_factory() as session:
        # Ensure default roles
        for name in ("viewer", "operator", "admin"):
            exists = (await session.execute(select(Role).where(Role.name == name))).scalars().first()
            if not exists:
                session.add(Role(name=name))
        await session.commit()

    async with session_factory() as session:
        # Ensure at least one admin user
        admin = (await session.execute(select(User).join(UserRole, isouter=True).join(Role, isouter=True).where(Role.name == "admin"))).scalars().first()
        if not admin:
            now = datetime.now(timezone.utc)
            # Create default tenant
            tenant = Tenant(name="default", slug="default", created_at=now)
            session.add(tenant)
            await session.flush()
            user = User(
                username="admin",
                display_name="Administrator",
                email=None,
                password_hash=hash_password("admin123"),
                is_active=True,
                tenant_id=tenant.id,
                created_at=now,
                updated_at=now,
                last_login_at=None,
            )
            session.add(user)
            await session.flush()
            # assign admin role
            role = (await session.execute(select(Role).where(Role.name == "admin"))).scalars().first()
            if role:
                session.add(UserRole(user_id=user.id, role_id=role.id))
            await session.commit()

