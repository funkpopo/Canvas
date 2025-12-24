from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Cluster
from ..schemas import ClusterCreate, ClusterUpdate, ClusterResponse
from ..auth import get_current_user, require_cluster_management, require_read_only, check_cluster_access, get_viewer_allowed_cluster_ids
from ..cache import cache_manager, CLUSTER_LIST_TTL, invalidate_cache

router = APIRouter()


@router.post("/", response_model=ClusterResponse)
async def create_cluster(
    cluster: ClusterCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_cluster_management),
):
    # 名称唯一校验
    db_cluster = db.query(Cluster).filter(Cluster.name == cluster.name).first()
    if db_cluster:
        raise HTTPException(status_code=400, detail="集群名称已存在")

    # TODO: 可根据 auth_type 在此进行连接性校验（保留原逻辑位置）

    db_cluster = Cluster(
        name=cluster.name,
        endpoint=cluster.endpoint,
        auth_type=cluster.auth_type,
        kubeconfig_content=cluster.kubeconfig_content,
        token=cluster.token,
        ca_cert=cluster.ca_cert,
        is_active=cluster.is_active,
    )
    db.add(db_cluster)
    db.commit()
    # 若新建为激活,则取消其它激活,确保唯一
    if db_cluster.is_active:
        db.query(Cluster).filter(Cluster.id != db_cluster.id).update({Cluster.is_active: False})
        db.commit()
    db.refresh(db_cluster)

    # 使集群列表缓存失效
    invalidate_cache("cluster_list:*")

    # 如果集群被激活，在后台线程中启动监听器
    if db_cluster.is_active:
        from ..services.k8s import start_watcher_async
        start_watcher_async(db_cluster)

    return db_cluster


@router.get("/", response_model=List[ClusterResponse])
@router.get("", response_model=List[ClusterResponse])
async def get_clusters(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_read_only),
):
    # viewer：默认无任何集群权限，仅返回显式授权的集群（无缓存或按用户缓存）
    if getattr(current_user, "role", None) == "viewer":
        allowed_ids = get_viewer_allowed_cluster_ids(db, current_user)
        if not allowed_ids:
            return []
        return (
            db.query(Cluster)
            .filter(Cluster.id.in_(allowed_ids))
            .offset(skip)
            .limit(limit)
            .all()
        )

    # 其他角色：保持原行为（全量列表 + 缓存）
    cache_key = f"cluster_list:skip:{skip}:limit:{limit}"
    cached_clusters = cache_manager.get(cache_key)
    if cached_clusters is not None:
        return cached_clusters

    clusters = db.query(Cluster).offset(skip).limit(limit).all()
    cache_manager.set(cache_key, clusters, CLUSTER_LIST_TTL)
    return clusters


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_read_only),
):
    # viewer：必须显式授权后才能访问集群详情
    if getattr(current_user, "role", None) == "viewer":
        if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
            raise HTTPException(status_code=403, detail="需要集群 read 权限")

    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")
    return cluster


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(
    cluster_id: int,
    cluster_update: ClusterUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_cluster_management),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    if cluster_update.name and cluster_update.name != cluster.name:
        existing = db.query(Cluster).filter(Cluster.name == cluster_update.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="集群名称已存在")

    update_data = cluster_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cluster, field, value)

    # 若本次更新将该集群设为激活，则取消其它集群激活，确保唯一
    if update_data.get("is_active") is True:
        db.query(Cluster).filter(Cluster.id != cluster.id).update({Cluster.is_active: False})

    db.commit()
    db.refresh(cluster)

    # 使集群列表缓存失效
    invalidate_cache("cluster_list:*")

    # 处理监听器状态变化
    from ..services.k8s import watcher_manager, start_watcher_async

    # 如果集群被激活，在后台线程中启动监听器
    if cluster.is_active and not update_data.get("is_active") is False:
        start_watcher_async(cluster)
    # 如果集群被停用，停止监听器
    elif update_data.get("is_active") is False:
        watcher_manager.stop_watcher(cluster.id)

    return cluster


@router.delete("/{cluster_id}")
async def delete_cluster(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_cluster_management),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    # 删除前停止监听器
    from ..services.k8s import watcher_manager
    watcher_manager.stop_watcher(cluster_id)

    # 使集群列表缓存失效
    invalidate_cache("cluster_list:*")

    db.delete(cluster)
    db.commit()
    return {"message": "集群已删除"}


@router.post("/{cluster_id}/test-connection")
async def test_cluster_connection(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_read_only),
):
    from ..services.k8s import test_cluster_connection as test_conn

    if getattr(current_user, "role", None) == "viewer":
        if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
            raise HTTPException(status_code=403, detail="需要集群 read 权限")

    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    result = test_conn(cluster)
    return result


@router.post("/{cluster_id}/activate", response_model=ClusterResponse)
async def activate_cluster(
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_cluster_management),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    db.query(Cluster).filter(Cluster.id != cluster_id).update({Cluster.is_active: False})
    cluster.is_active = True
    db.commit()
    db.refresh(cluster)

    # 激活集群时在后台线程中启动监听器
    from ..services.k8s import start_watcher_async
    start_watcher_async(cluster)

    return cluster

