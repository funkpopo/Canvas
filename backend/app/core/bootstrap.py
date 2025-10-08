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
        # Ensure there is an 'admin' user and that it has the 'admin' role
        now = datetime.now(timezone.utc)

        # Ensure default tenant exists (or create if missing)
        tenant = (await session.execute(select(Tenant).where(Tenant.slug == "default"))).scalars().first()
        if not tenant:
            tenant = Tenant(name="default", slug="default", created_at=now)
            session.add(tenant)
            await session.flush()

        # Ensure admin user exists
        admin_user = (await session.execute(select(User).where(User.username == "admin"))).scalars().first()
        if not admin_user:
            admin_user = User(
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
            session.add(admin_user)
            await session.flush()

        # Ensure 'admin' role assigned to admin user
        admin_role = (await session.execute(select(Role).where(Role.name == "admin"))).scalars().first()
        if admin_role:
            has_binding = (
                await session.execute(
                    select(UserRole).where(UserRole.user_id == admin_user.id, UserRole.role_id == admin_role.id)
                )
            ).scalars().first()
            if not has_binding:
                session.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))

        await session.commit()