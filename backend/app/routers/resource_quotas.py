from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import get_current_user, require_resource_quota_management, require_read_only, check_cluster_access, get_viewer_allowed_cluster_ids
from ..services.k8s import (
    get_namespace_resource_quotas, get_resource_quota_details, create_resource_quota, update_resource_quota, delete_resource_quota
)
from ..audit import log_action
from pydantic import BaseModel

router = APIRouter()

# Resource Quota相关模型
class ResourceQuotaInfo(BaseModel):
    name: str
    namespace: str
    hard: dict
    used: dict
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int

class ResourceQuotaDetails(BaseModel):
    name: str
    namespace: str
    hard: dict
    used: dict
    scopes: List[str]
    scope_selector: List[dict]
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int

class ResourceQuotaCreate(BaseModel):
    name: str
    namespace: str
    hard: dict = {}
    scopes: List[str] = []
    scope_selector: List[dict] = []
    labels: Optional[dict] = None
    annotations: Optional[dict] = None

class ResourceQuotaUpdate(BaseModel):
    hard: Optional[dict] = None
    scopes: Optional[List[str]] = None
    scope_selector: Optional[List[dict]] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


# ========== Resource Quotas管理 ==========

@router.get("/", response_model=List[ResourceQuotaInfo])
async def get_resource_quotas(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_read_only)
):
    """获取Resource Quota列表"""
    try:
        if cluster_id:
            if getattr(current_user, "role", None) == "viewer":
                if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                    raise HTTPException(status_code=403, detail="需要集群 read 权限")
            # 获取特定集群的Resource Quotas
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")

            if namespace:
                quotas = get_namespace_resource_quotas(cluster, namespace)
            else:
                # 获取所有命名空间的Resource Quotas
                quotas = []
                raise HTTPException(status_code=400, detail="必须指定命名空间")
        else:
            # 获取所有活跃集群的Resource Quotas
            if getattr(current_user, "role", None) == "viewer":
                allowed_ids = get_viewer_allowed_cluster_ids(db, current_user)
                if not allowed_ids:
                    return []
                clusters = db.query(Cluster).filter(Cluster.is_active == True, Cluster.id.in_(allowed_ids)).all()
            else:
                clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
            quotas = []
            for cluster in clusters:
                if namespace:
                    cluster_quotas = get_namespace_resource_quotas(cluster, namespace)
                    quotas.extend(cluster_quotas)

        return quotas

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Resource Quota列表失败: {str(e)}")


@router.get("/{namespace}/{quota_name}", response_model=ResourceQuotaDetails)
async def get_resource_quota(
    namespace: str,
    quota_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_read_only)
):
    """获取Resource Quota详细信息"""
    try:
        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        quota = get_resource_quota_details(cluster, namespace, quota_name)
        if not quota:
            raise HTTPException(status_code=404, detail="Resource Quota不存在")

        return quota

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Resource Quota详情失败: {str(e)}")


@router.post("/", response_model=dict)
async def create_new_resource_quota(
    quota_data: ResourceQuotaCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_quota_management)
):
    """创建Resource Quota"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建Resource Quota数据
        quota_dict = {
            "name": quota_data.name,
            "namespace": quota_data.namespace,
            "hard": quota_data.hard,
            "scopes": quota_data.scopes,
            "scope_selector": quota_data.scope_selector,
            "labels": quota_data.labels,
            "annotations": quota_data.annotations
        }

        success = create_resource_quota(cluster, quota_dict)
        if not success:
            raise HTTPException(status_code=500, detail="创建Resource Quota失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="ResourceQuota",
            resource_name=f"{quota_data.namespace}/{quota_data.name}",
            cluster_id=cluster_id,
            details=f"创建Resource Quota {quota_data.name} 在命名空间 {quota_data.namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Resource Quota创建成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建Resource Quota失败: {str(e)}")


@router.put("/{namespace}/{quota_name}", response_model=dict)
async def update_existing_resource_quota(
    namespace: str,
    quota_name: str,
    updates: ResourceQuotaUpdate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_quota_management)
):
    """更新Resource Quota"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建更新数据
        update_dict = {}
        if updates.hard is not None:
            update_dict["hard"] = updates.hard
        if updates.scopes is not None:
            update_dict["scopes"] = updates.scopes
        if updates.scope_selector is not None:
            update_dict["scope_selector"] = updates.scope_selector
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations

        success = update_resource_quota(cluster, namespace, quota_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新Resource Quota失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="ResourceQuota",
            resource_name=f"{namespace}/{quota_name}",
            cluster_id=cluster_id,
            details=f"更新Resource Quota {quota_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Resource Quota更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Resource Quota失败: {str(e)}")


@router.delete("/{namespace}/{quota_name}", response_model=dict)
async def delete_existing_resource_quota(
    namespace: str,
    quota_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_quota_management)
):
    """删除Resource Quota"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_resource_quota(cluster, namespace, quota_name)
        if not success:
            raise HTTPException(status_code=500, detail="删除Resource Quota失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="ResourceQuota",
            resource_name=f"{namespace}/{quota_name}",
            cluster_id=cluster_id,
            details=f"删除Resource Quota {quota_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Resource Quota删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除Resource Quota失败: {str(e)}")
