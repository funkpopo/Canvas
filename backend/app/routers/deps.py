"""
Common dependencies for API routers.
Provides reusable utilities to reduce code duplication across router modules.
"""
import inspect
from functools import wraps
from typing import Callable, Optional, Any
from fastapi import Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Cluster, User
from ..auth import get_current_user, check_cluster_access, get_viewer_allowed_cluster_ids
from ..audit import log_action


def get_active_cluster(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db)
) -> Cluster:
    """Get active cluster by ID or raise 404."""
    cluster = db.query(Cluster).filter(
        Cluster.id == cluster_id,
        Cluster.is_active == True
    ).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在或未激活")
    return cluster


def get_active_cluster_with_read_access(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Cluster:
    """Get active cluster with read permission check for viewers."""
    if getattr(current_user, "role", None) == "viewer":
        if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
            raise HTTPException(status_code=403, detail="需要集群 read 权限")
    return get_active_cluster(cluster_id, db)


def get_clusters_for_user(
    cluster_id: Optional[int] = Query(None, description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> list[Cluster]:
    """Get clusters accessible to user. If cluster_id provided, returns single cluster list."""
    if cluster_id:
        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")
        cluster = db.query(Cluster).filter(
            Cluster.id == cluster_id,
            Cluster.is_active == True
        ).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")
        return [cluster]

    if getattr(current_user, "role", None) == "viewer":
        allowed_ids = get_viewer_allowed_cluster_ids(db, current_user)
        if not allowed_ids:
            return []
        return db.query(Cluster).filter(
            Cluster.is_active == True,
            Cluster.id.in_(allowed_ids)
        ).all()

    return db.query(Cluster).filter(Cluster.is_active == True).all()


def validate_cluster_id(cluster_id: int = Query(..., description="集群ID")) -> int:
    """Validate cluster_id is a positive integer."""
    if not isinstance(cluster_id, int) or cluster_id <= 0:
        raise HTTPException(status_code=422, detail="无效的集群ID")
    return cluster_id


class AuditLogger:
    """Helper class for consistent audit logging."""

    def __init__(
        self,
        db: Session,
        user: User,
        cluster_id: int,
        resource_type: str,
        request: Optional[Request] = None
    ):
        self.db = db
        self.user = user
        self.cluster_id = cluster_id
        self.resource_type = resource_type
        self.request = request

    def log(
        self,
        action: str,
        resource_name: str,
        details: dict,
        success: bool,
        error_message: Optional[str] = None
    ):
        log_action(
            db=self.db,
            user_id=self.user.id,
            cluster_id=self.cluster_id,
            action=action,
            resource_type=self.resource_type,
            resource_name=resource_name,
            details=details,
            success=success,
            error_message=error_message,
            request=self.request
        )


def with_audit_log(
    action: str,
    resource_type: str,
    get_resource_name: Callable[..., str],
    get_details: Callable[..., dict]
):
    """
    Decorator for endpoints that need audit logging.

    Usage:
        @with_audit_log(
            action="delete",
            resource_type="pod",
            get_resource_name=lambda namespace, pod_name, **_: f"{namespace}/{pod_name}",
            get_details=lambda namespace, pod_name, **_: {"namespace": namespace, "pod_name": pod_name}
        )
        async def delete_pod(...):
            ...
    """
    def decorator(func: Callable) -> Callable:
        if inspect.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                db = kwargs.get("db")
                current_user = kwargs.get("current_user")
                cluster_id = kwargs.get("cluster_id")
                request = kwargs.get("request")

                resource_name = get_resource_name(**kwargs)
                details = get_details(**kwargs)

                try:
                    result = await func(*args, **kwargs)
                    if db and current_user and cluster_id:
                        log_action(
                            db=db,
                            user_id=current_user.id,
                            cluster_id=cluster_id,
                            action=action,
                            resource_type=resource_type,
                            resource_name=resource_name,
                            details=details,
                            success=True,
                            request=request,
                        )
                    return result
                except HTTPException:
                    raise
                except Exception as e:
                    if db and current_user and cluster_id:
                        log_action(
                            db=db,
                            user_id=current_user.id,
                            cluster_id=cluster_id,
                            action=action,
                            resource_type=resource_type,
                            resource_name=resource_name,
                            details=details,
                            success=False,
                            error_message=str(e),
                            request=request,
                        )
                    raise HTTPException(status_code=500, detail=f"{action} {resource_type} 失败: {str(e)}")

            return async_wrapper

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            db = kwargs.get("db")
            current_user = kwargs.get("current_user")
            cluster_id = kwargs.get("cluster_id")
            request = kwargs.get("request")

            resource_name = get_resource_name(**kwargs)
            details = get_details(**kwargs)

            try:
                result = func(*args, **kwargs)
                if db and current_user and cluster_id:
                    log_action(
                        db=db,
                        user_id=current_user.id,
                        cluster_id=cluster_id,
                        action=action,
                        resource_type=resource_type,
                        resource_name=resource_name,
                        details=details,
                        success=True,
                        request=request,
                    )
                return result
            except HTTPException:
                raise
            except Exception as e:
                if db and current_user and cluster_id:
                    log_action(
                        db=db,
                        user_id=current_user.id,
                        cluster_id=cluster_id,
                        action=action,
                        resource_type=resource_type,
                        resource_name=resource_name,
                        details=details,
                        success=False,
                        error_message=str(e),
                        request=request,
                    )
                raise HTTPException(status_code=500, detail=f"{action} {resource_type} 失败: {str(e)}")

        return sync_wrapper

    return decorator


def handle_k8s_operation(error_prefix: str):
    """
    Decorator for handling K8s operation errors consistently.

    Usage:
        @handle_k8s_operation("获取Pod详情")
        async def get_pod_detail(...):
            ...
    """
    def decorator(func: Callable) -> Callable:
        if inspect.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                try:
                    return await func(*args, **kwargs)
                except HTTPException:
                    raise
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"{error_prefix}失败: {str(e)}")

            return async_wrapper

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"{error_prefix}失败: {str(e)}")

        return sync_wrapper
    return decorator
