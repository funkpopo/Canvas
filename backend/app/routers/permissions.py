from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List
from .. import models, schemas
from ..database import get_db
from ..auth import require_admin
from ..audit import log_user_action

router = APIRouter()


@router.get("/users/{user_id}", response_model=schemas.UserPermissionsResponse)
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """获取用户的所有权限（需要管理员权限）"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 获取集群权限
    cluster_permissions = db.query(models.UserClusterPermission).options(
        joinedload(models.UserClusterPermission.cluster)
    ).filter(models.UserClusterPermission.user_id == user_id).all()

    # 获取namespace权限
    namespace_permissions = db.query(models.UserNamespacePermission).options(
        joinedload(models.UserNamespacePermission.cluster)
    ).filter(models.UserNamespacePermission.user_id == user_id).all()

    # 构建响应
    cluster_perms = []
    for perm in cluster_permissions:
        cluster_perms.append(schemas.ClusterPermissionResponse(
            id=perm.id,
            user_id=perm.user_id,
            cluster_id=perm.cluster_id,
            permission_level=perm.permission_level,
            cluster_name=perm.cluster.name if perm.cluster else None,
            created_at=perm.created_at,
            updated_at=perm.updated_at
        ))

    namespace_perms = []
    for perm in namespace_permissions:
        namespace_perms.append(schemas.NamespacePermissionResponse(
            id=perm.id,
            user_id=perm.user_id,
            cluster_id=perm.cluster_id,
            namespace=perm.namespace,
            permission_level=perm.permission_level,
            cluster_name=perm.cluster.name if perm.cluster else None,
            created_at=perm.created_at,
            updated_at=perm.updated_at
        ))

    return schemas.UserPermissionsResponse(
        user_id=user.id,
        username=user.username,
        role=user.role,
        cluster_permissions=cluster_perms,
        namespace_permissions=namespace_perms
    )


@router.post("/users/{user_id}/clusters", response_model=schemas.ClusterPermissionResponse, status_code=status.HTTP_201_CREATED)
def grant_cluster_permission(
    user_id: int,
    permission_data: schemas.ClusterPermissionGrantRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """授予用户集群权限（需要管理员权限）"""
    # 检查用户是否存在
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 检查集群是否存在
    cluster = db.query(models.Cluster).filter(models.Cluster.id == permission_data.cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="集群不存在"
        )

    # 检查是否已存在权限
    existing_permission = db.query(models.UserClusterPermission).filter(
        and_(
            models.UserClusterPermission.user_id == user_id,
            models.UserClusterPermission.cluster_id == permission_data.cluster_id
        )
    ).first()

    if existing_permission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户已拥有该集群的权限"
        )

    # 创建权限
    new_permission = models.UserClusterPermission(
        user_id=user_id,
        cluster_id=permission_data.cluster_id,
        permission_level=permission_data.permission_level
    )

    db.add(new_permission)
    db.commit()
    db.refresh(new_permission)

    # 重新查询以获取关联的集群信息
    permission_with_cluster = db.query(models.UserClusterPermission).options(
        joinedload(models.UserClusterPermission.cluster)
    ).filter(models.UserClusterPermission.id == new_permission.id).first()

    log_user_action(
        db=db,
        user_id=current_user.id,
        action="grant_cluster_permission",
        target_user_id=user_id,
        details={
            "cluster_id": permission_data.cluster_id,
            "cluster_name": cluster.name,
            "permission_level": permission_data.permission_level
        },
        request=request
    )

    return schemas.ClusterPermissionResponse(
        id=permission_with_cluster.id,
        user_id=permission_with_cluster.user_id,
        cluster_id=permission_with_cluster.cluster_id,
        permission_level=permission_with_cluster.permission_level,
        cluster_name=permission_with_cluster.cluster.name,
        created_at=permission_with_cluster.created_at,
        updated_at=permission_with_cluster.updated_at
    )


@router.post("/users/{user_id}/namespaces", response_model=schemas.NamespacePermissionResponse, status_code=status.HTTP_201_CREATED)
def grant_namespace_permission(
    user_id: int,
    permission_data: schemas.NamespacePermissionGrantRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """授予用户namespace权限（需要管理员权限）"""
    # 检查用户是否存在
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 检查集群是否存在
    cluster = db.query(models.Cluster).filter(models.Cluster.id == permission_data.cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="集群不存在"
        )

    # 检查是否已存在权限
    existing_permission = db.query(models.UserNamespacePermission).filter(
        and_(
            models.UserNamespacePermission.user_id == user_id,
            models.UserNamespacePermission.cluster_id == permission_data.cluster_id,
            models.UserNamespacePermission.namespace == permission_data.namespace
        )
    ).first()

    if existing_permission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户已拥有该namespace的权限"
        )

    # 创建权限
    new_permission = models.UserNamespacePermission(
        user_id=user_id,
        cluster_id=permission_data.cluster_id,
        namespace=permission_data.namespace,
        permission_level=permission_data.permission_level
    )

    db.add(new_permission)
    db.commit()
    db.refresh(new_permission)

    # 重新查询以获取关联的集群信息
    permission_with_cluster = db.query(models.UserNamespacePermission).options(
        joinedload(models.UserNamespacePermission.cluster)
    ).filter(models.UserNamespacePermission.id == new_permission.id).first()

    log_user_action(
        db=db,
        user_id=current_user.id,
        action="grant_namespace_permission",
        target_user_id=user_id,
        details={
            "cluster_id": permission_data.cluster_id,
            "cluster_name": cluster.name,
            "namespace": permission_data.namespace,
            "permission_level": permission_data.permission_level
        },
        request=request
    )

    return schemas.NamespacePermissionResponse(
        id=permission_with_cluster.id,
        user_id=permission_with_cluster.user_id,
        cluster_id=permission_with_cluster.cluster_id,
        namespace=permission_with_cluster.namespace,
        permission_level=permission_with_cluster.permission_level,
        cluster_name=permission_with_cluster.cluster.name,
        created_at=permission_with_cluster.created_at,
        updated_at=permission_with_cluster.updated_at
    )


@router.put("/clusters/{permission_id}", response_model=schemas.ClusterPermissionResponse)
def update_cluster_permission(
    permission_id: int,
    permission_data: schemas.PermissionUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """更新集群权限等级（需要管理员权限）"""
    permission = db.query(models.UserClusterPermission).options(
        joinedload(models.UserClusterPermission.cluster),
        joinedload(models.UserClusterPermission.user)
    ).filter(models.UserClusterPermission.id == permission_id).first()

    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )

    old_level = permission.permission_level
    permission.permission_level = permission_data.permission_level
    permission.updated_at = None  # 触发自动更新

    db.commit()
    db.refresh(permission)

    log_user_action(
        db=db,
        user_id=current_user.id,
        action="update_cluster_permission",
        target_user_id=permission.user_id,
        details={
            "permission_id": permission_id,
            "cluster_id": permission.cluster_id,
            "cluster_name": permission.cluster.name,
            "old_level": old_level,
            "new_level": permission_data.permission_level
        },
        request=request
    )

    return schemas.ClusterPermissionResponse(
        id=permission.id,
        user_id=permission.user_id,
        cluster_id=permission.cluster_id,
        permission_level=permission.permission_level,
        cluster_name=permission.cluster.name,
        created_at=permission.created_at,
        updated_at=permission.updated_at
    )


@router.put("/namespaces/{permission_id}", response_model=schemas.NamespacePermissionResponse)
def update_namespace_permission(
    permission_id: int,
    permission_data: schemas.PermissionUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """更新namespace权限等级（需要管理员权限）"""
    permission = db.query(models.UserNamespacePermission).options(
        joinedload(models.UserNamespacePermission.cluster),
        joinedload(models.UserNamespacePermission.user)
    ).filter(models.UserNamespacePermission.id == permission_id).first()

    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )

    old_level = permission.permission_level
    permission.permission_level = permission_data.permission_level
    permission.updated_at = None  # 触发自动更新

    db.commit()
    db.refresh(permission)

    log_user_action(
        db=db,
        user_id=current_user.id,
        action="update_namespace_permission",
        target_user_id=permission.user_id,
        details={
            "permission_id": permission_id,
            "cluster_id": permission.cluster_id,
            "cluster_name": permission.cluster.name,
            "namespace": permission.namespace,
            "old_level": old_level,
            "new_level": permission_data.permission_level
        },
        request=request
    )

    return schemas.NamespacePermissionResponse(
        id=permission.id,
        user_id=permission.user_id,
        cluster_id=permission.cluster_id,
        namespace=permission.namespace,
        permission_level=permission.permission_level,
        cluster_name=permission.cluster.name,
        created_at=permission.created_at,
        updated_at=permission.updated_at
    )


@router.delete("/clusters/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_cluster_permission(
    permission_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """撤销集群权限（需要管理员权限）"""
    permission = db.query(models.UserClusterPermission).options(
        joinedload(models.UserClusterPermission.cluster),
        joinedload(models.UserClusterPermission.user)
    ).filter(models.UserClusterPermission.id == permission_id).first()

    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )

    permission_details = {
        "permission_id": permission_id,
        "user_id": permission.user_id,
        "cluster_id": permission.cluster_id,
        "cluster_name": permission.cluster.name,
        "permission_level": permission.permission_level
    }

    db.delete(permission)
    db.commit()

    log_user_action(
        db=db,
        user_id=current_user.id,
        action="revoke_cluster_permission",
        target_user_id=permission.user_id,
        details=permission_details,
        request=request
    )

    return None


@router.delete("/namespaces/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_namespace_permission(
    permission_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """撤销namespace权限（需要管理员权限）"""
    permission = db.query(models.UserNamespacePermission).options(
        joinedload(models.UserNamespacePermission.cluster),
        joinedload(models.UserNamespacePermission.user)
    ).filter(models.UserNamespacePermission.id == permission_id).first()

    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )

    permission_details = {
        "permission_id": permission_id,
        "user_id": permission.user_id,
        "cluster_id": permission.cluster_id,
        "cluster_name": permission.cluster.name,
        "namespace": permission.namespace,
        "permission_level": permission.permission_level
    }

    db.delete(permission)
    db.commit()

    log_user_action(
        db=db,
        user_id=current_user.id,
        action="revoke_namespace_permission",
        target_user_id=permission.user_id,
        details=permission_details,
        request=request
    )

    return None
