"""
Logging configuration for Canvas application.
统一的日志配置模块
"""
import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from typing import Optional
from .config import settings


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


def setup_logging(
    name: Optional[str] = None,
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    use_color: bool = True,
) -> logging.Logger:
    """配置日志系统

    Args:
        name: 日志记录器名称
        level: 日志级别
        log_file: 日志文件路径
        use_color: 是否使用彩色输出

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

    if use_color and sys.stdout.isatty():
        console_formatter = ColoredFormatter(
            settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT
        )
    else:
        console_formatter = logging.Formatter(
            settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT
        )

    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 文件处理器
    file_path = log_file or settings.LOG_FILE
    if file_path:
        # 确保日志目录存在
        log_path = Path(file_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        # 使用RotatingFileHandler进行日志轮转
        file_handler = RotatingFileHandler(
            file_path,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,  # 保留5个备份
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)

        file_formatter = logging.Formatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

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
