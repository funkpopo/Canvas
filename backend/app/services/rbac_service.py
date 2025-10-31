"""
RBAC权限管理服务模块
"""
import logging
from typing import List, Optional
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)


def create_permission(
    db: Session,
    name: str,
    resource: str,
    action: str,
    description: Optional[str] = None
) -> models.Permission:
    """创建权限

    Args:
        db: 数据库会话
        name: 权限名称
        resource: 资源类型
        action: 操作类型
        description: 描述

    Returns:
        Permission: 创建的权限对象
    """
    permission = models.Permission(
        name=name,
        resource=resource,
        action=action,
        description=description
    )

    db.add(permission)
    db.commit()
    db.refresh(permission)

    logger.info(f"Created permission: {name}")

    return permission


def get_all_permissions(db: Session) -> List[models.Permission]:
    """获取所有权限

    Args:
        db: 数据库会话

    Returns:
        List[Permission]: 权限列表
    """
    return db.query(models.Permission).order_by(models.Permission.resource, models.Permission.action).all()


def create_role(
    db: Session,
    name: str,
    display_name: str,
    description: Optional[str] = None,
    permission_ids: Optional[List[int]] = None,
    is_system: bool = False
) -> models.Role:
    """创建角色

    Args:
        db: 数据库会话
        name: 角色名称
        display_name: 显示名称
        description: 描述
        permission_ids: 权限ID列表
        is_system: 是否为系统角色

    Returns:
        Role: 创建的角色对象
    """
    role = models.Role(
        name=name,
        display_name=display_name,
        description=description,
        is_system=is_system
    )

    db.add(role)
    db.commit()
    db.refresh(role)

    # 关联权限
    if permission_ids:
        for permission_id in permission_ids:
            role_permission = models.RolePermission(
                role_id=role.id,
                permission_id=permission_id
            )
            db.add(role_permission)

        db.commit()

    logger.info(f"Created role: {name} with {len(permission_ids or [])} permissions")

    return role


def get_role_by_id(db: Session, role_id: int) -> Optional[models.Role]:
    """根据ID获取角色

    Args:
        db: 数据库会话
        role_id: 角色ID

    Returns:
        Optional[Role]: 角色对象
    """
    return db.query(models.Role).filter(models.Role.id == role_id).first()


def get_role_by_name(db: Session, name: str) -> Optional[models.Role]:
    """根据名称获取角色

    Args:
        db: 数据库会话
        name: 角色名称

    Returns:
        Optional[Role]: 角色对象
    """
    return db.query(models.Role).filter(models.Role.name == name).first()


def get_all_roles(db: Session) -> List[models.Role]:
    """获取所有角色

    Args:
        db: 数据库会话

    Returns:
        List[Role]: 角色列表
    """
    return db.query(models.Role).order_by(models.Role.created_at.desc()).all()


def get_role_permissions(db: Session, role_id: int) -> List[models.Permission]:
    """获取角色的权限列表

    Args:
        db: 数据库会话
        role_id: 角色ID

    Returns:
        List[Permission]: 权限列表
    """
    role_permissions = db.query(models.RolePermission).filter(
        models.RolePermission.role_id == role_id
    ).all()

    permission_ids = [rp.permission_id for rp in role_permissions]

    return db.query(models.Permission).filter(
        models.Permission.id.in_(permission_ids)
    ).all()


def update_role(
    db: Session,
    role_id: int,
    display_name: Optional[str] = None,
    description: Optional[str] = None,
    permission_ids: Optional[List[int]] = None
) -> Optional[models.Role]:
    """更新角色

    Args:
        db: 数据库会话
        role_id: 角色ID
        display_name: 显示名称
        description: 描述
        permission_ids: 权限ID列表

    Returns:
        Optional[Role]: 更新后的角色对象
    """
    role = db.query(models.Role).filter(models.Role.id == role_id).first()

    if not role:
        return None

    if role.is_system:
        logger.warning(f"Attempted to update system role: {role.name}")
        raise ValueError("系统角色不可修改")

    if display_name is not None:
        role.display_name = display_name

    if description is not None:
        role.description = description

    # 更新权限关联
    if permission_ids is not None:
        # 删除现有权限关联
        db.query(models.RolePermission).filter(
            models.RolePermission.role_id == role_id
        ).delete()

        # 添加新的权限关联
        for permission_id in permission_ids:
            role_permission = models.RolePermission(
                role_id=role_id,
                permission_id=permission_id
            )
            db.add(role_permission)

    db.commit()
    db.refresh(role)

    logger.info(f"Updated role: {role.name}")

    return role


