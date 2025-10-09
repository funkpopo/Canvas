from fastapi import APIRouter, Depends, HTTPException
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

class PodLogs(BaseModel):
    logs: str
    container_name: Optional[str] = None

@router.get("/", response_model=List[PodInfo])
async def get_pods(
    namespace: Optional[str] = None,
    cluster_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Pod列表"""
    try:
        if cluster_id:
            # 获取指定集群的Pods
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            # 获取所有活跃集群的Pods
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_pods = []
        for cluster in clusters:
            try:
                pods = get_pods_info(cluster, namespace)
                # 添加集群标识
                for pod in pods:
                    pod['cluster_id'] = cluster.id
                    pod['cluster_name'] = cluster.name
                all_pods.extend(pods)
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
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Pod详情"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        pod_detail = get_pod_details(cluster, namespace, pod_name)
        if pod_detail:
            pod_detail['cluster_id'] = cluster.id
            pod_detail['cluster_name'] = cluster.name
            return pod_detail
        else:
            raise HTTPException(status_code=404, detail=f"Pod {namespace}/{pod_name} 未找到")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Pod详情失败: {str(e)}")

@router.get("/{namespace}/{pod_name}/logs", response_model=PodLogs)
async def get_pod_log(
    namespace: str,
    pod_name: str,
    cluster_id: int,
    container: Optional[str] = None,
    tail_lines: Optional[int] = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Pod日志"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        logs = get_pod_logs(cluster, namespace, pod_name, container, tail_lines)
        if logs is not None:
            return {"logs": logs, "container_name": container}
        else:
            raise HTTPException(status_code=404, detail=f"Pod {namespace}/{pod_name} 日志获取失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Pod日志失败: {str(e)}")

@router.post("/{namespace}/{pod_name}/restart")
async def restart_pod_endpoint(
    namespace: str,
    pod_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """重启Pod"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = restart_pod(cluster, namespace, pod_name)
        if result:
            return {"message": f"Pod {namespace}/{pod_name} 重启成功"}
        else:
            raise HTTPException(status_code=500, detail=f"重启Pod {namespace}/{pod_name} 失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重启Pod失败: {str(e)}")

@router.delete("/{namespace}/{pod_name}")
async def delete_pod_endpoint(
    namespace: str,
    pod_name: str,
    cluster_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除Pod"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_pod(cluster, namespace, pod_name)
        if result:
            return {"message": f"Pod {namespace}/{pod_name} 删除成功"}
        else:
            raise HTTPException(status_code=500, detail=f"删除Pod {namespace}/{pod_name} 失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除Pod失败: {str(e)}")
