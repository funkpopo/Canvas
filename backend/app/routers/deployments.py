from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster
from ..auth import get_current_user, require_resource_management, check_cluster_access, get_viewer_allowed_cluster_ids
from ..services.k8s import (
    get_deployment_details, get_deployment_pods, scale_deployment, restart_deployment, delete_deployment,
    get_namespace_deployments, update_deployment, get_deployment_yaml, update_deployment_yaml,
    get_deployment_services, get_service_details, update_service, get_service_yaml, update_service_yaml
)
from ..audit import log_action
from ..core.logging import get_logger
from pydantic import BaseModel

router = APIRouter()

logger = get_logger(__name__)

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

class DeploymentUpdateRequest(BaseModel):
    replicas: Optional[int] = None
    containers: Optional[List[dict]] = None
    labels: Optional[dict] = None
    strategy: Optional[dict] = None
    env_vars: Optional[List[dict]] = None
    resources: Optional[List[dict]] = None
    node_selector: Optional[dict] = None
    affinity: Optional[dict] = None
    tolerations: Optional[List[dict]] = None
    dns_policy: Optional[str] = None
    dns_config: Optional[dict] = None
    volumes: Optional[List[dict]] = None
    volume_mounts: Optional[List[dict]] = None
    security_context: Optional[dict] = None

class YamlUpdateRequest(BaseModel):
    yaml_content: str

class ServiceUpdateRequest(BaseModel):
    labels: Optional[dict] = None
    selector: Optional[dict] = None
    ports: Optional[List[dict]] = None
    type: Optional[str] = None
    session_affinity: Optional[str] = None
    external_traffic_policy: Optional[str] = None

class ServiceDetails(BaseModel):
    name: str
    namespace: str
    type: str
    cluster_ip: Optional[str]
    external_ip: Optional[str]
    ports: List[dict]
    selector: dict
    labels: dict
    annotations: dict
    age: str
    session_affinity: Optional[str]
    external_traffic_policy: Optional[str]

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
            if getattr(current_user, "role", None) == "viewer":
                if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                    raise HTTPException(status_code=403, detail="需要集群 read 权限")
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            if getattr(current_user, "role", None) == "viewer":
                allowed_ids = get_viewer_allowed_cluster_ids(db, current_user)
                if not allowed_ids:
                    return []
                clusters = db.query(Cluster).filter(Cluster.is_active == True, Cluster.id.in_(allowed_ids)).all()
            else:
                clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_deployments = []
        for cluster in clusters:
            try:
                if namespace:
                    deployments = get_namespace_deployments(cluster, namespace)
                else:
                    # 获取所有命名空间的部署
                    from ..services.k8s import get_namespaces_info
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
                logger.warning("获取集群部署信息失败: cluster=%s error=%s", cluster.name, e)
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

        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")

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

        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")

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
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_resource_management),
):
    """扩容/缩容部署"""
    cluster = None
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
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="scale",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name, "replicas": scale_request.replicas},
                success=True,
                request=request
            )
            return {"message": f"部署 {namespace}/{deployment_name} 已调整为 {scale_request.replicas} 个副本"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="scale",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name, "replicas": scale_request.replicas},
                success=False,
                error_message="调整副本数失败",
                request=request
            )
            raise HTTPException(status_code=500, detail=f"调整部署副本数失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="scale",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name, "replicas": scale_request.replicas},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"调整部署副本数失败: {str(e)}")

@router.post("/{namespace}/{deployment_name}/restart")
async def restart_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_resource_management),
):
    """重启部署"""
    cluster = None
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = restart_deployment(cluster, namespace, deployment_name)
        if result:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="restart",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=True,
                request=request
            )
            return {"message": f"部署 {namespace}/{deployment_name} 重启成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="restart",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=False,
                error_message="重启失败",
                request=request
            )
            raise HTTPException(status_code=500, detail=f"重启部署失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="restart",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"重启部署失败: {str(e)}")

@router.delete("/{namespace}/{deployment_name}")
async def delete_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_resource_management),
):
    """删除部署"""
    cluster = None
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_deployment(cluster, namespace, deployment_name)
        if result:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=True,
                request=request
            )
            return {"message": f"部署 {namespace}/{deployment_name} 删除成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=False,
                error_message="删除失败",
                request=request
            )
            raise HTTPException(status_code=500, detail=f"删除部署失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="delete",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"删除部署失败: {str(e)}")

@router.patch("/{namespace}/{deployment_name}")
async def update_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    update_request: DeploymentUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """更新部署"""
    cluster = None
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 转换为字典格式传递给kubernetes函数
        updates = update_request.dict(exclude_unset=True)
        result = update_deployment(cluster, namespace, deployment_name, updates)
        if result:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="update",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name, "updates": list(updates.keys())},
                success=True,
                request=request
            )
            return {"message": f"部署 {namespace}/{deployment_name} 更新成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="update",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name, "updates": list(updates.keys())},
                success=False,
                error_message="更新失败",
                request=request
            )
            raise HTTPException(status_code=500, detail="更新部署失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster:
            updates = update_request.dict(exclude_unset=True)
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="update",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name, "updates": list(updates.keys())},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"更新部署失败: {str(e)}")

