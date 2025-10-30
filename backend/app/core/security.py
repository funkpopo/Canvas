"""
Security utilities for Canvas application.
集中管理安全相关功能：密码哈希、JWT令牌等
"""
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from .config import settings


# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码

    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码

    Returns:
        bool: 密码是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """生成密码哈希

    Args:
        password: 明文密码

    Returns:
        str: 哈希后的密码
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建JWT访问令牌

    Args:
        data: 要编码到令牌中的数据
        expires_delta: 过期时间增量

    Returns:
        str: JWT令牌
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """验证JWT令牌

    Args:
        token: JWT令牌

    Returns:
        Optional[dict]: 令牌中的数据，如果验证失败则返回None
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def decode_token(token: str) -> Optional[dict]:
    """解码JWT令牌（不验证签名）

    Args:
        token: JWT令牌

    Returns:
        Optional[dict]: 令牌中的数据
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_signature": False},
        )
        return payload
    except JWTError:
        return None


def validate_password_strength(password: str) -> tuple[bool, str]:
    """验证密码强度

    Args:
        password: 密码

    Returns:
        tuple[bool, str]: (是否有效, 错误消息)
    """
    if len(password) < 8:
        return False, "密码长度至少为8个字符"

    if not any(c.isupper() for c in password):
        return False, "密码必须包含至少一个大写字母"

    if not any(c.islower() for c in password):
        return False, "密码必须包含至少一个小写字母"

    if not any(c.isdigit() for c in password):
        return False, "密码必须包含至少一个数字"

    # 可选：检查特殊字符
    # special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>?"
    # if not any(c in special_chars for c in password):
    #     return False, "密码必须包含至少一个特殊字符"

    return True, ""


def mask_sensitive_data(data: str, visible_chars: int = 4) -> str:
    """脱敏敏感数据

    Args:
        data: 敏感数据
        visible_chars: 可见字符数量

    Returns:
        str: 脱敏后的数据
    """
    if not data or len(data) <= visible_chars:
        return "****"

    return data[:visible_chars] + "*" * (len(data) - visible_chars)
