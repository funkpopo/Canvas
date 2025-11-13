"""
Celery异步任务配置
用于处理耗时的Kubernetes操作和后台任务
"""
import os
from celery import Celery

# Celery配置
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB_CELERY = int(os.getenv("REDIS_DB_CELERY", "1"))  # 使用独立的数据库
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# 构建broker和backend URL
if REDIS_PASSWORD:
    BROKER_URL = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_CELERY}"
    RESULT_BACKEND = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_CELERY}"
else:
    BROKER_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_CELERY}"
    RESULT_BACKEND = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_CELERY}"

# 创建Celery应用
celery_app = Celery(
    "canvas",
    broker=BROKER_URL,
    backend=RESULT_BACKEND
)

# Celery配置
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 任务超时30分钟
    task_soft_time_limit=25 * 60,  # 软超时25分钟
    worker_prefetch_multiplier=4,  # 每个worker预取4个任务
    worker_max_tasks_per_child=1000,  # 每个worker处理1000个任务后重启
    task_acks_late=True,  # 任务完成后才确认
    task_reject_on_worker_lost=True,  # worker丢失时拒绝任务
    result_expires=3600,  # 结果保留1小时
)

# 导入任务模块
celery_app.autodiscover_tasks(['app.tasks'])
