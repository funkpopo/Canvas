from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user
from ..kubernetes import get_deployment_details, get_deployment_pods, scale_deployment, restart_deployment, delete_deployment, get_namespace_deployments
from pydantic import BaseModel

router = APIRouter()

class DeploymentInfo(BaseModel):
    name: str
    namespace: str
    replicas: int
    ready_replicas: int
    available_replicas: int
    updated_replicas: int
    age: str
    images: List[str]
    labels: dict
    status: str
    cluster_id: int
    cluster_name: str

class DeploymentDetails(BaseModel):
    name: str
    namespace: str
    replicas: int
    ready_replicas: int
    available_replicas: int
    updated_replicas: int
    unavailable_replicas: int
    age: str
    creation_timestamp: str
    strategy: dict
    selector: dict
    labels: dict
    annotations: dict
    conditions: List[dict]
    spec: dict
    status: dict
    cluster_id: int
    cluster_name: str

class DeploymentPod(BaseModel):
    name: str
    namespace: str
    status: str
    node_name: Optional[str]
    age: str
    restarts: int
    ready_containers: str
    labels: dict

class ScaleRequest(BaseModel):
    replicas: int

@router.get("/", response_model=List[DeploymentInfo])
@router.get("", response_model=List[DeploymentInfo])
async def get_deployments(
    namespace: Optional[str] = None,
    cluster_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取部署列表"""
    try:
        if cluster_id:
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_deployments = []
        for cluster in clusters:
            try:
                if namespace:
                    deployments = get_namespace_deployments(cluster, namespace)
                else:
                    # 获取所有命名空间的部署
                    from ..kubernetes import get_namespaces_info
                    namespaces = get_namespaces_info(cluster)
                    deployments = []
                    for ns_info in namespaces:
                        ns_deployments = get_namespace_deployments(cluster, ns_info['name'])
                        deployments.extend(ns_deployments)

                if deployments:
                    for deployment in deployments:
                        deployment["cluster_id"] = cluster.id
                        deployment["cluster_name"] = cluster.name
                        deployment["namespace"] = namespace or deployment.get("namespace", "")
                        all_deployments.append(DeploymentInfo(**deployment))
            except Exception as e:
                print(f"获取集群 {cluster.name} 部署信息失败: {e}")
                continue

        return all_deployments
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取部署信息失败: {str(e)}")

@router.get("/{namespace}/{deployment_name}", response_model=DeploymentDetails)
async def get_deployment_detail(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取部署详细信息"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        deployment_detail = get_deployment_details(cluster, namespace, deployment_name)
        if deployment_detail:
            deployment_detail["cluster_id"] = cluster.id
            deployment_detail["cluster_name"] = cluster.name
            return DeploymentDetails(**deployment_detail)
        else:
            raise HTTPException(status_code=404, detail=f"未找到部署 {namespace}/{deployment_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取部署详情失败: {str(e)}")

@router.get("/{namespace}/{deployment_name}/pods", response_model=List[DeploymentPod])
async def get_deployment_pods_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取部署管理的Pods"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        pods = get_deployment_pods(cluster, namespace, deployment_name)
        return pods
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取部署Pods失败: {str(e)}")

@router.put("/{namespace}/{deployment_name}/scale")
async def scale_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    scale_request: ScaleRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """扩容/缩容部署"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        if scale_request.replicas < 0:
            raise HTTPException(status_code=400, detail="副本数不能为负数")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = scale_deployment(cluster, namespace, deployment_name, scale_request.replicas)
        if result:
            return {"message": f"部署 {namespace}/{deployment_name} 已调整为 {scale_request.replicas} 个副本"}
        else:
            raise HTTPException(status_code=500, detail=f"调整部署副本数失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"调整部署副本数失败: {str(e)}")

@router.post("/{namespace}/{deployment_name}/restart")
async def restart_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """重启部署"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = restart_deployment(cluster, namespace, deployment_name)
        if result:
            return {"message": f"部署 {namespace}/{deployment_name} 重启成功"}
        else:
            raise HTTPException(status_code=500, detail=f"重启部署失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重启部署失败: {str(e)}")

@router.delete("/{namespace}/{deployment_name}")
async def delete_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """删除部署"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_deployment(cluster, namespace, deployment_name)
        if result:
            return {"message": f"部署 {namespace}/{deployment_name} 删除成功"}
        else:
            raise HTTPException(status_code=500, detail=f"删除部署失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除部署失败: {str(e)}")
