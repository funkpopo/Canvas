from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Cluster, User
from ..auth import require_namespace_access, require_cluster_access, require_no_viewer
from ..services.k8s import get_pods_page, get_pod_details, get_pod_logs, restart_pod, delete_pod, batch_delete_pods, batch_restart_pods
from ..core.logging import get_logger
from .deps import get_active_cluster, AuditLogger, handle_k8s_operation

router = APIRouter()
logger = get_logger(__name__)


class PodInfo(BaseModel):
    name: str
    namespace: str
    status: str
    node_name: Optional[str]
    age: str
    restarts: int
    ready_containers: str
    cluster_name: str
    labels: dict
    cluster_id: int


class PodPageResponse(BaseModel):
    items: List[PodInfo]
    continue_token: Optional[str] = None
    limit: int


class PodDetails(BaseModel):
    name: str
    namespace: str
    status: str
    node_name: Optional[str]
    age: str
    restarts: int
    ready_containers: str
    labels: dict
    annotations: dict
    containers: List[dict]
    volumes: List[dict]
    events: List[dict]
    cluster_id: int
    cluster_name: str


class PodItem(BaseModel):
    namespace: str
    name: str


class BatchOperationRequest(BaseModel):
    cluster_id: int
    pods: List[PodItem]
    force: bool = False


class BatchOperationResponse(BaseModel):
    results: dict
    success_count: int
    failure_count: int


@router.get("/", response_model=PodPageResponse)
@router.get("", response_model=PodPageResponse)
@handle_k8s_operation("获取Pod信息")
async def get_pods(
    namespace: Optional[str] = None,
    limit: int = Query(200, description="每页数量", ge=1, le=1000),
    continue_token: Optional[str] = Query(None, description="分页游标"),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: User = Depends(require_cluster_access("read")),
):
    page = get_pods_page(cluster, namespace=namespace, limit=limit, continue_token=continue_token)
    items = [
        PodInfo(**{**pod, "cluster_id": cluster.id, "cluster_name": cluster.name})
        for pod in page.get("items", [])
    ]
    return PodPageResponse(items=items, continue_token=page.get("continue_token"), limit=limit)


@router.get("/{namespace}/{pod_name}", response_model=PodDetails)
@handle_k8s_operation("获取Pod详情")
async def get_pod_detail(
    namespace: str,
    pod_name: str,
    cluster: Cluster = Depends(get_active_cluster),
    current_user: User = Depends(require_namespace_access("read")),
):
    pod_detail = get_pod_details(cluster, namespace, pod_name)
    if not pod_detail:
        raise HTTPException(status_code=404, detail=f"未找到 Pod {namespace}/{pod_name}")
    return PodDetails(**{**pod_detail, "cluster_id": cluster.id, "cluster_name": cluster.name})


@router.get("/{namespace}/{pod_name}/logs")
@handle_k8s_operation("获取Pod日志")
async def get_pod_log(
    namespace: str,
    pod_name: str,
    container: Optional[str] = Query(None, description="容器名称"),
    tail_lines: Optional[int] = Query(100, description="获取的日志行数"),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: User = Depends(require_namespace_access("read")),
):
    logs = get_pod_logs(cluster, namespace, pod_name, container, tail_lines)
    if logs is None:
        raise HTTPException(status_code=404, detail=f"Pod {namespace}/{pod_name} 日志获取失败")
    return PlainTextResponse(content=logs)


