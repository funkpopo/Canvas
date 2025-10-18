from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


@router.get("/", response_model=schemas.AuditLogListResponse)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: Optional[int] = None,
    cluster_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    success: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    query = db.query(models.AuditLog)
    
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    if cluster_id:
        query = query.filter(models.AuditLog.cluster_id == cluster_id)
    if action:
        query = query.filter(models.AuditLog.action == action)
    if resource_type:
        query = query.filter(models.AuditLog.resource_type == resource_type)
    if success is not None:
        query = query.filter(models.AuditLog.success == success)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(models.AuditLog.created_at >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(models.AuditLog.created_at <= end_dt)
        except ValueError:
            pass
    
    total = query.count()
    logs = query.order_by(models.AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    result_logs = []
    for log in logs:
        result_logs.append({
            "id": log.id,
            "user_id": log.user_id,
            "username": log.user.username if log.user else None,
            "cluster_id": log.cluster_id,
            "cluster_name": log.cluster.name if log.cluster else None,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_name": log.resource_name,
            "details": log.details,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "success": log.success,
            "error_message": log.error_message,
            "created_at": log.created_at
        })
    
    return {"total": total, "logs": result_logs}


@router.get("/stats/summary")
async def get_audit_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    query = db.query(models.AuditLog)
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(models.AuditLog.created_at >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(models.AuditLog.created_at <= end_dt)
        except ValueError:
            pass
    
    total_operations = query.count()
    success_count = query.filter(models.AuditLog.success == True).count()
    failed_count = query.filter(models.AuditLog.success == False).count()
    
    log_ids = [log.id for log in query.all()]
    
    action_stats = db.query(
        models.AuditLog.action,
        func.count(models.AuditLog.id).label('count')
    ).filter(models.AuditLog.id.in_(log_ids)).group_by(models.AuditLog.action).all() if log_ids else []
    
    resource_stats = db.query(
        models.AuditLog.resource_type,
        func.count(models.AuditLog.id).label('count')
    ).filter(models.AuditLog.id.in_(log_ids)).group_by(models.AuditLog.resource_type).all() if log_ids else []
    
    user_stats = db.query(
        models.User.username,
        func.count(models.AuditLog.id).label('count')
    ).join(models.AuditLog, models.User.id == models.AuditLog.user_id).filter(
        models.AuditLog.id.in_(log_ids)
    ).group_by(models.User.username).all() if log_ids else []
    
    return {
        "total_operations": total_operations,
        "success_count": success_count,
        "failed_count": failed_count,
        "success_rate": round(success_count / total_operations * 100, 2) if total_operations > 0 else 0,
        "action_stats": [{"action": action, "count": count} for action, count in action_stats],
        "resource_stats": [{"resource_type": resource_type, "count": count} for resource_type, count in resource_stats],
        "user_stats": [{"username": username, "count": count} for username, count in user_stats]
    } 