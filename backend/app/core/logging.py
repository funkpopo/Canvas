"""
Logging configuration for Canvas application.
统一的日志配置模块，支持彩色控制台与JSON结构化日志。
"""
import json
import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from typing import Any, Dict, Optional
from .config import settings
from .request_context import request_id_var, trace_id_var, span_id_var

_CONFIGURED = False


class ContextFilter(logging.Filter):
    """把 request_id/trace_id/span_id 自动注入 LogRecord。"""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        rid = getattr(record, "request_id", None) or request_id_var.get()
        tid = getattr(record, "trace_id", None) or trace_id_var.get()
        sid = getattr(record, "span_id", None) or span_id_var.get()

        if rid is not None:
            record.request_id = rid
        if tid is not None:
            record.trace_id = tid
        if sid is not None:
            record.span_id = sid

        # 统一服务/环境字段（便于日志检索）
        if not hasattr(record, "service"):
            record.service = "canvas"
        if not hasattr(record, "env"):
            record.env = settings.ENVIRONMENT
        return True


class ColoredFormatter(logging.Formatter):
    """彩色日志格式化器（用于控制台输出）"""

    COLORS = {
        "DEBUG": "\033[36m",  # 青色
        "INFO": "\033[32m",  # 绿色
        "WARNING": "\033[33m",  # 黄色
        "ERROR": "\033[31m",  # 红色
        "CRITICAL": "\033[35m",  # 紫色
    }
    RESET = "\033[0m"

    def format(self, record):
        log_color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{log_color}{record.levelname}{self.RESET}"
        return super().format(record)


class JSONFormatter(logging.Formatter):
    """JSON 结构化日志格式化器。

    会输出标准字段：time, level, name, message，并合并额外字段。
    同时对敏感字段进行简单脱敏处理。
    """

    REDACT_KEYS = {"password", "passwd", "secret", "token", "authorization", "jwt"}

    def __init__(self, datefmt: Optional[str] = None) -> None:
        super().__init__(datefmt=datefmt)

    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        payload: Dict[str, Any] = {
            "time": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }

        # 注入上下文字段（优先 LogRecord，其次 contextvars）
        rid = getattr(record, "request_id", None) or request_id_var.get()
        if rid:
            payload["request_id"] = rid
        tid = getattr(record, "trace_id", None) or trace_id_var.get()
        if tid:
            payload["trace_id"] = tid
        sid = getattr(record, "span_id", None) or span_id_var.get()
        if sid:
            payload["span_id"] = sid

        # 合并额外属性
        for key, value in record.__dict__.items():
            if key in {"args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName", "levelname", "levelno", "lineno", "module", "msecs", "message", "msg", "name", "pathname", "process", "processName", "relativeCreated", "stack_info", "thread", "threadName"}:
                continue
            safe_key = str(key)
            payload[safe_key] = self._redact(value) if safe_key.lower() in self.REDACT_KEYS else value

        # 异常信息
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)

    @staticmethod
    def _redact(value: Any) -> str:
        try:
            text = str(value)
        except Exception:
            text = "<redacted>"
        return "***REDACTED***" if text else text


def setup_logging(
    name: Optional[str] = None,
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    use_color: bool = True,
) -> logging.Logger:
    """配置日志系统（统一配置 root logger）

    Args:
        name: 日志记录器名称
        level: 日志级别
        log_file: 日志文件路径
        use_color: 是否使用彩色输出

    Returns:
        logging.Logger: 配置好的日志记录器
    """
    global _CONFIGURED
    logger = logging.getLogger(name or "canvas")

    if _CONFIGURED:
        return logger

    root = logging.getLogger()
    root.setLevel(level or settings.LOG_LEVEL)

    # 清理默认 handler，避免重复输出
    for h in list(root.handlers):
        root.removeHandler(h)

    context_filter = ContextFilter()

    # 控制台 handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    console_handler.addFilter(context_filter)

    if getattr(settings, "LOG_JSON", False):
        console_formatter = JSONFormatter(datefmt=settings.LOG_DATE_FORMAT)
    elif use_color and sys.stdout.isatty():
        console_formatter = ColoredFormatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)
    else:
        console_formatter = logging.Formatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)

    console_handler.setFormatter(console_formatter)
    root.addHandler(console_handler)

    # 文件 handler（可选）
    file_path = log_file or settings.LOG_FILE
    if file_path:
        log_path = Path(file_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = RotatingFileHandler(
            file_path,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.addFilter(context_filter)

        if getattr(settings, "LOG_JSON", False):
            file_formatter = JSONFormatter(datefmt=settings.LOG_DATE_FORMAT)
        else:
            file_formatter = logging.Formatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)
        file_handler.setFormatter(file_formatter)
        root.addHandler(file_handler)

    # 让常见 logger 走 root handlers
    for log_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        l = logging.getLogger(log_name)
        l.handlers = []
        l.propagate = True

    if getattr(settings, "LOG_SQL_QUERIES", False):
        sqlalchemy_logger = logging.getLogger("sqlalchemy.engine")
        sqlalchemy_logger.setLevel(logging.INFO)
        sqlalchemy_logger.handlers = []
        sqlalchemy_logger.propagate = True

    _CONFIGURED = True
    return logger


def setup_timed_rotating_logging(
    name: Optional[str] = None,
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    when: str = "midnight",
    interval: int = 1,
    backup_count: int = 30,
) -> logging.Logger:
    """配置基于时间轮转的日志系统

    Args:
        name: 日志记录器名称
        level: 日志级别
        log_file: 日志文件路径
        when: 轮转时间单位 (S, M, H, D, midnight)
        interval: 轮转间隔
        backup_count: 保留的备份数量

    Returns:
        logging.Logger: 配置好的日志记录器
    """
    logger = logging.getLogger(name or "canvas")
    logger.setLevel(level or settings.LOG_LEVEL)

    # 避免重复添加处理器
    if logger.handlers:
        return logger

    # 控制台处理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    if getattr(settings, "LOG_JSON", False):
        console_formatter = JSONFormatter(datefmt=settings.LOG_DATE_FORMAT)
    else:
        console_formatter = ColoredFormatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 文件处理器
    file_path = log_file or settings.LOG_FILE
    if file_path:
        # 确保日志目录存在
        log_path = Path(file_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        # 使用TimedRotatingFileHandler按时间轮转
        file_handler = TimedRotatingFileHandler(
            file_path,
            when=when,
            interval=interval,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)

        if getattr(settings, "LOG_JSON", False):
            file_formatter = JSONFormatter(datefmt=settings.LOG_DATE_FORMAT)
        else:
            file_formatter = logging.Formatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

    return logger


def get_logger(name: str) -> logging.Logger:
    """获取日志记录器

    Args:
        name: 日志记录器名称

    Returns:
        logging.Logger: 日志记录器
    """
    return logging.getLogger(name)


# 创建全局日志记录器
logger = setup_logging()