@router.post("/{namespace}/{pod_name}/restart")
async def restart_pod_endpoint(
    namespace: str,
    pod_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: User = Depends(require_namespace_access("manage")),
):
    audit = AuditLogger(db, current_user, cluster_id, "pod", request)
    resource_name = f"{namespace}/{pod_name}"
    details = {"namespace": namespace, "pod_name": pod_name}

    try:
        result = restart_pod(cluster, namespace, pod_name)
        if result:
            audit.log("restart", resource_name, details, success=True)
            return {"message": f"Pod {resource_name} 重启成功"}
        audit.log("restart", resource_name, details, success=False, error_message="重启操作失败")
        raise HTTPException(status_code=500, detail=f"重启 Pod {resource_name} 失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("restart", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"重启 Pod 失败: {str(e)}")


@router.delete("/{namespace}/{pod_name}")
async def delete_pod_endpoint(
    namespace: str,
    pod_name: str,
    force: bool = Query(False, description="是否强制删除Pod"),
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: User = Depends(require_namespace_access("manage")),
):
    audit = AuditLogger(db, current_user, cluster_id, "pod", request)
    resource_name = f"{namespace}/{pod_name}"
    details = {"namespace": namespace, "pod_name": pod_name, "force": force}

    try:
        result = delete_pod(cluster, namespace, pod_name, force)
        if result:
            delete_type = "强制" if force else "正常"
            audit.log("delete", resource_name, details, success=True)
            return {"message": f"Pod {resource_name} {delete_type}删除成功"}
        audit.log("delete", resource_name, details, success=False, error_message="删除操作失败")
        raise HTTPException(status_code=500, detail=f"删除 Pod {resource_name} 失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("delete", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"删除 Pod 失败: {str(e)}")


@router.post("/batch-delete", response_model=BatchOperationResponse)
async def batch_delete_pods_endpoint(
    request_data: BatchOperationRequest,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_no_viewer),
):
    cluster = db.query(Cluster).filter(
        Cluster.id == request_data.cluster_id,
        Cluster.is_active == True
    ).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在或未激活")

    audit = AuditLogger(db, current_user, request_data.cluster_id, "pod", request)

    try:
        pod_list = [{"namespace": pod.namespace, "name": pod.name} for pod in request_data.pods]
        results = batch_delete_pods(cluster, pod_list, request_data.force)

        success_count = sum(1 for r in results.values() if r)
        failure_count = len(results) - success_count

        audit.log(
            "batch_delete",
            f"批量删除 {len(request_data.pods)} 个Pods",
            {"pod_count": len(request_data.pods), "force": request_data.force,
             "success_count": success_count, "failure_count": failure_count, "results": results},
            success=failure_count == 0
        )

        return BatchOperationResponse(results=results, success_count=success_count, failure_count=failure_count)
    except HTTPException:
        raise
    except Exception as e:
        audit.log(
            "batch_delete",
            f"批量删除 {len(request_data.pods)} 个Pods",
            {"pod_count": len(request_data.pods), "force": request_data.force},
            success=False, error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=f"批量删除 Pods 失败: {str(e)}")


@router.post("/batch-restart", response_model=BatchOperationResponse)
async def batch_restart_pods_endpoint(
    request_data: BatchOperationRequest,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_no_viewer),
):
    cluster = db.query(Cluster).filter(
        Cluster.id == request_data.cluster_id,
        Cluster.is_active == True
    ).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在或未激活")

    audit = AuditLogger(db, current_user, request_data.cluster_id, "pod", request)

    try:
        pod_list = [{"namespace": pod.namespace, "name": pod.name} for pod in request_data.pods]
        results = batch_restart_pods(cluster, pod_list)

        success_count = sum(1 for r in results.values() if r)
        failure_count = len(results) - success_count

        audit.log(
            "batch_restart",
            f"批量重启 {len(request_data.pods)} 个Pods",
            {"pod_count": len(request_data.pods), "success_count": success_count,
             "failure_count": failure_count, "results": results},
            success=failure_count == 0
        )

        return BatchOperationResponse(results=results, success_count=success_count, failure_count=failure_count)
    except HTTPException:
        raise
    except Exception as e:
        audit.log(
            "batch_restart",
            f"批量重启 {len(request_data.pods)} 个Pods",
            {"pod_count": len(request_data.pods)},
            success=False, error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=f"批量重启 Pods 失败: {str(e)}")
