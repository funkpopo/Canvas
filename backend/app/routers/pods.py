from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..kubernetes import get_pods_info, get_pod_details, get_pod_logs, restart_pod, delete_pod
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


@router.get("/", response_model=List[PodInfo])
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
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
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
      return {"message": f"Pod {namespace}/{pod_name} 重启成功"}
    else:
      raise HTTPException(status_code=500, detail=f"重启 Pod {namespace}/{pod_name} 失败")
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"重启 Pod 失败: {str(e)}")


@router.delete("/{namespace}/{pod_name}")
async def delete_pod_endpoint(
  namespace: str,
  pod_name: str,
  cluster_id: int = Query(..., description="集群ID"),
  db: Session = Depends(get_db),
  current_user: dict = Depends(get_current_user),
):
  try:
    cluster = (
      db.query(Cluster)
      .filter(Cluster.id == cluster_id, Cluster.is_active == True)
      .first()
    )
    if not cluster:
      raise HTTPException(status_code=404, detail="集群不存在或未激活")

    result = delete_pod(cluster, namespace, pod_name)
    if result:
      return {"message": f"Pod {namespace}/{pod_name} 删除成功"}
    else:
      raise HTTPException(status_code=500, detail=f"删除 Pod {namespace}/{pod_name} 失败")
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"删除 Pod 失败: {str(e)}")

