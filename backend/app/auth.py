from datetime import datetime, timedelta
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .database import get_db
from . import models
from .schemas import TokenData

# JWT配置
SECRET_KEY = "your-secret-key-here-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24小时


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str, credentials_exception):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
        return token_data
    except JWTError:
        raise credentials_exception


def authenticate_user(db: Session, username: str, password: str):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        return False
    if not user.verify_password(password):
        return False
    return user


security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(credentials.credentials, credentials_exception)
    user = db.query(models.User).filter(models.User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_user_ws(token: str, db: Session):
    """
    WebSocket认证函数
    直接接收token字符串而不是HTTPAuthorizationCredentials
    """
    credentials_exception = Exception("Could not validate WebSocket credentials")

    try:
        token_data = verify_token(token, credentials_exception)
        user = db.query(models.User).filter(models.User.username == token_data.username).first()
        if user is None:
            raise credentials_exception
        return user
    except Exception:
        raise credentials_exception


# ========== 权限验证 ==========

def require_role(allowed_roles: list):
    """
    权限验证装饰器工厂函数
    :param allowed_roles: 允许的角色列表，如['admin'], ['admin', 'user']
    """
    def role_checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要以下角色之一: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker


def require_admin(current_user: models.User = Depends(get_current_user)):
    """
    要求管理员权限
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user


def require_user_or_admin(current_user: models.User = Depends(get_current_user)):
    """
    要求用户或管理员权限（user, admin）
    """
    if current_user.role not in ["user", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要用户或管理员权限"
        )
    return current_user


def require_viewer_or_above(current_user: models.User = Depends(get_current_user)):
    """
    要求查看者及以上权限（viewer, user, admin）
    所有已登录用户都可以
    """
    if current_user.role not in ["viewer", "user", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要有效的用户权限"
        )
    return current_user