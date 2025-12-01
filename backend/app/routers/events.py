from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..services.k8s import get_cluster_events
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()

logger = get_logger(__name__)


class EventInfo(BaseModel):
    name: str
    namespace: str
    type: str
    reason: str
    message: str
    source: Optional[str]
    count: int
    first_timestamp: Optional[str]
    last_timestamp: Optional[str]
    age: str
    involved_object: Optional[dict]


@router.get("/", response_model=List[EventInfo])
@router.get("", response_model=List[EventInfo])
async def get_events(
    namespace: Optional[str] = None,
    cluster_id: Optional[int] = None,
    limit: int = Query(100, description="返回的事件数量限制", ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        if cluster_id:
            cluster = (
                db.query(Cluster)
                .filter(Cluster.id == cluster_id, Cluster.is_active == True)
                .first()
            )
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_events = []
        for cluster in clusters:
            try:
                events = get_cluster_events(cluster, namespace, limit)
                if events:
                    for event in events:
                        # 添加集群信息
                        event["cluster_id"] = cluster.id
                        event["cluster_name"] = cluster.name
                        all_events.append(EventInfo(**event))
            except Exception as e:
                logger.warning("获取集群事件失败: cluster=%s error=%s", cluster.name, e)
                continue

        return all_events

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取事件信息失败: {str(e)}")
