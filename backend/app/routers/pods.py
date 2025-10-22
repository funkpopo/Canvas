from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..k8s_client import get_pods_info, get_pod_details, get_pod_logs, restart_pod, delete_pod, batch_delete_pods, batch_restart_pods
from ..audit import log_action
from pydantic import BaseModel

router = APIRouter()


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


class PodLogs(BaseModel):
  logs: str
  container_name: Optional[str] = None


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


@router.get("/", response_model=List[PodInfo])
@router.get("", response_model=List[PodInfo])
async def get_pods(
  namespace: Optional[str] = None,
  cluster_id: Optional[int] = None,
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

    all_pods = []
    for cluster in clusters:
      try:
        pods = get_pods_info(cluster, namespace)
        if pods:
          for pod in pods:
            pod["cluster_id"] = cluster.id
            pod["cluster_name"] = cluster.name
            # 确保所有必需字段都存在
            all_pods.append(PodInfo(**pod))
      except Exception as e:
        print(f"获取集群 {cluster.name} Pod信息失败: {e}")
        continue

    return all_pods
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"获取Pod信息失败: {str(e)}")


@router.get("/{namespace}/{pod_name}", response_model=PodDetails)
async def get_pod_detail(
  namespace: str,
  pod_name: str,
  cluster_id: int = Query(..., description="集群ID"),
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  try:
    # 验证cluster_id参数
    if not isinstance(cluster_id, int) or cluster_id <= 0:
      raise HTTPException(status_code=422, detail="无效的集群ID")

    cluster = (
      db.query(Cluster)
      .filter(Cluster.id == cluster_id, Cluster.is_active == True)
      .first()
    )
    if not cluster:
      raise HTTPException(status_code=404, detail="集群不存在或未激活")

    pod_detail = get_pod_details(cluster, namespace, pod_name)
    if pod_detail:
      pod_detail["cluster_id"] = cluster.id
      pod_detail["cluster_name"] = cluster.name
      return PodDetails(**pod_detail)
    else:
      raise HTTPException(status_code=404, detail=f"未找到 Pod {namespace}/{pod_name}")
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"获取Pod详情失败: {str(e)}")


@router.get("/{namespace}/{pod_name}/logs")
async def get_pod_log(
  namespace: str,
  pod_name: str,
  cluster_id: Optional[int] = Query(None, description="集群ID；为空时使用唯一活跃集群"),
  container: Optional[str] = Query(None, description="容器名称"),
  tail_lines: Optional[int] = Query(100, description="获取的日志行数"),
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  try:
    # 解析集群
    cluster: Optional[Cluster] = None
    if cluster_id is not None:
      cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.is_active == True)
        .first()
      )
      if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在或未激活")
    else:
      active_clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
      if len(active_clusters) == 1:
        cluster = active_clusters[0]
      elif len(active_clusters) == 0:
        raise HTTPException(status_code=404, detail="没有可用的活跃集群")
      else:
        raise HTTPException(status_code=400, detail="存在多个活跃集群，请指定 cluster_id")

    logs = get_pod_logs(cluster, namespace, pod_name, container, tail_lines)
    if logs is not None:
      return PlainTextResponse(content=logs)
    else:
      raise HTTPException(status_code=404, detail=f"Pod {namespace}/{pod_name} 日志获取失败")
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"获取 Pod 日志失败: {str(e)}")


@router.post("/{namespace}/{pod_name}/restart")
async def restart_pod_endpoint(
  namespace: str,
  pod_name: str,
  cluster_id: int = Query(..., description="集群ID"),
  request: Request = None,
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  cluster = None
  try:
    cluster = (
      db.query(Cluster)
      .filter(Cluster.id == cluster_id, Cluster.is_active == True)
      .first()
    )
    if not cluster:
      raise HTTPException(status_code=404, detail="集群不存在或未激活")

    result = restart_pod(cluster, namespace, pod_name)
    if result:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=cluster_id,
        action="restart",
        resource_type="pod",
        resource_name=f"{namespace}/{pod_name}",
        details={"namespace": namespace, "pod_name": pod_name},
        success=True,
        request=request
      )
      return {"message": f"Pod {namespace}/{pod_name} 重启成功"}
    else:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=cluster_id,
        action="restart",
        resource_type="pod",
        resource_name=f"{namespace}/{pod_name}",
        details={"namespace": namespace, "pod_name": pod_name},
        success=False,
        error_message="重启操作失败",
        request=request
      )
      raise HTTPException(status_code=500, detail=f"重启 Pod {namespace}/{pod_name} 失败")
  except HTTPException:
    raise
  except Exception as e:
    if cluster:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=cluster_id,
        action="restart",
        resource_type="pod",
        resource_name=f"{namespace}/{pod_name}",
        details={"namespace": namespace, "pod_name": pod_name},
        success=False,
        error_message=str(e),
        request=request
      )
    raise HTTPException(status_code=500, detail=f"重启 Pod 失败: {str(e)}")


