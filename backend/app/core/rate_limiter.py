import asyncio
import time


class RateLimiter:
    """Simple token bucket limiter compatible with asyncio."""

    def __init__(self, rate: int, interval: float = 60.0) -> None:
        if rate <= 0:
            raise ValueError("rate must be greater than zero")
        self._rate = rate
        self._interval = interval
        self._tokens = float(rate)
        self._updated_at = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            await self._refill()
            while self._tokens < 1:
                await asyncio.sleep(self._interval / self._rate)
                await self._refill()
            self._tokens -= 1

    async def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._updated_at
        tokens_to_add = elapsed * (self._rate / self._interval)
        if tokens_to_add > 0:
            self._tokens = min(self._rate, self._tokens + tokens_to_add)
            self._updated_at = now
