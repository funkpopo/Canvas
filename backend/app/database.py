from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging

from .core.config import settings

# 使用统一配置创建数据库引擎
if settings.DATABASE_TYPE.lower() == "mysql":
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=settings.DB_POOL_PRE_PING,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        echo=settings.LOG_SQL_QUERIES,
        echo_pool=False,
        pool_use_lifo=True
    )
else:  # 默认SQLite
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        pool_size=settings.SQLITE_POOL_SIZE,
        max_overflow=settings.SQLITE_MAX_OVERFLOW,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# 导入模型以确保它们被注册到Base
from . import models


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """创建所有表"""
    Base.metadata.create_all(bind=engine)


def init_default_user():
    """初始化默认用户"""
    from .models import User
    db = SessionLocal()
    logger = logging.getLogger(__name__)
    try:
        # 检查是否已存在admin用户
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            # 创建默认admin用户
            default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
            hashed_password = User.get_password_hash(default_password)
            admin_user = User(
                username="admin",
                hashed_password=hashed_password,
                role="admin",
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            logger.warning("默认用户 'admin' 已创建。请尽快修改默认密码或通过环境变量 DEFAULT_ADMIN_PASSWORD 设定。")
        else:
            # 如果admin用户存在但role字段为空，更新为admin
            if not hasattr(user, 'role') or not user.role or user.role == "user":
                user.role = "admin"
                db.commit()
                logger.info("默认用户 'admin' 角色已更新为管理员")
            else:
                logger.info("默认用户 'admin' 已存在")
    except Exception as e:
        logger.exception("初始化默认用户失败: %s", e)
        db.rollback()
    finally:
        db.close()
