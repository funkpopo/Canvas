"""
轻量级可观测性/监控指标（无需外部依赖）。

- 记录近一段时间的请求量/状态码分布/延迟
- 提供快照用于 API 输出
"""

from __future__ import annotations

import time
from collections import Counter, deque
from dataclasses import dataclass
from threading import Lock
from typing import Any, Deque, Dict, Tuple


@dataclass(frozen=True)
class LatencySummary:
    count: int
    avg_ms: float
    p95_ms: float
    max_ms: float


class RequestMetrics:
    def __init__(self, window_size: int = 2000) -> None:
        self.started_at = time.time()
        self._lock = Lock()
        self._total = 0
        self._status = Counter()
        self._by_route: Counter[Tuple[str, str]] = Counter()  # (method, path)
        self._latencies_ms: Deque[float] = deque(maxlen=window_size)

    def observe(self, method: str, path: str, status_code: int, duration_ms: float) -> None:
        with self._lock:
            self._total += 1
            self._status[int(status_code)] += 1
            self._by_route[(method.upper(), path)] += 1
            self._latencies_ms.append(float(duration_ms))

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            latencies = list(self._latencies_ms)
            total = self._total
            status = dict(self._status)
            by_route = {f"{m} {p}": c for (m, p), c in self._by_route.most_common(50)}

        summary = self._summarize_latencies(latencies)
        return {
            "uptime_seconds": max(0, int(time.time() - self.started_at)),
            "total_requests": total,
            "status_counts": status,
            "top_routes": by_route,
            "latency_ms": {
                "count": summary.count,
                "avg": summary.avg_ms,
                "p95": summary.p95_ms,
                "max": summary.max_ms,
            },
        }

    @staticmethod
    def _summarize_latencies(latencies: list[float]) -> LatencySummary:
        if not latencies:
            return LatencySummary(count=0, avg_ms=0.0, p95_ms=0.0, max_ms=0.0)
        latencies_sorted = sorted(latencies)
        count = len(latencies_sorted)
        avg = sum(latencies_sorted) / count
        p95_idx = min(count - 1, int(count * 0.95) - 1 if count > 0 else 0)
        p95 = latencies_sorted[p95_idx]
        return LatencySummary(count=count, avg_ms=round(avg, 2), p95_ms=round(p95, 2), max_ms=round(max(latencies_sorted), 2))


request_metrics = RequestMetrics()


