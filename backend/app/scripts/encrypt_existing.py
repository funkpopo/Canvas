from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.config import get_settings
from app.core.crypto import encrypt_if_configured
from app.db import get_session_factory
from app.models.cluster_config import ClusterConfig


async def main() -> None:
    settings = get_settings()
    if not settings.fernet_key:
        print("FERNET_KEY not configured. Aborting.")
        return
    session_factory = get_session_factory()
    async with session_factory() as session:
        res = await session.execute(select(ClusterConfig))
        rows = list(res.scalars().all())
        changed = 0
        for cfg in rows:
            updated = False
            if cfg.kubeconfig and not cfg.kubeconfig.startswith("enc:"):
                cfg.kubeconfig = encrypt_if_configured(cfg.kubeconfig)
                updated = True
            if cfg.token and not cfg.token.startswith("enc:"):
                cfg.token = encrypt_if_configured(cfg.token)
                updated = True
            if cfg.certificate_authority_data and not cfg.certificate_authority_data.startswith("enc:"):
                cfg.certificate_authority_data = encrypt_if_configured(cfg.certificate_authority_data)
                updated = True
            if updated:
                session.add(cfg)
                changed += 1
        if changed:
            await session.commit()
        print(f"Updated {changed} records.")


if __name__ == "__main__":
    asyncio.run(main())

