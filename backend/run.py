#!/usr/bin/env python3
"""
Canvas Backend Server
启动FastAPI服务器
"""

import os
import uvicorn
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

from app.core.config import settings
from app.core.logging import setup_logging

# 使用应用自身的统一日志配置，避免 uvicorn 默认 log_config 覆盖
setup_logging()

from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,  # 开发模式下自动重载
        log_level=settings.LOG_LEVEL.lower(),
        log_config=None,
    )
