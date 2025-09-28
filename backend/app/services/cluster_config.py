from __future__ import annotations

from typing import Optional

from pydantic import AnyHttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.cluster_config import ClusterConfig
from app.schemas.config import ClusterConfigPayload


class ClusterConfigService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def get_default(self) -> Optional[ClusterConfig]:
        async with self._session_factory() as session:
            return await self._get_default(session)

    async def upsert_default(self, payload: ClusterConfigPayload) -> ClusterConfig:
        async with self._session_factory() as session:
            config = await self._get_default(session)

            token: str | None = None
            if payload.token is not None:
                raw_token = payload.token.get_secret_value().strip()
                token = raw_token or None

            if isinstance(payload.api_server, AnyHttpUrl):
                api_server: str | None = str(payload.api_server).strip()
            elif isinstance(payload.api_server, str):
                api_server = payload.api_server.strip() or None
            else:
                api_server = None

            namespace = payload.namespace.strip() if payload.namespace else None
            context = payload.context.strip() if payload.context else None
            kubeconfig = payload.kubeconfig.strip() if payload.kubeconfig else None
            certificate = (
                payload.certificate_authority_data.strip()
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
            await session.commit()
            await session.refresh(config)
            return config

    async def _get_default(self, session: AsyncSession) -> Optional[ClusterConfig]:
        result = await session.execute(
            select(ClusterConfig).order_by(ClusterConfig.created_at.asc()).limit(1)
        )
        return result.scalar_one_or_none()
