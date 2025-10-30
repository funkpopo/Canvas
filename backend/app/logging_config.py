import logging
import os


def setup_logging() -> None:
    """初始化基础日志配置。

    - 日志级别通过环境变量 LOG_LEVEL 控制，默认 INFO
    - 简洁格式，包含级别、时间、模块名与消息
    - 与 uvicorn 日志不冲突（沿用 root 配置）
    """
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    # 避免重复添加 handler
    if logging.getLogger().handlers:
        logging.getLogger().setLevel(level)
        return

    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

