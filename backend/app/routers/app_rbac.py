"""
应用层RBAC权限管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import database, models
from ..auth import get_current_user, require_admin
from ..schemas import (
    PermissionCreate, PermissionResponse,
    RoleCreate, RoleUpdate, RoleResponse, RoleWithPermissionsResponse, RoleListResponse,
    UserRoleAssignment
)
from ..services import rbac_service

router = APIRouter()


# ========== 权限管理 ==========

@router.get("/app-permissions", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """获取所有应用权限列表（仅管理员）"""
    permissions = rbac_service.get_all_permissions(db)
    return permissions


@router.post("/app-permissions", response_model=PermissionResponse)
async def create_permission(
    permission_data: PermissionCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """创建应用权限（仅管理员）"""
    permission = rbac_service.create_permission(
        db,
        permission_data.name,
        permission_data.resource,
        permission_data.action,
        permission_data.description
    )
    return permission


# ========== 角色管理 ==========

@router.get("/app-roles", response_model=RoleListResponse)
async def list_app_roles(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """获取所有应用角色列表"""
    roles = rbac_service.get_all_roles(db)
    return {
        "total": len(roles),
        "roles": roles
    }


@router.get("/app-roles/{role_id}", response_model=RoleWithPermissionsResponse)
async def get_app_role(
    role_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """获取应用角色详情（包含权限列表）"""
    role = rbac_service.get_role_by_id(db, role_id)

    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )

    permissions = rbac_service.get_role_permissions(db, role_id)

    return {
        **role.__dict__,
        "permissions": permissions
    }


@router.post("/app-roles", response_model=RoleResponse)
async def create_app_role(
    role_data: RoleCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """创建应用角色（仅管理员）"""
    # 检查角色名是否已存在
    existing = rbac_service.get_role_by_name(db, role_data.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="角色名已存在"
        )

    role = rbac_service.create_role(
        db,
        role_data.name,
        role_data.display_name,
        role_data.description,
        role_data.permission_ids
    )

    return role


@router.put("/app-roles/{role_id}", response_model=RoleResponse)
async def update_app_role(
    role_id: int,
    role_data: RoleUpdate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """更新应用角色（仅管理员）"""
    try:
        role = rbac_service.update_role(
            db,
            role_id,
            role_data.display_name,
            role_data.description,
            role_data.permission_ids
        )

        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="角色不存在"
            )

        return role
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/app-roles/{role_id}")
async def delete_app_role(
    role_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """删除应用角色（仅管理员）"""
    try:
        success = rbac_service.delete_role(db, role_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="角色不存在"
            )

        return {"message": "角色已删除"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# ========== 用户角色管理 ==========

@router.get("/users/{user_id}/app-roles", response_model=List[RoleResponse])
async def get_user_app_roles(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """获取用户的应用角色列表（仅管理员）"""
    # 检查用户是否存在
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    roles = rbac_service.get_user_roles(db, user_id)
    return roles


@router.post("/users/{user_id}/app-roles")
async def assign_user_app_roles(
    user_id: int,
    role_assignment: UserRoleAssignment,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """为用户分配应用角色（仅管理员）"""
    # 检查用户是否存在
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 检查角色是否都存在
    for role_id in role_assignment.role_ids:
        role = rbac_service.get_role_by_id(db, role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"角色ID {role_id} 不存在"
            )

    rbac_service.assign_roles_to_user(db, user_id, role_assignment.role_ids)

    return {"message": f"成功为用户分配 {len(role_assignment.role_ids)} 个角色"}


@router.get("/users/{user_id}/app-permissions", response_model=List[PermissionResponse])
async def get_user_app_permissions(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """获取用户的所有应用权限（仅管理员）"""
    # 检查用户是否存在
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    permissions = rbac_service.get_user_permissions(db, user_id)
    return permissions


@router.get("/my-app-roles", response_model=List[RoleResponse])
async def get_my_app_roles(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """获取当前用户的应用角色列表"""
    roles = rbac_service.get_user_roles(db, current_user.id)
    return roles


@router.get("/my-app-permissions", response_model=List[PermissionResponse])
async def get_my_app_permissions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """获取当前用户的所有应用权限"""
    permissions = rbac_service.get_user_permissions(db, current_user.id)
    return permissions


# ========== 初始化接口 ==========

@router.post("/initialize-app-rbac")
async def initialize_app_rbac(
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    """初始化默认应用权限和角色（仅管理员）"""
    rbac_service.initialize_default_permissions(db)
    rbac_service.initialize_default_roles(db)

    return {"message": "应用RBAC权限系统初始化成功"}
