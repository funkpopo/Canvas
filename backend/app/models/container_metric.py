from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ContainerMetric(Base):
    __tablename__ = "container_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    namespace: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    pod: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    container: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    cpu_mcores: Mapped[int] = mapped_column(Integer, nullable=False)
    memory_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_container_metrics_key_ts", "namespace", "pod", "container", "ts"),
        Index("ix_container_metrics_ns_pod_ts", "namespace", "pod", "ts"),
        Index("ix_container_metrics_ts", "ts"),
    )
