"""
Request-scoped context variables.

用于在不侵入业务代码的情况下，让日志自动携带 request_id / trace_id 等上下文信息。
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional


request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
trace_id_var: ContextVar[Optional[str]] = ContextVar("trace_id", default=None)
span_id_var: ContextVar[Optional[str]] = ContextVar("span_id", default=None)


