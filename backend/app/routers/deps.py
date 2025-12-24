from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Cluster


def get_cluster_or_404(cluster_id: int, db: Session = Depends(get_db)) -> Cluster:
    """通用依赖：根据 cluster_id 获取 Cluster，不存在则 404。"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")
    return cluster


