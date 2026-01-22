from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Cluster, User
from ..auth import get_current_user, require_resource_management
from ..services.k8s import (
    get_deployment_details, get_deployment_pods, scale_deployment, restart_deployment, delete_deployment,
    get_namespace_deployments, get_deployments_page, update_deployment, get_deployment_yaml, update_deployment_yaml,
    get_deployment_services, get_service_details, update_service, get_service_yaml, update_service_yaml
)
from ..core.logging import get_logger
from .deps import get_active_cluster, get_active_cluster_with_read_access, get_clusters_for_user, AuditLogger, handle_k8s_operation

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


class DeploymentPageResponse(BaseModel):
    items: List[DeploymentInfo]
    continue_token: Optional[str] = None
    limit: int


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
@handle_k8s_operation("获取部署信息")
def get_deployments(
    namespace: Optional[str] = None,
    clusters: list[Cluster] = Depends(get_clusters_for_user),
    current_user: dict = Depends(get_current_user),
):
    """获取部署列表"""
    from ..services.k8s import get_namespaces_info

    all_deployments = []
    for cluster in clusters:
        try:
            if namespace:
                deployments = get_namespace_deployments(cluster, namespace)
            else:
                namespaces = get_namespaces_info(cluster)
                deployments = []
                for ns_info in namespaces:
                    deployments.extend(get_namespace_deployments(cluster, ns_info['name']))

            for deployment in deployments:
                deployment["cluster_id"] = cluster.id
                deployment["cluster_name"] = cluster.name
                deployment["namespace"] = namespace or deployment.get("namespace", "")
                all_deployments.append(DeploymentInfo(**deployment))
        except Exception as e:
            logger.warning("获取集群部署信息失败: cluster=%s error=%s", cluster.name, e)
    return all_deployments


