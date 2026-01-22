"""
Background tasks process lock.

Purpose:
- In multi-worker deployments (e.g. uvicorn/gunicorn workers), avoid starting periodic background
  tasks multiple times inside the web API process.
- This is a best-effort *local* lock (same machine/container). For multi-instance deployments,
  run background tasks in a dedicated worker process or use a distributed lock.
"""

from __future__ import annotations

import os
import tempfile
from typing import IO, Optional

from .logging import get_logger


def acquire_background_tasks_lock(logger=None) -> Optional[IO[str]]:
    """Try to acquire a non-blocking file lock. Returns the opened file handle on success."""
    log = logger or get_logger(__name__)
    lock_path = os.getenv("BACKGROUND_TASKS_LOCKFILE") or os.path.join(
        tempfile.gettempdir(), "canvas_background_tasks.lock"
    )

    try:
        fh: IO[str] = open(lock_path, "a+", encoding="utf-8")
        fh.seek(0)

        try:
            if os.name == "nt":
                import msvcrt

                # Locking 1 byte is enough to represent mutual exclusion.
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

            fh.seek(0)
            fh.truncate()
            fh.write(str(os.getpid()))
            fh.flush()
            return fh
        except Exception:
            try:
                fh.close()
            except Exception:
                pass
            return None
    except Exception as e:
        log.warning("Background tasks lock init failed: %s", e)
        return None


def release_background_tasks_lock(fh: Optional[IO[str]]) -> None:
    """Release the lock and close the file handle."""
    if not fh:
        return

    try:
        if os.name == "nt":
            import msvcrt

            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except Exception:
        pass

    try:
        fh.close()
    except Exception:
        pass

