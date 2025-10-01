from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AuditLog(Base):
  __tablename__ = "audit_logs"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
  action: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
  resource: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
  namespace: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
  name: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
  username: Mapped[str | None] = mapped_column(String(255), nullable=True)
  success: Mapped[bool] = mapped_column(Boolean, default=True)
  details: Mapped[str | None] = mapped_column(Text, nullable=True)

