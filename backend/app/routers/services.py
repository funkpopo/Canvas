from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog
from ..auth import get_current_user
from ..kubernetes import (
    get_namespace_services, create_service, delete_service,
    get_service_details, update_service, get_service_yaml, update_service_yaml
)
from pydantic import BaseModel

router = APIRouter()

# 服务相关模型
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


# ========== 服务管理 ==========

@router.get("/", response_model=List[ServiceInfo])
async def get_services(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取服务列表"""
    try:
        if cluster_id:
            # 获取特定集群的服务
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")

            if namespace:
                services = get_namespace_services(cluster, namespace)
            else:
                # 获取所有命名空间的服务
                services = []
                # 这里可以扩展为获取所有命名空间的服务
                raise HTTPException(status_code=400, detail="必须指定命名空间")
        else:
            # 获取所有活跃集群的服务
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
            services = []
            for cluster in clusters:
                if namespace:
                    cluster_services = get_namespace_services(cluster, namespace)
                    services.extend(cluster_services)

        return services

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取服务列表失败: {str(e)}")


@router.get("/{namespace}/{service_name}", response_model=ServiceInfo)
async def get_service(
    namespace: str,
    service_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取服务详细信息"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        service = get_service_details(cluster, namespace, service_name)
        if not service:
            raise HTTPException(status_code=404, detail="服务不存在")

        return service

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取服务详情失败: {str(e)}")


@router.post("/", response_model=dict)
async def create_new_service(
    service_data: ServiceCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建服务"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建服务数据
        service_dict = {
            "name": service_data.name,
            "type": service_data.type,
            "selector": service_data.selector,
            "ports": service_data.ports,
            "labels": service_data.labels,
            "annotations": service_data.annotations,
            "cluster_ip": service_data.cluster_ip,
            "load_balancer_ip": service_data.load_balancer_ip,
            "external_traffic_policy": service_data.external_traffic_policy,
            "session_affinity": service_data.session_affinity,
            "session_affinity_config": service_data.session_affinity_config
        }

        success = create_service(cluster, service_data.namespace, service_dict)
        if not success:
            raise HTTPException(status_code=500, detail="创建服务失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user["id"],
            action="CREATE",
            resource_type="Service",
            resource_name=f"{service_data.namespace}/{service_data.name}",
            cluster_id=cluster_id,
            details=f"创建服务 {service_data.name} 在命名空间 {service_data.namespace}"
        )
        db.add(audit_log)
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
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新服务"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建更新数据
        update_dict = {}
        if updates.type is not None:
            update_dict["type"] = updates.type
        if updates.selector is not None:
            update_dict["selector"] = updates.selector
        if updates.ports is not None:
            update_dict["ports"] = updates.ports
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations
        if updates.cluster_ip is not None:
            update_dict["cluster_ip"] = updates.cluster_ip
        if updates.load_balancer_ip is not None:
            update_dict["load_balancer_ip"] = updates.load_balancer_ip
        if updates.external_traffic_policy is not None:
            update_dict["external_traffic_policy"] = updates.external_traffic_policy
        if updates.session_affinity is not None:
            update_dict["session_affinity"] = updates.session_affinity
        if updates.session_affinity_config is not None:
            update_dict["session_affinity_config"] = updates.session_affinity_config

        success = update_service(cluster, namespace, service_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新服务失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user["id"],
            action="UPDATE",
            resource_type="Service",
            resource_name=f"{namespace}/{service_name}",
            cluster_id=cluster_id,
            details=f"更新服务 {service_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
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
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除服务"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_service(cluster, namespace, service_name)
        if not success:
            raise HTTPException(status_code=500, detail="删除服务失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user["id"],
            action="DELETE",
            resource_type="Service",
            resource_name=f"{namespace}/{service_name}",
            cluster_id=cluster_id,
            details=f"删除服务 {service_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "服务删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除服务失败: {str(e)}")


@router.get("/{namespace}/{service_name}/yaml", response_model=dict)
async def get_service_yaml_config(
    namespace: str,
    service_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取服务的YAML配置"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = get_service_yaml(cluster, namespace, service_name)
        if not yaml_content:
            raise HTTPException(status_code=404, detail="获取YAML配置失败")

        return {"yaml": yaml_content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取YAML配置失败: {str(e)}")


@router.put("/{namespace}/{service_name}/yaml", response_model=dict)
async def update_service_yaml_config(
    namespace: str,
    service_name: str,
    yaml_data: dict,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """通过YAML更新服务"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = yaml_data.get("yaml", "")
        if not yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        success = update_service_yaml(cluster, namespace, service_name, yaml_content)
        if not success:
            raise HTTPException(status_code=500, detail="更新服务失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user["id"],
            action="UPDATE",
            resource_type="Service",
            resource_name=f"{namespace}/{service_name}",
            cluster_id=cluster_id,
            details=f"通过YAML更新服务 {service_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "服务更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新服务失败: {str(e)}")
