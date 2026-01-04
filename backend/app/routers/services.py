from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import require_read_only, require_resource_management
from ..services.k8s import (
    get_namespace_services, create_service, delete_service,
    get_service_details, update_service, get_service_yaml, update_service_yaml
)
from .deps import get_active_cluster, get_active_cluster_with_read_access, get_clusters_for_user, handle_k8s_operation

router = APIRouter()


class ServiceInfo(BaseModel):
    name: str
    namespace: str
    type: str
    cluster_ip: str
    external_ip: Optional[str] = None
    ports: List[dict]
    selector: dict
    labels: dict
    age: str
    cluster_name: str
    cluster_id: int


class ServiceCreate(BaseModel):
    name: str
    namespace: str
    type: Optional[str] = "ClusterIP"
    selector: dict = {}
    ports: List[dict] = []
    labels: Optional[dict] = None
    annotations: Optional[dict] = None
    cluster_ip: Optional[str] = None
    load_balancer_ip: Optional[str] = None
    external_traffic_policy: Optional[str] = None
    session_affinity: Optional[str] = None
    session_affinity_config: Optional[dict] = None


class ServiceUpdate(BaseModel):
    type: Optional[str] = None
    selector: Optional[dict] = None
    ports: Optional[List[dict]] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None
    cluster_ip: Optional[str] = None
    load_balancer_ip: Optional[str] = None
    external_traffic_policy: Optional[str] = None
    session_affinity: Optional[str] = None
    session_affinity_config: Optional[dict] = None


@router.get("/", response_model=List[ServiceInfo])
@handle_k8s_operation("获取服务列表")
async def get_services(
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    clusters: list[Cluster] = Depends(get_clusters_for_user),
    current_user: User = Depends(require_read_only)
):
    """获取服务列表"""
    if not namespace:
        raise HTTPException(status_code=400, detail="必须指定命名空间")

    services = []
    for cluster in clusters:
        services.extend(get_namespace_services(cluster, namespace))
    return services


@router.get("/{namespace}/{service_name}", response_model=ServiceInfo)
@handle_k8s_operation("获取服务详情")
async def get_service(
    namespace: str,
    service_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: User = Depends(require_read_only)
):
    """获取服务详细信息"""
    service = get_service_details(cluster, namespace, service_name)
    if not service:
        raise HTTPException(status_code=404, detail="服务不存在")
    return service


@router.post("/", response_model=dict)
async def create_new_service(
    service_data: ServiceCreate,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """创建服务"""
    try:
        service_dict = service_data.dict()

        if not create_service(cluster, service_data.namespace, service_dict):
            raise HTTPException(status_code=500, detail="创建服务失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="Service",
            resource_name=f"{service_data.namespace}/{service_data.name}",
            cluster_id=cluster.id,
            details=f"创建服务 {service_data.name} 在命名空间 {service_data.namespace}"
        ))
        db.commit()
        return {"message": "服务创建成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建服务失败: {str(e)}")


@router.put("/{namespace}/{service_name}", response_model=dict)
async def update_existing_service(
    namespace: str,
    service_name: str,
    updates: ServiceUpdate,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """更新服务"""
    try:
        update_dict = {k: v for k, v in updates.dict().items() if v is not None}

        if not update_service(cluster, namespace, service_name, update_dict):
            raise HTTPException(status_code=500, detail="更新服务失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Service",
            resource_name=f"{namespace}/{service_name}",
            cluster_id=cluster.id,
            details=f"更新服务 {service_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": "服务更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新服务失败: {str(e)}")


@router.delete("/{namespace}/{service_name}", response_model=dict)
async def delete_existing_service(
    namespace: str,
    service_name: str,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """删除服务"""
    try:
        if not delete_service(cluster, namespace, service_name):
            raise HTTPException(status_code=500, detail="删除服务失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="Service",
            resource_name=f"{namespace}/{service_name}",
            cluster_id=cluster.id,
            details=f"删除服务 {service_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": "服务删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除服务失败: {str(e)}")


@router.get("/{namespace}/{service_name}/yaml", response_model=dict)
@handle_k8s_operation("获取YAML配置")
async def get_service_yaml_config(
    namespace: str,
    service_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: User = Depends(require_read_only)
):
    """获取服务的YAML配置"""
    yaml_content = get_service_yaml(cluster, namespace, service_name)
    if not yaml_content:
        raise HTTPException(status_code=404, detail="获取YAML配置失败")
    return {"yaml": yaml_content}


@router.put("/{namespace}/{service_name}/yaml", response_model=dict)
async def update_service_yaml_config(
    namespace: str,
    service_name: str,
    yaml_data: dict,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """通过YAML更新服务"""
    try:
        yaml_content = yaml_data.get("yaml", "")
        if not yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        result = update_service_yaml(cluster, namespace, service_name, yaml_content)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("message") or "更新服务失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Service",
            resource_name=f"{namespace}/{service_name}",
            cluster_id=cluster.id,
            details=f"通过YAML更新服务 {service_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": result.get("message") or "服务更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新服务失败: {str(e)}")