def delete_role(db: Session, role_id: int) -> bool:
    """删除角色

    Args:
        db: 数据库会话
        role_id: 角色ID

    Returns:
        bool: 是否成功删除
    """
    role = db.query(models.Role).filter(models.Role.id == role_id).first()

    if not role:
        return False

    if role.is_system:
        logger.warning(f"Attempted to delete system role: {role.name}")
        raise ValueError("系统角色不可删除")

    # 删除角色权限关联
    db.query(models.RolePermission).filter(
        models.RolePermission.role_id == role_id
    ).delete()

    # 删除用户角色关联
    db.query(models.UserRole).filter(
        models.UserRole.role_id == role_id
    ).delete()

    # 删除角色
    db.delete(role)
    db.commit()

    logger.info(f"Deleted role: {role.name}")

    return True


def assign_roles_to_user(
    db: Session,
    user_id: int,
    role_ids: List[int]
) -> None:
    """为用户分配角色

    Args:
        db: 数据库会话
        user_id: 用户ID
        role_ids: 角色ID列表
    """
    # 删除现有角色关联
    db.query(models.UserRole).filter(
        models.UserRole.user_id == user_id
    ).delete()

    # 添加新的角色关联
    for role_id in role_ids:
        user_role = models.UserRole(
            user_id=user_id,
            role_id=role_id
        )
        db.add(user_role)

    db.commit()

    logger.info(f"Assigned {len(role_ids)} roles to user_id {user_id}")


def get_user_roles(db: Session, user_id: int) -> List[models.Role]:
    """获取用户的角色列表

    Args:
        db: 数据库会话
        user_id: 用户ID

    Returns:
        List[Role]: 角色列表
    """
    user_roles = db.query(models.UserRole).filter(
        models.UserRole.user_id == user_id
    ).all()

    role_ids = [ur.role_id for ur in user_roles]

    return db.query(models.Role).filter(
        models.Role.id.in_(role_ids)
    ).all()


def get_user_permissions(db: Session, user_id: int) -> List[models.Permission]:
    """获取用户的所有权限（通过角色）

    Args:
        db: 数据库会话
        user_id: 用户ID

    Returns:
        List[Permission]: 权限列表
    """
    # 获取用户的角色
    roles = get_user_roles(db, user_id)

    # 获取所有角色的权限
    all_permissions = []
    for role in roles:
        permissions = get_role_permissions(db, role.id)
        all_permissions.extend(permissions)

    # 去重
    unique_permissions = {}
    for permission in all_permissions:
        unique_permissions[permission.id] = permission

    return list(unique_permissions.values())


def check_user_permission(
    db: Session,
    user_id: int,
    resource: str,
    action: str
) -> bool:
    """检查用户是否有指定资源的操作权限

    Args:
        db: 数据库会话
        user_id: 用户ID
        resource: 资源类型
        action: 操作类型

    Returns:
        bool: 是否有权限
    """
    permissions = get_user_permissions(db, user_id)

    for permission in permissions:
        if permission.resource == resource and permission.action == action:
            return True

        # 支持通配符
        if permission.resource == "*" or permission.action == "*":
            return True

    return False


