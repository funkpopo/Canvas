"""
认证服务模块
提供认证、会话管理、API密钥等功能
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from fastapi import Request

from app import models
from app.core import security
from app.core.config import settings

logger = logging.getLogger(__name__)


def create_user_session(
    db: Session,
    user: models.User,
    refresh_token_id: int,
    request: Optional[Request] = None
) -> models.UserSession:
    """创建用户会话

    Args:
        db: 数据库会话
        user: 用户对象
        refresh_token_id: 刷新令牌ID
        request: FastAPI请求对象

    Returns:
        UserSession: 创建的会话对象
    """
    session_id = security.create_session_id()
    expires_at = datetime.utcnow() + timedelta(days=settings.SESSION_EXPIRE_DAYS)

    # 从请求中提取信息
    ip_address = None
    user_agent = None
    device_info = {}

    if request:
        # 获取IP地址（考虑代理）
        ip_address = request.client.host if request.client else None
        if "x-forwarded-for" in request.headers:
            ip_address = request.headers["x-forwarded-for"].split(",")[0].strip()
        elif "x-real-ip" in request.headers:
            ip_address = request.headers["x-real-ip"]

        # 获取User-Agent
        user_agent = request.headers.get("user-agent")

        # 构建设备信息
        device_info = {
            "user_agent": user_agent,
            "ip": ip_address,
        }

    session = models.UserSession(
        user_id=user.id,
        session_id=session_id,
        refresh_token_id=refresh_token_id,
        ip_address=ip_address,
        user_agent=user_agent,
        device_info=json.dumps(device_info) if device_info else None,
        is_active=True,
        expires_at=expires_at,
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    logger.info(f"Created session {session_id} for user {user.username} from IP {ip_address}")

    return session


def authenticate_user_with_tokens(
    db: Session,
    username: str,
    password: str,
    request: Optional[Request] = None
) -> Tuple[models.User, str, str]:
    """用户认证并生成访问令牌和刷新令牌

    Args:
        db: 数据库会话
        username: 用户名
        password: 密码
        request: FastAPI请求对象

    Returns:
        Tuple[User, str, str]: (用户对象, 访问令牌, 刷新令牌)

    Raises:
        ValueError: 认证失败
    """
    # 验证用户
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.verify_password(password):
        raise ValueError("用户名或密码错误")

    if not user.is_active:
        raise ValueError("用户账号已被禁用")

    # 更新最后登录时间
    user.last_login = datetime.utcnow()
    db.commit()

    # 创建访问令牌
    access_token = security.create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )

    # 创建刷新令牌
    refresh_token, refresh_expires_at = security.create_refresh_token(user.id)

    # 保存刷新令牌到数据库
    refresh_token_obj = models.RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=refresh_expires_at,
        is_revoked=False,
    )
    db.add(refresh_token_obj)
    db.commit()
    db.refresh(refresh_token_obj)

    # 创建会话
    create_user_session(db, user, refresh_token_obj.id, request)

    logger.info(f"User {username} authenticated successfully")

    return user, access_token, refresh_token


def refresh_access_token(db: Session, refresh_token: str) -> Tuple[str, models.User]:
    """使用刷新令牌获取新的访问令牌

    Args:
        db: 数据库会话
        refresh_token: 刷新令牌

    Returns:
        Tuple[str, User]: (新访问令牌, 用户对象)

    Raises:
        ValueError: 刷新令牌无效
    """
    # 查询刷新令牌
    token_obj = db.query(models.RefreshToken).filter(
        models.RefreshToken.token == refresh_token
    ).first()

    if not token_obj:
        raise ValueError("刷新令牌无效")

    # 检查是否已撤销
    if token_obj.is_revoked:
        raise ValueError("刷新令牌已被撤销")

    # 检查是否过期
    if token_obj.expires_at < datetime.utcnow():
        raise ValueError("刷新令牌已过期")

    # 获取用户
    user = db.query(models.User).filter(models.User.id == token_obj.user_id).first()
    if not user:
        raise ValueError("用户不存在")

    if not user.is_active:
        raise ValueError("用户账号已被禁用")

    # 创建新的访问令牌
    access_token = security.create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )

    # 更新会话最后活动时间
    session = db.query(models.UserSession).filter(
        models.UserSession.refresh_token_id == token_obj.id,
        models.UserSession.is_active == True
    ).first()

    if session:
        session.last_activity = datetime.utcnow()
        db.commit()

    logger.info(f"Refreshed access token for user {user.username}")

    return access_token, user


def revoke_refresh_token(db: Session, refresh_token: str) -> None:
    """撤销刷新令牌

    Args:
        db: 数据库会话
        refresh_token: 刷新令牌

    Raises:
        ValueError: 刷新令牌无效
    """
    token_obj = db.query(models.RefreshToken).filter(
        models.RefreshToken.token == refresh_token
    ).first()

    if not token_obj:
        raise ValueError("刷新令牌无效")

    token_obj.is_revoked = True
    token_obj.revoked_at = datetime.utcnow()

    # 同时停用相关会话
    db.query(models.UserSession).filter(
        models.UserSession.refresh_token_id == token_obj.id
    ).update({"is_active": False})

    db.commit()

    logger.info(f"Revoked refresh token for user_id {token_obj.user_id}")


def get_user_active_sessions(db: Session, user_id: int) -> List[models.UserSession]:
    """获取用户的活跃会话列表

    Args:
        db: 数据库会话
        user_id: 用户ID

    Returns:
        List[UserSession]: 活跃会话列表
    """
    return db.query(models.UserSession).filter(
        models.UserSession.user_id == user_id,
        models.UserSession.is_active == True,
        models.UserSession.expires_at > datetime.utcnow()
    ).order_by(models.UserSession.last_activity.desc()).all()


def revoke_user_sessions(
    db: Session,
    user_id: int,
    session_ids: Optional[List[str]] = None
) -> int:
    """撤销用户会话

    Args:
        db: 数据库会话
        user_id: 用户ID
        session_ids: 要撤销的会话ID列表（为None时撤销所有会话）

    Returns:
        int: 撤销的会话数量
    """
    query = db.query(models.UserSession).filter(
        models.UserSession.user_id == user_id,
        models.UserSession.is_active == True
    )

    if session_ids:
        query = query.filter(models.UserSession.session_id.in_(session_ids))

    count = query.count()
    query.update({"is_active": False}, synchronize_session=False)

    # 同时撤销相关的刷新令牌
    if session_ids:
        sessions = db.query(models.UserSession).filter(
            models.UserSession.user_id == user_id,
            models.UserSession.session_id.in_(session_ids)
        ).all()

        refresh_token_ids = [s.refresh_token_id for s in sessions if s.refresh_token_id]
        if refresh_token_ids:
            db.query(models.RefreshToken).filter(
                models.RefreshToken.id.in_(refresh_token_ids)
            ).update({
                "is_revoked": True,
                "revoked_at": datetime.utcnow()
            }, synchronize_session=False)

    db.commit()

    logger.info(f"Revoked {count} sessions for user_id {user_id}")

    return count


def create_api_key(
    db: Session,
    user_id: int,
    name: str,
    scopes: Optional[List[str]] = None,
    expires_at: Optional[datetime] = None
) -> Tuple[models.APIKey, str]:
    """创建API密钥

    Args:
        db: 数据库会话
        user_id: 用户ID
        name: 密钥名称
        scopes: 权限范围
        expires_at: 过期时间

    Returns:
        Tuple[APIKey, str]: (API密钥对象, 完整密钥)
    """
    # 生成API密钥
    api_key, key_prefix, key_hash = security.create_api_key()

    # 创建API密钥对象
    api_key_obj = models.APIKey(
        user_id=user_id,
        name=name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=json.dumps(scopes) if scopes else None,
        is_active=True,
        expires_at=expires_at,
    )

    db.add(api_key_obj)
    db.commit()
    db.refresh(api_key_obj)

    logger.info(f"Created API key '{name}' for user_id {user_id}")

    return api_key_obj, api_key


def verify_api_key(db: Session, api_key: str) -> Optional[models.User]:
    """验证API密钥并返回关联的用户

    Args:
        db: 数据库会话
        api_key: API密钥

    Returns:
        Optional[User]: 用户对象，如果验证失败则返回None
    """
    # 计算密钥哈希
    key_hash = security.verify_api_key.__wrapped__.__code__.co_consts[1]  # 获取哈希算法
    import hashlib
    computed_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # 查询API密钥
    api_key_obj = db.query(models.APIKey).filter(
        models.APIKey.key_hash == computed_hash,
        models.APIKey.is_active == True
    ).first()

    if not api_key_obj:
        return None

    # 检查是否过期
    if api_key_obj.expires_at and api_key_obj.expires_at < datetime.utcnow():
        return None

    # 更新最后使用时间
    api_key_obj.last_used = datetime.utcnow()
    db.commit()

    # 获取用户
    user = db.query(models.User).filter(
        models.User.id == api_key_obj.user_id,
        models.User.is_active == True
    ).first()

    if user:
        logger.info(f"API key authenticated for user {user.username}")

    return user


def revoke_api_key(db: Session, user_id: int, api_key_id: int) -> bool:
    """撤销API密钥

    Args:
        db: 数据库会话
        user_id: 用户ID
        api_key_id: API密钥ID

    Returns:
        bool: 是否成功撤销
    """
    api_key = db.query(models.APIKey).filter(
        models.APIKey.id == api_key_id,
        models.APIKey.user_id == user_id
    ).first()

    if not api_key:
        return False

    api_key.is_active = False
    db.commit()

    logger.info(f"Revoked API key {api_key_id} for user_id {user_id}")

    return True


def get_user_api_keys(db: Session, user_id: int) -> List[models.APIKey]:
    """获取用户的API密钥列表

    Args:
        db: 数据库会话
        user_id: 用户ID

    Returns:
        List[APIKey]: API密钥列表
    """
    return db.query(models.APIKey).filter(
        models.APIKey.user_id == user_id
    ).order_by(models.APIKey.created_at.desc()).all()


def clean_expired_tokens(db: Session) -> Tuple[int, int]:
    """清理过期的令牌和会话

    Args:
        db: 数据库会话

    Returns:
        Tuple[int, int]: (清理的令牌数, 清理的会话数)
    """
    now = datetime.utcnow()

    # 清理过期的刷新令牌
    expired_tokens = db.query(models.RefreshToken).filter(
        models.RefreshToken.expires_at < now,
        models.RefreshToken.is_revoked == False
    ).count()

    db.query(models.RefreshToken).filter(
        models.RefreshToken.expires_at < now,
        models.RefreshToken.is_revoked == False
    ).update({
        "is_revoked": True,
        "revoked_at": now
    }, synchronize_session=False)

    # 清理过期的会话
    expired_sessions = db.query(models.UserSession).filter(
        models.UserSession.expires_at < now,
        models.UserSession.is_active == True
    ).count()

    db.query(models.UserSession).filter(
        models.UserSession.expires_at < now,
        models.UserSession.is_active == True
    ).update({"is_active": False}, synchronize_session=False)

    db.commit()

    logger.info(f"Cleaned {expired_tokens} expired tokens and {expired_sessions} expired sessions")

    return expired_tokens, expired_sessions
