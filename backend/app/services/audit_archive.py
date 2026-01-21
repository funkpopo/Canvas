"""
审计日志归档/清理

策略（轻量版）：
- 通过环境变量控制保留天数
- 定时删除超过保留期的审计日志（批量删除，避免一次性大事务）
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.logging import get_logger
from ..database import SessionLocal
from .. import models

logger = get_logger(__name__)


AUDIT_LOG_CLEANUP_ENABLED = os.getenv("AUDIT_LOG_CLEANUP_ENABLED", "true").lower() == "true"
AUDIT_LOG_RETENTION_DAYS = int(os.getenv("AUDIT_LOG_RETENTION_DAYS", "30"))
AUDIT_LOG_CLEANUP_INTERVAL_HOURS = int(os.getenv("AUDIT_LOG_CLEANUP_INTERVAL_HOURS", "24"))
AUDIT_LOG_CLEANUP_BATCH_SIZE = int(os.getenv("AUDIT_LOG_CLEANUP_BATCH_SIZE", "5000"))


def purge_audit_logs_older_than(db: Session, cutoff: datetime, batch_size: int = AUDIT_LOG_CLEANUP_BATCH_SIZE) -> int:
    """批量删除早于 cutoff 的审计日志，返回删除数量。"""
    total_deleted = 0

    while True:
        ids = (
            db.query(models.AuditLog.id)
            .filter(models.AuditLog.created_at < cutoff)
            .order_by(models.AuditLog.id.asc())
            .limit(batch_size)
            .all()
        )
        if not ids:
            break

        id_list = [row[0] for row in ids]
        deleted = (
            db.query(models.AuditLog)
            .filter(models.AuditLog.id.in_(id_list))
            .delete(synchronize_session=False)
        )
        db.commit()
        total_deleted += int(deleted or 0)

        # 若实际删除少于 batch，说明已接近尾部，可快速退出
        if len(id_list) < batch_size:
            break

    return total_deleted


async def audit_log_cleanup_worker(stop_event: asyncio.Event) -> None:
    """后台清理任务：定期删除过期审计日志。"""
    if not AUDIT_LOG_CLEANUP_ENABLED:
        logger.info("Audit log cleanup disabled (AUDIT_LOG_CLEANUP_ENABLED=false)")
        return

    interval = max(1, AUDIT_LOG_CLEANUP_INTERVAL_HOURS) * 3600
    retention_days = max(1, AUDIT_LOG_RETENTION_DAYS)

    logger.info(
        "Audit log cleanup started: retention_days=%s interval_hours=%s batch_size=%s",
        retention_days,
        AUDIT_LOG_CLEANUP_INTERVAL_HOURS,
        AUDIT_LOG_CLEANUP_BATCH_SIZE,
    )

    while not stop_event.is_set():
        try:
            # SQLAlchemy 同步 I/O：放入线程池，避免阻塞 FastAPI 事件循环。
            def _run_once() -> tuple[int, str]:
                cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
                db = SessionLocal()
                try:
                    deleted = purge_audit_logs_older_than(db, cutoff, AUDIT_LOG_CLEANUP_BATCH_SIZE)
                    return int(deleted or 0), cutoff.isoformat()
                finally:
                    db.close()

            deleted, cutoff_iso = await asyncio.to_thread(_run_once)
            if deleted:
                logger.info("Audit log cleanup deleted=%s cutoff=%s", deleted, cutoff_iso)
        except Exception as e:
            logger.exception("Audit log cleanup failed: %s", e)

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue


