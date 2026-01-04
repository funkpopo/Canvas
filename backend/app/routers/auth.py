from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List

from .. import database, models
from ..auth import get_current_user
from ..schemas import (
    Token, LoginRequest, RefreshTokenRequest, UserRegister, UserResponse,
    UserSessionResponse, UserSessionListResponse, SessionRevokeRequest,
    APIKeyCreate, APIKeyResponse, APIKeyCreateResponse, APIKeyListResponse
)
from ..services import auth_service
from ..core.config import settings

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    register_data: UserRegister,
    db: Session = Depends(database.get_db),
):
    """用户注册（默认创建为 viewer，只读；管理员可在用户中心调整权限）"""
    username = (register_data.username or "").strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名不能为空")

    if username.lower() == "admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名 admin 已被保留")

    existing_user = db.query(models.User).filter(models.User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    if register_data.email:
        existing_email = db.query(models.User).filter(models.User.email == register_data.email).first()
        if existing_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱已被使用")

    hashed_password = models.User.get_password_hash(register_data.password)
    new_user = models.User(
        username=username,
        email=register_data.email,
        hashed_password=hashed_password,
        role="viewer",
        is_active=True,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    request: Request,
    db: Session = Depends(database.get_db)
):
    """用户登录，返回访问令牌和刷新令牌"""
    try:
        user, access_token, refresh_token = auth_service.authenticate_user_with_tokens(
            db, login_data.username, login_data.password, request
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/token", response_model=Token)
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db)
):
    """OAuth2标准登录接口"""
    try:
        user, access_token, refresh_token = auth_service.authenticate_user_with_tokens(
            db, form_data.username, form_data.password, request
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(database.get_db)
):
    """使用刷新令牌获取新的访问令牌"""
    try:
        access_token, user = auth_service.refresh_access_token(db, refresh_data.refresh_token)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/logout")
async def logout(
    refresh_data: RefreshTokenRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """用户登出，撤销刷新令牌"""
    try:
        auth_service.revoke_refresh_token(db, refresh_data.refresh_token)
        return {"message": "登出成功"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/me")
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    """获取当前用户信息"""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active
    }


@router.post("/verify-token")
async def verify_token_endpoint(current_user: models.User = Depends(get_current_user)):
    """验证token是否有效"""
    return {
        "valid": True,
        "username": current_user.username,
        "id": current_user.id,
        "role": current_user.role,
        "email": current_user.email,
        "is_active": current_user.is_active
    }


# ========== 会话管理 ==========

@router.get("/sessions", response_model=UserSessionListResponse)
async def get_sessions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """获取当前用户的活跃会话列表"""
    sessions = auth_service.get_user_active_sessions(db, current_user.id)
    return {
        "total": len(sessions),
        "sessions": sessions
    }


@router.post("/sessions/revoke")
async def revoke_sessions(
    revoke_data: SessionRevokeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """撤销指定的会话"""
    count = auth_service.revoke_user_sessions(db, current_user.id, revoke_data.session_ids)
    return {
        "message": f"成功撤销 {count} 个会话",
        "revoked_count": count
    }


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """撤销当前用户的所有会话（除当前会话外）"""
    count = auth_service.revoke_user_sessions(db, current_user.id)
    return {
        "message": f"成功撤销 {count} 个会话",
        "revoked_count": count
    }


# ========== API密钥管理 ==========

@router.post("/api-keys", response_model=APIKeyCreateResponse)
async def create_api_key(
    key_data: APIKeyCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """创建API密钥"""
    api_key_obj, api_key = auth_service.create_api_key(
        db,
        current_user.id,
        key_data.name,
        key_data.scopes,
        key_data.expires_at
    )

    return {
        "id": api_key_obj.id,
        "name": api_key_obj.name,
        "api_key": api_key,  # 完整密钥仅在创建时返回
        "key_prefix": api_key_obj.key_prefix,
        "scopes": api_key_obj.scopes,
        "expires_at": api_key_obj.expires_at,
        "created_at": api_key_obj.created_at
    }


@router.get("/api-keys", response_model=APIKeyListResponse)
async def list_api_keys(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """获取当前用户的API密钥列表"""
    keys = auth_service.get_user_api_keys(db, current_user.id)
    return {
        "total": len(keys),
        "keys": keys
    }


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """撤销API密钥"""
    success = auth_service.revoke_api_key(db, current_user.id, key_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API密钥不存在"
        )

    return {"message": "API密钥已撤销"}