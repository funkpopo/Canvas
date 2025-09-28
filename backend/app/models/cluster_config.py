from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ClusterConfig(Base):
    __tablename__ = "cluster_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    api_server: Mapped[str | None] = mapped_column(String(512), nullable=True)
    namespace: Mapped[str | None] = mapped_column(String(128), nullable=True)
    context: Mapped[str | None] = mapped_column(String(128), nullable=True)
    kubeconfig: Mapped[str | None] = mapped_column(Text, nullable=True)
    token: Mapped[str | None] = mapped_column(Text, nullable=True)
    certificate_authority_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    insecure_skip_tls_verify: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
