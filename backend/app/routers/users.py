from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional
from datetime import datetime
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, require_user_management, require_read_only
from ..audit import log_user_action

router = APIRouter()


def require_admin(current_user: models.User = Depends(get_current_user)):
    """要求管理员权限"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user


@router.get("/", response_model=schemas.UserListResponse)
async def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user_management)
):
    """获取用户列表（需要管理员权限）"""
    query = db.query(models.User)
    
    if search:
        query = query.filter(
            or_(
                models.User.username.contains(search),
                models.User.email.contains(search)
            )
        )
    
    if role:
        query = query.filter(models.User.role == role)
    
    if is_active is not None:
        query = query.filter(models.User.is_active == is_active)
    
    total = query.count()
    users = query.order_by(models.User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return {"total": total, "users": users}


@router.get("/{user_id}", response_model=schemas.UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user_management)
):
    """获取用户详情（需要管理员权限）"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return user


@router.post("/", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: schemas.UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user_management)
):
    """创建新用户（需要管理员权限）"""
    existing_user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    if user_data.email:
        existing_email = db.query(models.User).filter(models.User.email == user_data.email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
    
    hashed_password = models.User.get_password_hash(user_data.password)
    new_user = models.User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_user_action(
        db=db,
        user_id=current_user.id,
        action="create",
        target_user_id=new_user.id,
        details={"username": new_user.username, "role": new_user.role, "email": new_user.email},
        request=request
    )
    
    return new_user


@router.put("/{user_id}", response_model=schemas.UserResponse)
async def update_user(
    user_id: int,
    user_data: schemas.UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user_management)
):
    """更新用户信息（需要管理员权限）"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    if user.role == "admin" and user_data.role and user_data.role != "admin":
        admin_count = db.query(func.count(models.User.id)).filter(
            models.User.role == "admin",
            models.User.is_active == True
        ).scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能修改最后一个管理员的角色"
            )
    
    if user_data.email and user_data.email != user.email:
        existing_email = db.query(models.User).filter(
            models.User.email == user_data.email,
            models.User.id != user_id
        ).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
    
    changes = {}
    if user_data.email is not None and user_data.email != user.email:
        changes["email"] = {"old": user.email, "new": user_data.email}
        user.email = user_data.email
    if user_data.role is not None and user_data.role != user.role:
        changes["role"] = {"old": user.role, "new": user_data.role}
        user.role = user_data.role
    if user_data.is_active is not None and user_data.is_active != user.is_active:
        changes["is_active"] = {"old": user.is_active, "new": user_data.is_active}
        user.is_active = user_data.is_active
    if user_data.password is not None:
        changes["password"] = "changed"
        user.hashed_password = models.User.get_password_hash(user_data.password)
    
    user.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(user)
    
    log_user_action(
        db=db,
        user_id=current_user.id,
        action="update",
        target_user_id=user.id,
        details={"username": user.username, "changes": changes},
        request=request
    )
    
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user_management)
):
    """删除用户（需要管理员权限）"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己"
        )
    
    if user.role == "admin":
        admin_count = db.query(func.count(models.User.id)).filter(
            models.User.role == "admin",
            models.User.is_active == True
        ).scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能删除最后一个管理员"
            )
    
    username = user.username
    user_role = user.role
    
    db.delete(user)
    db.commit()
    
    log_user_action(
        db=db,
        user_id=current_user.id,
        action="delete",
        target_user_id=user_id,
        details={"username": username, "role": user_role},
        request=request
    )
    
    return None


@router.put("/{user_id}/password", status_code=status.HTTP_200_OK)
async def change_password(
    user_id: int,
    password_data: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """修改用户密码"""
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权修改其他用户的密码"
        )
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    if current_user.role != "admin" or current_user.id == user_id:
        if not user.verify_password(password_data.current_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前密码错误"
            )
    
    user.hashed_password = models.User.get_password_hash(password_data.new_password)
    user.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {"message": "密码修改成功"} 