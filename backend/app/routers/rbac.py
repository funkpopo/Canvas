from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, User
from ..auth import get_current_user, require_admin
from ..k8s_client import (
    get_roles, get_role, delete_role,
    get_role_bindings, get_role_binding, delete_role_binding,
    get_service_accounts, get_service_account, delete_service_account,
    get_cluster_roles, get_cluster_role_bindings
)
from ..audit import log_action
from pydantic import BaseModel

router = APIRouter()

# ========== Roles ==========

@router.get("/roles")
async def list_roles(
    cluster_id: int = Query(..., description="集群ID"),
    namespace: Optional[str] = Query(None, description="命名空间，不指定则返回所有"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Roles列表"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        roles = get_roles(cluster, namespace)
        if roles is None:
            raise HTTPException(status_code=500, detail="获取Roles失败")
        
        return {
            "roles": roles,
            "total": len(roles),
            "cluster_id": cluster_id,
            "cluster_name": cluster.name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Roles失败: {str(e)}")


@router.get("/roles/{namespace}/{name}")
async def get_role_detail(
    namespace: str,
    name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Role详情"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        role = get_role(cluster, namespace, name)
        if not role:
            raise HTTPException(status_code=404, detail="Role不存在")
        
        return role
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Role详情失败: {str(e)}")


@router.delete("/roles/{namespace}/{name}")
async def delete_role_endpoint(
    namespace: str,
    name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """删除Role（需要管理员权限）"""
    cluster = None
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        success = delete_role(cluster, namespace, name)
        if success:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="role",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=True,
                request=request
            )
            return {"message": f"Role {namespace}/{name} 删除成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="role",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=False,
                error_message="删除失败",
                request=request
            )
            raise HTTPException(status_code=500, detail="删除Role失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="role",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"删除Role失败: {str(e)}")


# ========== RoleBindings ==========

@router.get("/role-bindings")
async def list_role_bindings(
    cluster_id: int = Query(..., description="集群ID"),
    namespace: Optional[str] = Query(None, description="命名空间，不指定则返回所有"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取RoleBindings列表"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        bindings = get_role_bindings(cluster, namespace)
        if bindings is None:
            raise HTTPException(status_code=500, detail="获取RoleBindings失败")
        
        return {
            "role_bindings": bindings,
            "total": len(bindings),
            "cluster_id": cluster_id,
            "cluster_name": cluster.name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取RoleBindings失败: {str(e)}")


@router.get("/role-bindings/{namespace}/{name}")
async def get_role_binding_detail(
    namespace: str,
    name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取RoleBinding详情"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        binding = get_role_binding(cluster, namespace, name)
        if not binding:
            raise HTTPException(status_code=404, detail="RoleBinding不存在")
        
        return binding
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取RoleBinding详情失败: {str(e)}")


@router.delete("/role-bindings/{namespace}/{name}")
async def delete_role_binding_endpoint(
    namespace: str,
    name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """删除RoleBinding（需要管理员权限）"""
    cluster = None
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        success = delete_role_binding(cluster, namespace, name)
        if success:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="rolebinding",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=True,
                request=request
            )
            return {"message": f"RoleBinding {namespace}/{name} 删除成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="rolebinding",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=False,
                error_message="删除失败",
                request=request
            )
            raise HTTPException(status_code=500, detail="删除RoleBinding失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="rolebinding",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"删除RoleBinding失败: {str(e)}")


# ========== ServiceAccounts ==========

@router.get("/service-accounts")
async def list_service_accounts(
    cluster_id: int = Query(..., description="集群ID"),
    namespace: Optional[str] = Query(None, description="命名空间，不指定则返回所有"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ServiceAccounts列表"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        service_accounts = get_service_accounts(cluster, namespace)
        if service_accounts is None:
            raise HTTPException(status_code=500, detail="获取ServiceAccounts失败")
        
        return {
            "service_accounts": service_accounts,
            "total": len(service_accounts),
            "cluster_id": cluster_id,
            "cluster_name": cluster.name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取ServiceAccounts失败: {str(e)}")


@router.get("/service-accounts/{namespace}/{name}")
async def get_service_account_detail(
    namespace: str,
    name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ServiceAccount详情"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        sa = get_service_account(cluster, namespace, name)
        if not sa:
            raise HTTPException(status_code=404, detail="ServiceAccount不存在")
        
        return sa
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取ServiceAccount详情失败: {str(e)}")


@router.delete("/service-accounts/{namespace}/{name}")
async def delete_service_account_endpoint(
    namespace: str,
    name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """删除ServiceAccount（需要管理员权限）"""
    cluster = None
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        success = delete_service_account(cluster, namespace, name)
        if success:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="serviceaccount",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=True,
                request=request
            )
            return {"message": f"ServiceAccount {namespace}/{name} 删除成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="serviceaccount",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=False,
                error_message="删除失败",
                request=request
            )
            raise HTTPException(status_code=500, detail="删除ServiceAccount失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="serviceaccount",
                resource_name=f"{namespace}/{name}",
                details={"namespace": namespace, "name": name},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"删除ServiceAccount失败: {str(e)}")


# ========== ClusterRoles (只读) ==========

@router.get("/cluster-roles")
async def list_cluster_roles(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ClusterRoles列表"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        roles = get_cluster_roles(cluster)
        if roles is None:
            raise HTTPException(status_code=500, detail="获取ClusterRoles失败")
        
        return {
            "cluster_roles": roles,
            "total": len(roles),
            "cluster_id": cluster_id,
            "cluster_name": cluster.name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取ClusterRoles失败: {str(e)}")


# ========== ClusterRoleBindings (只读) ==========

@router.get("/cluster-role-bindings")
async def list_cluster_role_bindings(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ClusterRoleBindings列表"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        
        bindings = get_cluster_role_bindings(cluster)
        if bindings is None:
            raise HTTPException(status_code=500, detail="获取ClusterRoleBindings失败")
        
        return {
            "cluster_role_bindings": bindings,
            "total": len(bindings),
            "cluster_id": cluster_id,
            "cluster_name": cluster.name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取ClusterRoleBindings失败: {str(e)}")
