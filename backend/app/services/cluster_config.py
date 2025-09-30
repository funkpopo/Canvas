from __future__ import annotations

from typing import Optional, Sequence

from pydantic import AnyHttpUrl
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.cluster_config import ClusterConfig
from app.schemas.config import ClusterConfigPayload
from app.core.crypto import encrypt_if_configured


class ClusterConfigService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def get_default(self) -> Optional[ClusterConfig]:
        async with self._session_factory() as session:
            return await self._get_default(session)

    async def list_configs(self) -> list[ClusterConfig]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ClusterConfig).order_by(ClusterConfig.created_at.asc())
            )
            rows: Sequence[ClusterConfig] = result.scalars().all()
            return list(rows)

    async def set_default_by_name(self, name: str) -> Optional[ClusterConfig]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ClusterConfig).where(ClusterConfig.name == name)
            )
            config = result.scalar_one_or_none()
            if not config:
                return None
            await self._set_default(session, config)
            await session.commit()
            await session.refresh(config)
            return config

    async def upsert_default(self, payload: ClusterConfigPayload) -> ClusterConfig:
        async with self._session_factory() as session:
            # Find existing config by unique name, not just current default
            result = await session.execute(
                select(ClusterConfig).where(ClusterConfig.name == payload.name)
            )
            config = result.scalar_one_or_none()

            token: str | None = None
            if payload.token is not None:
                raw_token = payload.token.get_secret_value().strip()
                token = encrypt_if_configured(raw_token) if raw_token else None

            if isinstance(payload.api_server, AnyHttpUrl):
                api_server: str | None = str(payload.api_server).strip()
            elif isinstance(payload.api_server, str):
                api_server = payload.api_server.strip() or None
            else:
                api_server = None

            namespace = payload.namespace.strip() if payload.namespace else None
            context = payload.context.strip() if payload.context else None
            kubeconfig = encrypt_if_configured(payload.kubeconfig.strip()) if payload.kubeconfig else None
            certificate = (
                encrypt_if_configured(payload.certificate_authority_data.strip())
                if payload.certificate_authority_data
                else None
            )

            if config is None:
                config = ClusterConfig(
                    name=payload.name,
                    api_server=api_server,
                    namespace=namespace,
                    context=context,
                    kubeconfig=kubeconfig,
                    token=token,
                    certificate_authority_data=certificate,
                    insecure_skip_tls_verify=payload.insecure_skip_tls_verify,
                    is_default=True,
                )
            else:
                config.name = payload.name
                config.api_server = api_server
                config.namespace = namespace
                config.context = context
                config.kubeconfig = kubeconfig
                if payload.token is not None:
                    config.token = token
                config.certificate_authority_data = certificate
                config.insecure_skip_tls_verify = payload.insecure_skip_tls_verify

            session.add(config)
            # Ensure this becomes the default and others are unset
            await session.flush()
            await self._unset_others_as_default(session, config)
            await session.commit()
            await session.refresh(config)
            return config

    async def _get_default(self, session: AsyncSession) -> Optional[ClusterConfig]:
        # Prefer explicit default
        result = await session.execute(
            select(ClusterConfig)
            .where(ClusterConfig.is_default.is_(True))
            .order_by(ClusterConfig.updated_at.desc())
            .limit(1)
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            return cfg

        # Fallback to first available and mark it as default for future calls
        result_any = await session.execute(
            select(ClusterConfig).order_by(ClusterConfig.created_at.asc()).limit(1)
        )
        any_cfg = result_any.scalar_one_or_none()
        if any_cfg:
            await self._set_default(session, any_cfg)
            await session.commit()
        return any_cfg

    async def _set_default(self, session: AsyncSession, cfg: ClusterConfig) -> None:
        await self._unset_others_as_default(session, cfg)
        cfg.is_default = True
        session.add(cfg)

    async def _unset_others_as_default(
        self, session: AsyncSession, cfg: ClusterConfig
    ) -> None:
        await session.execute(
            update(ClusterConfig)
            .where(ClusterConfig.id != cfg.id)
            .values(is_default=False)
        )