@router.delete("/{namespace}/{pod_name}")
async def delete_pod_endpoint(
  namespace: str,
  pod_name: str,
  cluster_id: int = Query(..., description="集群ID"),
  force: bool = Query(False, description="是否强制删除Pod（设置grace_period_seconds=0）"),
  request: Request = None,
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  cluster = None
  try:
    cluster = (
      db.query(Cluster)
      .filter(Cluster.id == cluster_id, Cluster.is_active == True)
      .first()
    )
    if not cluster:
      raise HTTPException(status_code=404, detail="集群不存在或未激活")

    result = delete_pod(cluster, namespace, pod_name, force)
    if result:
      delete_type = "强制" if force else "正常"
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=cluster_id,
        action="delete",
        resource_type="pod",
        resource_name=f"{namespace}/{pod_name}",
        details={"namespace": namespace, "pod_name": pod_name, "force": force},
        success=True,
        request=request
      )
      return {"message": f"Pod {namespace}/{pod_name} {delete_type}删除成功"}
    else:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=cluster_id,
        action="delete",
        resource_type="pod",
        resource_name=f"{namespace}/{pod_name}",
        details={"namespace": namespace, "pod_name": pod_name, "force": force},
        success=False,
        error_message="删除操作失败",
        request=request
      )
      raise HTTPException(status_code=500, detail=f"删除 Pod {namespace}/{pod_name} 失败")
  except HTTPException:
    raise
  except Exception as e:
    if cluster:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=cluster_id,
        action="delete",
        resource_type="pod",
        resource_name=f"{namespace}/{pod_name}",
        details={"namespace": namespace, "pod_name": pod_name, "force": force},
        success=False,
        error_message=str(e),
        request=request
      )
    raise HTTPException(status_code=500, detail=f"删除 Pod 失败: {str(e)}")


@router.post("/batch-delete", response_model=BatchOperationResponse)
async def batch_delete_pods_endpoint(
  request_data: BatchOperationRequest,
  request: Request = None,
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  cluster = None
  try:
    cluster = (
      db.query(Cluster)
      .filter(Cluster.id == request_data.cluster_id, Cluster.is_active == True)
      .first()
    )
    if not cluster:
      raise HTTPException(status_code=404, detail="集群不存在或未激活")

    pod_list = [{"namespace": pod.namespace, "name": pod.name} for pod in request_data.pods]
    results = batch_delete_pods(cluster, pod_list, request_data.force)

    success_count = sum(1 for result in results.values() if result)
    failure_count = len(results) - success_count

    # 记录审计日志
    log_action(
      db=db,
      user_id=current_user.id,
      cluster_id=request_data.cluster_id,
      action="batch_delete",
      resource_type="pod",
      resource_name=f"批量删除 {len(request_data.pods)} 个Pods",
      details={
        "pod_count": len(request_data.pods),
        "force": request_data.force,
        "success_count": success_count,
        "failure_count": failure_count,
        "results": results
      },
      success=failure_count == 0,
      request=request
    )

    return BatchOperationResponse(
      results=results,
      success_count=success_count,
      failure_count=failure_count
    )
  except HTTPException:
    raise
  except Exception as e:
    if cluster:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=request_data.cluster_id,
        action="batch_delete",
        resource_type="pod",
        resource_name=f"批量删除 {len(request_data.pods)} 个Pods",
        details={
          "pod_count": len(request_data.pods),
          "force": request_data.force
        },
        success=False,
        error_message=str(e),
        request=request
      )
    raise HTTPException(status_code=500, detail=f"批量删除 Pods 失败: {str(e)}")


@router.post("/batch-restart", response_model=BatchOperationResponse)
async def batch_restart_pods_endpoint(
  request_data: BatchOperationRequest,
  request: Request = None,
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  cluster = None
  try:
    cluster = (
      db.query(Cluster)
      .filter(Cluster.id == request_data.cluster_id, Cluster.is_active == True)
      .first()
    )
    if not cluster:
      raise HTTPException(status_code=404, detail="集群不存在或未激活")

    pod_list = [{"namespace": pod.namespace, "name": pod.name} for pod in request_data.pods]
    results = batch_restart_pods(cluster, pod_list)

    success_count = sum(1 for result in results.values() if result)
    failure_count = len(results) - success_count

    # 记录审计日志
    log_action(
      db=db,
      user_id=current_user.id,
      cluster_id=request_data.cluster_id,
      action="batch_restart",
      resource_type="pod",
      resource_name=f"批量重启 {len(request_data.pods)} 个Pods",
      details={
        "pod_count": len(request_data.pods),
        "success_count": success_count,
        "failure_count": failure_count,
        "results": results
      },
      success=failure_count == 0,
      request=request
    )

    return BatchOperationResponse(
      results=results,
      success_count=success_count,
      failure_count=failure_count
    )
  except HTTPException:
    raise
  except Exception as e:
    if cluster:
      log_action(
        db=db,
        user_id=current_user.id,
        cluster_id=request_data.cluster_id,
        action="batch_restart",
        resource_type="pod",
        resource_name=f"批量重启 {len(request_data.pods)} 个Pods",
        details={"pod_count": len(request_data.pods)},
        success=False,
        error_message=str(e),
        request=request
      )
    raise HTTPException(status_code=500, detail=f"批量重启 Pods 失败: {str(e)}")

