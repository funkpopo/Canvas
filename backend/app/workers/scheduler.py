import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


class PeriodicTask:
    def __init__(self, interval_seconds: int, action: Callable[[], Awaitable[Any]], name: str) -> None:
        self.interval_seconds = interval_seconds
        self.action = action
        self.name = name
        self._task: asyncio.Task[Any] | None = None
        self._stopped = asyncio.Event()

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stopped.clear()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if not self._task:
            return
        self._stopped.set()
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            logger.info("scheduler.task_cancelled", task=self.name)

    async def _run(self) -> None:
        while not self._stopped.is_set():
            try:
                await self.action()
            except Exception as exc:  # pragma: no cover
                logger.warning("scheduler.task_error", task=self.name, error=str(exc))
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=self.interval_seconds)
            except asyncio.TimeoutError:
                continue
