from sqlalchemy.orm import Session
from fastapi import Request
from typing import Optional
from . import models
import json
import logging

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    user_id: int,
    cluster_id: int,
    action: str,
    resource_type: str,
    resource_name: str,
    details: Optional[dict] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    request: Optional[Request] = None
):
    """记录审计日志"""
    try:
        ip_address = None
        user_agent = None
        
        if request:
            ip_address = request.headers.get("X-Real-IP") or \
                        request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or \
                        request.client.host if request.client else None
            user_agent = request.headers.get("User-Agent")
        
        details_json = None
        if details:
            details_json = json.dumps(details, ensure_ascii=False)
        
        audit_log = models.AuditLog(
            user_id=user_id,
            cluster_id=cluster_id,
            action=action,
            resource_type=resource_type,
            resource_name=resource_name,
            details=details_json,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
            error_message=error_message
        )
        
        db.add(audit_log)
        db.commit()
        
        return audit_log
    except Exception as e:
        logger.exception("审计日志记录失败: %s", e)
        db.rollback()
        return None


def log_user_action(
    db: Session,
    user_id: int,
    action: str,
    target_user_id: int,
    details: Optional[dict] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    request: Optional[Request] = None
):
    """记录用户管理相关的审计日志"""
    return log_action(
        db=db,
        user_id=user_id,
        cluster_id=0,  # 系统级操作使用cluster_id=0
        action=action,
        resource_type="user",
        resource_name=f"user_{target_user_id}",
        details=details,
        success=success,
        error_message=error_message,
        request=request
    ) 
