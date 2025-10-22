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


# ========== 精确权限控制 ==========

def require_read_only(current_user: models.User = Depends(get_current_user)):
    """
    只读权限检查 - 所有用户都可以查看
    """
    return current_user


def require_no_viewer(current_user: models.User = Depends(get_current_user)):
    """
    禁止viewer角色 - user和admin可以操作
    """
    if current_user.role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只读用户无权执行此操作"
        )
    return current_user


def require_admin_only(current_user: models.User = Depends(get_current_user)):
    """
    仅管理员权限
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user


def require_user_or_admin(current_user: models.User = Depends(get_current_user)):
    """
    用户或管理员权限（不包括viewer）
    """
    if current_user.role not in ["user", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要用户或管理员权限"
        )
    return current_user


# ========== 资源特定权限控制 ==========

def require_cluster_management(current_user: models.User = Depends(get_current_user)):
    """
    要求集群管理权限 - 只有admin可以管理集群
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以管理集群"
        )
    return current_user


def require_user_management(current_user: models.User = Depends(get_current_user)):
    """
    要求用户管理权限 - 只有admin可以管理用户
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以管理用户"
        )
    return current_user


def require_configmap_management(current_user: models.User = Depends(get_current_user)):
    """
    要求ConfigMap管理权限 - viewer不能管理，user不能管理
    """
    if current_user.role in ["viewer", "user"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权管理ConfigMap"
        )
    return current_user


def require_resource_quota_management(current_user: models.User = Depends(get_current_user)):
    """
    要求资源配额管理权限 - viewer不能管理，user不能管理
    """
    if current_user.role in ["viewer", "user"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权管理资源配额"
        )
    return current_user


def require_rbac_management(current_user: models.User = Depends(get_current_user)):
    """
    要求RBAC管理权限 - viewer不能管理，user不能管理
    """
    if current_user.role in ["viewer", "user"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权管理RBAC权限"
        )
    return current_user


def require_resource_management(current_user: models.User = Depends(get_current_user)):
    """
    要求资源管理权限 - viewer只能查看不能修改
    """
    if current_user.role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只读用户无权修改资源"
        )
    return current_user


# ========== 资源级权限检查 ==========

def check_cluster_access(db: Session, user: models.User, cluster_id: int, required_level: str = "read") -> bool:
    """
    检查用户是否有指定集群的访问权限

    :param db: 数据库会话
    :param user: 用户对象
    :param cluster_id: 集群ID
    :param required_level: 需要的权限等级 ('read' 或 'manage')
    :return: 是否有权限
    """
    # admin用户拥有所有权限
    if user.role == "admin":
        return True

    # viewer用户只能查看，不能管理
    if user.role == "viewer":
        return required_level == "read"

    # 检查是否有该集群的权限
    permission = db.query(models.UserClusterPermission).filter(
        models.UserClusterPermission.user_id == user.id,
        models.UserClusterPermission.cluster_id == cluster_id
    ).first()

    if permission:
        # 检查权限等级
        if required_level == "read":
            return permission.permission_level in ["read", "manage"]
        elif required_level == "manage":
            return permission.permission_level == "manage"

    # 如果没有明确权限，普通用户默认可以访问，viewer用户只能查看
    # 这里返回False让调用方处理默认行为
    return False


def check_namespace_access(db: Session, user: models.User, cluster_id: int, namespace: str, required_level: str = "read") -> bool:
    """
    检查用户是否有指定namespace的访问权限

    :param db: 数据库会话
    :param user: 用户对象
    :param cluster_id: 集群ID
    :param namespace: namespace名称
    :param required_level: 需要的权限等级 ('read' 或 'manage')
    :return: 是否有权限
    """
    # admin用户拥有所有权限
    if user.role == "admin":
        return True

    # viewer用户只能查看，不能管理
    if user.role == "viewer":
        return required_level == "read"

    # 首先检查是否有该namespace的直接权限
    permission = db.query(models.UserNamespacePermission).filter(
        models.UserNamespacePermission.user_id == user.id,
        models.UserNamespacePermission.cluster_id == cluster_id,
        models.UserNamespacePermission.namespace == namespace
    ).first()

    if permission:
        # 检查权限等级
        if required_level == "read":
            return permission.permission_level in ["read", "manage"]
        elif required_level == "manage":
            return permission.permission_level == "manage"

    # 如果没有直接权限，检查是否有该集群的权限
    cluster_access = check_cluster_access(db, user, cluster_id, required_level)
    if cluster_access:
        return True

    # 如果没有明确权限，普通用户默认可以访问，viewer用户只能查看
    # 这里返回False让调用方处理默认行为
    return False


def require_cluster_access(required_level: str = "read"):
    """
    要求集群访问权限的装饰器工厂
    集群ID将从查询参数中提取

    :param required_level: 需要的权限等级 ('read' 或 'manage')
    """
    def cluster_access_checker(
        cluster_id: int,
        current_user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        access_granted = check_cluster_access(db, current_user, cluster_id, required_level)
        if not access_granted:
            # 如果没有明确权限，根据角色决定默认行为
            if current_user.role == "admin":
                # admin总是允许
                return current_user
            elif current_user.role == "viewer":
                # viewer只允许查看
                if required_level == "read":
                    return current_user
                else:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"只读用户无权执行此操作"
                    )
            elif current_user.role == "user":
                # 普通用户默认允许
                return current_user
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"需要集群 {required_level} 权限"
                )
        return current_user
    return cluster_access_checker


def require_namespace_access(required_level: str = "read"):
    """
    要求namespace访问权限的装饰器工厂
    集群ID和namespace将从参数中提取

    :param required_level: 需要的权限等级 ('read' 或 'manage')
    """
    def namespace_access_checker(
        cluster_id: int,
        namespace: str,
        current_user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        access_granted = check_namespace_access(db, current_user, cluster_id, namespace, required_level)
        if not access_granted:
            # 如果没有明确权限，根据角色决定默认行为
            if current_user.role == "admin":
                # admin总是允许
                return current_user
            elif current_user.role == "viewer":
                # viewer只允许查看
                if required_level == "read":
                    return current_user
                else:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"只读用户无权执行此操作"
                    )
            elif current_user.role == "user":
                # 普通用户默认允许
                return current_user
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"需要命名空间 {namespace} 的 {required_level} 权限"
                )
        return current_user
    return namespace_access_checker