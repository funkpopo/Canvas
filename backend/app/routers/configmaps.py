from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import require_configmap_management, require_read_only
from ..services.k8s import (
    get_namespace_configmaps, get_configmap_details, create_configmap, update_configmap, delete_configmap,
    get_configmap_yaml, update_configmap_yaml
)
from .deps import get_active_cluster, get_active_cluster_with_read_access, get_clusters_for_user, handle_k8s_operation

router = APIRouter()


class ConfigMapInfo(BaseModel):
    name: str
    namespace: str
    data: dict
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int


class ConfigMapCreate(BaseModel):
    name: str
    namespace: str
    data: dict = {}
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


class ConfigMapUpdate(BaseModel):
    data: Optional[dict] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


class YamlRequest(BaseModel):
    yaml_content: str


@router.get("/", response_model=List[ConfigMapInfo])
@handle_k8s_operation("获取ConfigMap列表")
async def get_configmaps(
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    clusters: list[Cluster] = Depends(get_clusters_for_user),
    current_user: User = Depends(require_read_only)
):
    """获取ConfigMap列表"""
    if not namespace:
        raise HTTPException(status_code=400, detail="必须指定命名空间")

    configmaps = []
    for cluster in clusters:
        cluster_configmaps = get_namespace_configmaps(cluster, namespace)
        configmaps.extend(cluster_configmaps)
    return configmaps


@router.get("/{namespace}/{configmap_name}", response_model=ConfigMapInfo)
@handle_k8s_operation("获取ConfigMap详情")
async def get_configmap(
    namespace: str,
    configmap_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: User = Depends(require_read_only)
):
    """获取ConfigMap详细信息"""
    configmap = get_configmap_details(cluster, namespace, configmap_name)
    if not configmap:
        raise HTTPException(status_code=404, detail="ConfigMap不存在")
    return configmap


@router.post("/", response_model=dict)
async def create_new_configmap(
    configmap_data: ConfigMapCreate,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_configmap_management)
):
    """创建ConfigMap"""
    try:
        cm_dict = {
            "name": configmap_data.name,
            "data": configmap_data.data,
            "labels": configmap_data.labels,
            "annotations": configmap_data.annotations
        }

        if not create_configmap(cluster, configmap_data.namespace, cm_dict):
            raise HTTPException(status_code=500, detail="创建ConfigMap失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="ConfigMap",
            resource_name=f"{configmap_data.namespace}/{configmap_data.name}",
            cluster_id=cluster.id,
            details=f"创建ConfigMap {configmap_data.name} 在命名空间 {configmap_data.namespace}"
        ))
        db.commit()
        return {"message": "ConfigMap创建成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建ConfigMap失败: {str(e)}")


@router.put("/{namespace}/{configmap_name}", response_model=dict)
async def update_existing_configmap(
    namespace: str,
    configmap_name: str,
    updates: ConfigMapUpdate,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_configmap_management)
):
    """更新ConfigMap"""
    try:
        update_dict = {k: v for k, v in updates.dict().items() if v is not None}

        if not update_configmap(cluster, namespace, configmap_name, update_dict):
            raise HTTPException(status_code=500, detail="更新ConfigMap失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="ConfigMap",
            resource_name=f"{namespace}/{configmap_name}",
            cluster_id=cluster.id,
            details=f"更新ConfigMap {configmap_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": "ConfigMap更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新ConfigMap失败: {str(e)}")


@router.delete("/{namespace}/{configmap_name}", response_model=dict)
async def delete_existing_configmap(
    namespace: str,
    configmap_name: str,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_configmap_management)
):
    """删除ConfigMap"""
    try:
        if not delete_configmap(cluster, namespace, configmap_name):
            raise HTTPException(status_code=500, detail="删除ConfigMap失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="ConfigMap",
            resource_name=f"{namespace}/{configmap_name}",
            cluster_id=cluster.id,
            details=f"删除ConfigMap {configmap_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": "ConfigMap删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除ConfigMap失败: {str(e)}")


@router.get("/{namespace}/{configmap_name}/yaml", response_model=dict)
@handle_k8s_operation("获取YAML配置")
async def get_configmap_yaml_config(
    namespace: str,
    configmap_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: User = Depends(require_read_only)
):
    """获取ConfigMap的YAML配置"""
    yaml_content = get_configmap_yaml(cluster, namespace, configmap_name)
    if not yaml_content:
        raise HTTPException(status_code=404, detail="获取YAML配置失败")
    return {"yaml": yaml_content}


@router.put("/{namespace}/{configmap_name}/yaml", response_model=dict)
async def update_configmap_yaml_config(
    namespace: str,
    configmap_name: str,
    yaml_data: YamlRequest,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_configmap_management)
):
    """通过YAML更新ConfigMap"""
    try:
        if not yaml_data.yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        result = update_configmap_yaml(cluster, namespace, configmap_name, yaml_data.yaml_content)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("message") or "更新ConfigMap YAML失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="ConfigMap",
            resource_name=f"{namespace}/{configmap_name}",
            cluster_id=cluster.id,
            details=f"通过YAML更新ConfigMap {configmap_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": result.get("message") or f"ConfigMap {namespace}/{configmap_name} YAML更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新ConfigMap YAML失败: {str(e)}")
