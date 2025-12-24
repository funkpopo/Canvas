from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user
from ..observability import request_metrics
from ..cache import cache_manager
from ..services.k8s import _client_pool
from ..websocket_manager import manager
from .. import models

router = APIRouter()


def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


@router.get("/stats")
async def get_monitoring_stats(current_user: models.User = Depends(require_admin)):
    """轻量级监控指标（用于排障/观测，不替代专业监控系统）。"""
    return {
        "requests": request_metrics.snapshot(),
        "cache": {
            "enabled": bool(getattr(cache_manager, "enabled", False)),
        },
        "k8s_client_pool": _client_pool.get_pool_stats(),
        "websocket": manager.get_connection_stats(),
    }


