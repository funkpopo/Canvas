from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import require_cluster_access
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
    cluster_id: int
    cluster_name: str


class EventPageResponse(BaseModel):
    items: List[EventInfo]
    continue_token: Optional[str] = None
    limit: int


@router.get("/", response_model=EventPageResponse)
@router.get("", response_model=EventPageResponse)
async def get_events(
    namespace: Optional[str] = None,
    cluster_id: int = Query(..., description="集群ID"),
    limit: int = Query(200, description="每页数量", ge=1, le=1000),
    continue_token: Optional[str] = Query(None, description="分页游标"),
    db: Session = Depends(get_db),
    current_user=Depends(require_cluster_access("read")),
):
    try:
        cluster = (
            db.query(Cluster)
            .filter(Cluster.id == cluster_id, Cluster.is_active == True)
            .first()
        )
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        page = get_cluster_events(cluster, namespace=namespace, limit=limit, continue_token=continue_token)
        items = []
        for event in page.get("items", []):
            event["cluster_id"] = cluster.id
            event["cluster_name"] = cluster.name
            items.append(EventInfo(**event))

        return EventPageResponse(items=items, continue_token=page.get("continue_token"), limit=limit)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取事件信息失败: {str(e)}")
