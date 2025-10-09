from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# SQLite数据库文件路径
DATABASE_URL = "sqlite:///./canvas.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite需要这个参数
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
    try:
        # 检查是否已存在admin用户
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            # 创建默认admin用户
            hashed_password = User.get_password_hash("admin123")
            admin_user = User(
                username="admin",
                hashed_password=hashed_password,
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            print("默认用户 'admin' 已创建，密码：admin123")
        else:
            print("默认用户 'admin' 已存在")
    except Exception as e:
        print(f"初始化默认用户失败: {e}")
        db.rollback()
    finally:
        db.close()