@router.get("/{namespace}/{deployment_name}/yaml")
async def get_deployment_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: str = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取部署的YAML配置"""
    try:
        try:
            cluster_id_int = int(cluster_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="集群ID必须是有效的整数")

        if cluster_id_int <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id_int, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id_int, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = get_deployment_yaml(cluster, namespace, deployment_name)
        if yaml_content:
            return {"yaml": yaml_content}
        else:
            raise HTTPException(status_code=404, detail="获取部署YAML失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取部署YAML失败: {str(e)}")

@router.put("/{namespace}/{deployment_name}/yaml")
async def update_deployment_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    yaml_request: YamlUpdateRequest,
    cluster_id: str = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_resource_management),
):
    """通过YAML更新部署"""
    cluster = None
    cluster_id_int = None
    try:
        try:
            cluster_id_int = int(cluster_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="集群ID必须是有效的整数")

        if cluster_id_int <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id_int, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = update_deployment_yaml(cluster, namespace, deployment_name, yaml_request.yaml_content)
        if result:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id_int,
                action="update_yaml",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=True,
                request=request
            )
            return {"message": f"部署 {namespace}/{deployment_name} YAML更新成功"}
        else:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id_int,
                action="update_yaml",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=False,
                error_message="YAML更新失败",
                request=request
            )
            raise HTTPException(status_code=500, detail="更新部署YAML失败")
    except HTTPException:
        raise
    except Exception as e:
        if cluster and cluster_id_int:
            log_action(
                db=db,
                user_id=current_user.id,
                cluster_id=cluster_id_int,
                action="update_yaml",
                resource_type="deployment",
                resource_name=f"{namespace}/{deployment_name}",
                details={"namespace": namespace, "deployment_name": deployment_name},
                success=False,
                error_message=str(e),
                request=request
            )
        raise HTTPException(status_code=500, detail=f"更新部署YAML失败: {str(e)}")

@router.get("/{namespace}/{deployment_name}/services", response_model=List[dict])
async def get_deployment_services_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取部署关联的服务"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        services = get_deployment_services(cluster, namespace, deployment_name)
        return services
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取部署服务失败: {str(e)}")

@router.get("/{namespace}/{deployment_name}/services/{service_name}", response_model=ServiceDetails)
async def get_service_detail_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取服务详细信息"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        service_detail = get_service_details(cluster, namespace, service_name)
        if service_detail:
            return ServiceDetails(**service_detail)
        else:
            raise HTTPException(status_code=404, detail=f"未找到服务 {namespace}/{service_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取服务详情失败: {str(e)}")

@router.patch("/{namespace}/{deployment_name}/services/{service_name}")
async def update_service_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    update_request: ServiceUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """更新服务"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 转换为字典格式传递给kubernetes函数
        updates = update_request.dict(exclude_unset=True)
        result = update_service(cluster, namespace, service_name, updates)
        if result:
            return {"message": f"服务 {namespace}/{service_name} 更新成功"}
        else:
            raise HTTPException(status_code=500, detail="更新服务失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新服务失败: {str(e)}")

@router.get("/{namespace}/{deployment_name}/services/{service_name}/yaml")
async def get_service_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取服务的YAML配置"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        if getattr(current_user, "role", None) == "viewer":
            if not check_cluster_access(db, current_user, cluster_id, required_level="read"):
                raise HTTPException(status_code=403, detail="需要集群 read 权限")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = get_service_yaml(cluster, namespace, service_name)
        if yaml_content:
            return {"yaml": yaml_content}
        else:
            raise HTTPException(status_code=404, detail="获取服务YAML失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取服务YAML失败: {str(e)}")

@router.put("/{namespace}/{deployment_name}/services/{service_name}/yaml")
async def update_service_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    yaml_request: YamlUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_resource_management),
):
    """通过YAML更新服务"""
    try:
        if not isinstance(cluster_id, int) or cluster_id <= 0:
            raise HTTPException(status_code=422, detail="无效的集群ID")

        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = update_service_yaml(cluster, namespace, service_name, yaml_request.yaml_content)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("message") or "更新服务YAML失败")
        return {"message": result.get("message") or f"服务 {namespace}/{service_name} YAML更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新服务YAML失败: {str(e)}")