def initialize_default_permissions(db: Session) -> None:
    """初始化默认权限

    Args:
        db: 数据库会话
    """
    default_permissions = [
        # 集群管理
        ("cluster.read", "cluster", "read", "查看集群"),
        ("cluster.create", "cluster", "create", "创建集群"),
        ("cluster.update", "cluster", "update", "更新集群"),
        ("cluster.delete", "cluster", "delete", "删除集群"),

        # Pod管理
        ("pod.read", "pod", "read", "查看Pod"),
        ("pod.create", "pod", "create", "创建Pod"),
        ("pod.update", "pod", "update", "更新Pod"),
        ("pod.delete", "pod", "delete", "删除Pod"),
        ("pod.exec", "pod", "exec", "执行Pod命令"),
        ("pod.logs", "pod", "logs", "查看Pod日志"),

        # Deployment管理
        ("deployment.read", "deployment", "read", "查看Deployment"),
        ("deployment.create", "deployment", "create", "创建Deployment"),
        ("deployment.update", "deployment", "update", "更新Deployment"),
        ("deployment.delete", "deployment", "delete", "删除Deployment"),

        # Service管理
        ("service.read", "service", "read", "查看Service"),
        ("service.create", "service", "create", "创建Service"),
        ("service.update", "service", "update", "更新Service"),
        ("service.delete", "service", "delete", "删除Service"),

        # ConfigMap管理
        ("configmap.read", "configmap", "read", "查看ConfigMap"),
        ("configmap.create", "configmap", "create", "创建ConfigMap"),
        ("configmap.update", "configmap", "update", "更新ConfigMap"),
        ("configmap.delete", "configmap", "delete", "删除ConfigMap"),

        # Secret管理
        ("secret.read", "secret", "read", "查看Secret"),
        ("secret.create", "secret", "create", "创建Secret"),
        ("secret.update", "secret", "update", "更新Secret"),
        ("secret.delete", "secret", "delete", "删除Secret"),

        # 用户管理
        ("user.read", "user", "read", "查看用户"),
        ("user.create", "user", "create", "创建用户"),
        ("user.update", "user", "update", "更新用户"),
        ("user.delete", "user", "delete", "删除用户"),

        # 角色管理
        ("role.read", "role", "read", "查看角色"),
        ("role.create", "role", "create", "创建角色"),
        ("role.update", "role", "update", "更新角色"),
        ("role.delete", "role", "delete", "删除角色"),
    ]

    for name, resource, action, description in default_permissions:
        existing = db.query(models.Permission).filter(
            models.Permission.name == name
        ).first()

        if not existing:
            permission = models.Permission(
                name=name,
                resource=resource,
                action=action,
                description=description
            )
            db.add(permission)

    db.commit()

    logger.info("Initialized default permissions")


def initialize_default_roles(db: Session) -> None:
    """初始化默认角色

    Args:
        db: 数据库会话
    """
    # 获取所有权限
    all_permissions = get_all_permissions(db)
    permission_map = {p.name: p.id for p in all_permissions}

    # 定义默认角色及其权限
    default_roles = [
        {
            "name": "super_admin",
            "display_name": "超级管理员",
            "description": "拥有所有权限",
            "permissions": [p.name for p in all_permissions],
            "is_system": True
        },
        {
            "name": "cluster_admin",
            "display_name": "集群管理员",
            "description": "管理集群和所有资源",
            "permissions": [
                "cluster.read", "cluster.create", "cluster.update", "cluster.delete",
                "pod.read", "pod.create", "pod.update", "pod.delete", "pod.exec", "pod.logs",
                "deployment.read", "deployment.create", "deployment.update", "deployment.delete",
                "service.read", "service.create", "service.update", "service.delete",
                "configmap.read", "configmap.create", "configmap.update", "configmap.delete",
                "secret.read", "secret.create", "secret.update", "secret.delete",
            ],
            "is_system": True
        },
        {
            "name": "developer",
            "display_name": "开发者",
            "description": "可以管理应用资源",
            "permissions": [
                "cluster.read",
                "pod.read", "pod.create", "pod.update", "pod.delete", "pod.logs",
                "deployment.read", "deployment.create", "deployment.update", "deployment.delete",
                "service.read", "service.create", "service.update", "service.delete",
                "configmap.read", "configmap.create", "configmap.update", "configmap.delete",
            ],
            "is_system": True
        },
        {
            "name": "viewer",
            "display_name": "只读用户",
            "description": "只能查看资源",
            "permissions": [
                "cluster.read",
                "pod.read", "pod.logs",
                "deployment.read",
                "service.read",
                "configmap.read",
                "secret.read",
            ],
            "is_system": True
        },
    ]

    for role_data in default_roles:
        existing = db.query(models.Role).filter(
            models.Role.name == role_data["name"]
        ).first()

        if not existing:
            # 获取权限ID
            permission_ids = [
                permission_map[p] for p in role_data["permissions"]
                if p in permission_map
            ]

            create_role(
                db,
                role_data["name"],
                role_data["display_name"],
                role_data["description"],
                permission_ids,
                role_data["is_system"]
            )

    logger.info("Initialized default roles")