@router.get("/page", response_model=DeploymentPageResponse)
@handle_k8s_operation("获取部署信息")
def get_deployments_page_endpoint(
    namespace: Optional[str] = None,
    limit: int = Query(100, description="每页数量", ge=1, le=1000),
    continue_token: Optional[str] = Query(None, description="分页游标"),
    label_selector: Optional[str] = Query(None, description="K8s label_selector（优先在 APIServer 侧过滤）"),
    field_selector: Optional[str] = Query(None, description="K8s field_selector（优先在 APIServer 侧过滤）"),
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """分页获取部署列表（limit/_continue）"""
    page = get_deployments_page(
        cluster,
        namespace=namespace,
        limit=limit,
        continue_token=continue_token,
        label_selector=label_selector,
        field_selector=field_selector,
    )
    items = [
        DeploymentInfo(**{**deployment, "cluster_id": cluster.id, "cluster_name": cluster.name})
        for deployment in page.get("items", [])
    ]
    return DeploymentPageResponse(items=items, continue_token=page.get("continue_token"), limit=limit)


@router.get("/{namespace}/{deployment_name}", response_model=DeploymentDetails)
@handle_k8s_operation("获取部署详情")
def get_deployment_detail(
    namespace: str,
    deployment_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """获取部署详细信息"""
    deployment_detail = get_deployment_details(cluster, namespace, deployment_name)
    if not deployment_detail:
        raise HTTPException(status_code=404, detail=f"未找到部署 {namespace}/{deployment_name}")
    return DeploymentDetails(**{**deployment_detail, "cluster_id": cluster.id, "cluster_name": cluster.name})


@router.get("/{namespace}/{deployment_name}/pods", response_model=List[DeploymentPod])
@handle_k8s_operation("获取部署Pods")
def get_deployment_pods_endpoint(
    namespace: str,
    deployment_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """获取部署管理的Pods"""
    return get_deployment_pods(cluster, namespace, deployment_name)


@router.put("/{namespace}/{deployment_name}/scale")
def scale_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    scale_request: ScaleRequest,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(require_resource_management),
):
    """扩容/缩容部署"""
    if scale_request.replicas < 0:
        raise HTTPException(status_code=400, detail="副本数不能为负数")

    audit = AuditLogger(db, current_user, cluster_id, "deployment", request)
    resource_name = f"{namespace}/{deployment_name}"
    details = {"namespace": namespace, "deployment_name": deployment_name, "replicas": scale_request.replicas}

    try:
        if scale_deployment(cluster, namespace, deployment_name, scale_request.replicas):
            audit.log("scale", resource_name, details, success=True)
            return {"message": f"部署 {resource_name} 已调整为 {scale_request.replicas} 个副本"}
        audit.log("scale", resource_name, details, success=False, error_message="调整副本数失败")
        raise HTTPException(status_code=500, detail="调整部署副本数失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("scale", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"调整部署副本数失败: {str(e)}")


@router.post("/{namespace}/{deployment_name}/restart")
def restart_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(require_resource_management),
):
    """重启部署"""
    audit = AuditLogger(db, current_user, cluster_id, "deployment", request)
    resource_name = f"{namespace}/{deployment_name}"
    details = {"namespace": namespace, "deployment_name": deployment_name}

    try:
        if restart_deployment(cluster, namespace, deployment_name):
            audit.log("restart", resource_name, details, success=True)
            return {"message": f"部署 {resource_name} 重启成功"}
        audit.log("restart", resource_name, details, success=False, error_message="重启失败")
        raise HTTPException(status_code=500, detail="重启部署失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("restart", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"重启部署失败: {str(e)}")


@router.delete("/{namespace}/{deployment_name}")
def delete_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(require_resource_management),
):
    """删除部署"""
    audit = AuditLogger(db, current_user, cluster_id, "deployment", request)
    resource_name = f"{namespace}/{deployment_name}"
    details = {"namespace": namespace, "deployment_name": deployment_name}

    try:
        if delete_deployment(cluster, namespace, deployment_name):
            audit.log("delete", resource_name, details, success=True)
            return {"message": f"部署 {resource_name} 删除成功"}
        audit.log("delete", resource_name, details, success=False, error_message="删除失败")
        raise HTTPException(status_code=500, detail="删除部署失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("delete", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"删除部署失败: {str(e)}")


@router.patch("/{namespace}/{deployment_name}")
def update_deployment_endpoint(
    namespace: str,
    deployment_name: str,
    update_request: DeploymentUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(get_current_user),
):
    """更新部署"""
    audit = AuditLogger(db, current_user, cluster_id, "deployment", request)
    updates = update_request.dict(exclude_unset=True)
    resource_name = f"{namespace}/{deployment_name}"
    details = {"namespace": namespace, "deployment_name": deployment_name, "updates": list(updates.keys())}

    try:
        if update_deployment(cluster, namespace, deployment_name, updates):
            audit.log("update", resource_name, details, success=True)
            return {"message": f"部署 {resource_name} 更新成功"}
        audit.log("update", resource_name, details, success=False, error_message="更新失败")
        raise HTTPException(status_code=500, detail="更新部署失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("update", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"更新部署失败: {str(e)}")


@router.get("/{namespace}/{deployment_name}/yaml")
@handle_k8s_operation("获取部署YAML")
def get_deployment_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """获取部署的YAML配置"""
    yaml_content = get_deployment_yaml(cluster, namespace, deployment_name)
    if not yaml_content:
        raise HTTPException(status_code=404, detail="获取部署YAML失败")
    return {"yaml": yaml_content}


@router.put("/{namespace}/{deployment_name}/yaml")
def update_deployment_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    yaml_request: YamlUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(require_resource_management),
):
    """通过YAML更新部署"""
    audit = AuditLogger(db, current_user, cluster_id, "deployment", request)
    resource_name = f"{namespace}/{deployment_name}"
    details = {"namespace": namespace, "deployment_name": deployment_name}

    try:
        if update_deployment_yaml(cluster, namespace, deployment_name, yaml_request.yaml_content):
            audit.log("update_yaml", resource_name, details, success=True)
            return {"message": f"部署 {resource_name} YAML更新成功"}
        audit.log("update_yaml", resource_name, details, success=False, error_message="YAML更新失败")
        raise HTTPException(status_code=500, detail="更新部署YAML失败")
    except HTTPException:
        raise
    except Exception as e:
        audit.log("update_yaml", resource_name, details, success=False, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"更新部署YAML失败: {str(e)}")


@router.get("/{namespace}/{deployment_name}/services", response_model=List[dict])
@handle_k8s_operation("获取部署服务")
def get_deployment_services_endpoint(
    namespace: str,
    deployment_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """获取部署关联的服务"""
    return get_deployment_services(cluster, namespace, deployment_name)


@router.get("/{namespace}/{deployment_name}/services/{service_name}", response_model=ServiceDetails)
@handle_k8s_operation("获取服务详情")
def get_service_detail_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """获取服务详细信息"""
    service_detail = get_service_details(cluster, namespace, service_name)
    if not service_detail:
        raise HTTPException(status_code=404, detail=f"未找到服务 {namespace}/{service_name}")
    return ServiceDetails(**service_detail)


@router.patch("/{namespace}/{deployment_name}/services/{service_name}")
@handle_k8s_operation("更新服务")
def update_service_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    update_request: ServiceUpdateRequest,
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(get_current_user),
):
    """更新服务"""
    updates = update_request.dict(exclude_unset=True)
    if not update_service(cluster, namespace, service_name, updates):
        raise HTTPException(status_code=500, detail="更新服务失败")
    return {"message": f"服务 {namespace}/{service_name} 更新成功"}


@router.get("/{namespace}/{deployment_name}/services/{service_name}/yaml")
@handle_k8s_operation("获取服务YAML")
def get_service_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: dict = Depends(get_current_user),
):
    """获取服务的YAML配置"""
    yaml_content = get_service_yaml(cluster, namespace, service_name)
    if not yaml_content:
        raise HTTPException(status_code=404, detail="获取服务YAML失败")
    return {"yaml": yaml_content}


@router.put("/{namespace}/{deployment_name}/services/{service_name}/yaml")
@handle_k8s_operation("更新服务YAML")
def update_service_yaml_endpoint(
    namespace: str,
    deployment_name: str,
    service_name: str,
    yaml_request: YamlUpdateRequest,
    cluster: Cluster = Depends(get_active_cluster),
    current_user: dict = Depends(require_resource_management),
):
    """通过YAML更新服务"""
    result = update_service_yaml(cluster, namespace, service_name, yaml_request.yaml_content)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message") or "更新服务YAML失败")
    return {"message": result.get("message") or f"服务 {namespace}/{service_name} YAML更新成功"}
