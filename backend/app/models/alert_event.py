from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), index=True)
    labels: Mapped[str] = mapped_column(Text)
    annotations: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ends_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    generator_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)

