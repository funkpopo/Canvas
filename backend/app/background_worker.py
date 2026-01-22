"""
Standalone background worker for Canvas.

This allows running periodic background jobs (alert checker / audit cleanup) outside the
FastAPI web process, so web workers remain focused on request handling.
"""

from __future__ import annotations

import asyncio
import os
import signal

from .core.background_tasks_lock import acquire_background_tasks_lock, release_background_tasks_lock
from .core.logging import get_logger
from .database import create_tables, init_default_user


async def run_background_worker() -> None:
    logger = get_logger(__name__)

    # Keep worker startup idempotent; same as API lifespan().
    create_tables()
    init_default_user()

    # K8s client pool cleanup thread is useful for long-running workers too.
    from .services.k8s import _client_pool

    _client_pool.start_cleanup_thread()

    enable_bg = os.getenv("ENABLE_BACKGROUND_TASKS", "true").lower() == "true"
    if not enable_bg:
        logger.info("Background worker exiting: ENABLE_BACKGROUND_TASKS=false")
        _client_pool.stop_cleanup_thread()
        return

    lock_fh = acquire_background_tasks_lock(logger)
    if not lock_fh:
        logger.info("Background worker not started: lock already held by another process")
        _client_pool.stop_cleanup_thread()
        return

    stop_event = asyncio.Event()

    def _request_stop() -> None:
        if not stop_event.is_set():
            logger.info("Background worker stop requested")
            stop_event.set()

    # Best-effort signal handling (Windows may not support loop.add_signal_handler).
    try:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _request_stop)
            except NotImplementedError:
                signal.signal(sig, lambda *_: _request_stop())
    except Exception:
        pass

    tasks: list[asyncio.Task] = []
    alert_checker = None

    try:
        from .services.alert_checker import alert_checker as _alert_checker
        from .services.audit_archive import audit_log_cleanup_worker

        alert_checker = _alert_checker
        tasks.append(asyncio.create_task(alert_checker.start(), name="alert_checker"))
        tasks.append(asyncio.create_task(audit_log_cleanup_worker(stop_event), name="audit_log_cleanup"))

        logger.info("Background worker started")
        await stop_event.wait()
    finally:
        try:
            if alert_checker:
                await alert_checker.stop()
        except Exception:
            pass

        for t in tasks:
            try:
                t.cancel()
            except Exception:
                pass

        if tasks:
            try:
                await asyncio.gather(*tasks, return_exceptions=True)
            except Exception:
                pass

        _client_pool.stop_cleanup_thread()
        release_background_tasks_lock(lock_fh)
        logger.info("Background worker stopped")
