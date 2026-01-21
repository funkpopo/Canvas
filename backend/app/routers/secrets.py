from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

import yaml

from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import require_read_only, require_resource_management
from ..services.k8s import (
    get_namespace_secrets, get_secret_details, create_secret, update_secret, delete_secret,
    get_secret_yaml, create_secret_yaml, update_secret_yaml
)
from .deps import get_active_cluster, get_active_cluster_with_read_access, get_clusters_for_user, handle_k8s_operation

router = APIRouter()


class SecretInfo(BaseModel):
    name: str
    namespace: str
    type: str
    data_keys: List[str]
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int


class SecretDetails(BaseModel):
    name: str
    namespace: str
    type: str
    data: dict
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int


class SecretCreate(BaseModel):
    name: str
    namespace: str
    type: Optional[str] = "Opaque"
    data: dict = {}
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


class SecretUpdate(BaseModel):
    type: Optional[str] = None
    data: Optional[dict] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


class YamlRequest(BaseModel):
    yaml_content: str


@router.get("/", response_model=List[SecretInfo])
@handle_k8s_operation("获取Secret列表")
def get_secrets(
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    clusters: list[Cluster] = Depends(get_clusters_for_user),
    current_user: User = Depends(require_read_only)
):
    """获取Secret列表"""
    if not namespace:
        raise HTTPException(status_code=400, detail="必须指定命名空间")

    secrets = []
    for cluster in clusters:
        secrets.extend(get_namespace_secrets(cluster, namespace))
    return secrets


@router.get("/{namespace}/{secret_name}", response_model=SecretDetails)
@handle_k8s_operation("获取Secret详情")
def get_secret(
    namespace: str,
    secret_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: User = Depends(require_read_only)
):
    """获取Secret详细信息"""
    secret = get_secret_details(cluster, namespace, secret_name)
    if not secret:
        raise HTTPException(status_code=404, detail="Secret不存在")
    return secret


@router.post("/yaml", response_model=dict)
def create_secret_yaml_config(
    yaml_data: YamlRequest,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """通过YAML创建Secret"""
    try:
        if not yaml_data.yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        try:
            secret_dict = yaml.safe_load(yaml_data.yaml_content) or {}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"YAML解析失败: {str(e)}")

        metadata = secret_dict.get("metadata") if isinstance(secret_dict, dict) else None
        namespace = metadata.get("namespace") if isinstance(metadata, dict) else None
        if not namespace:
            raise HTTPException(status_code=400, detail="YAML必须包含 metadata.namespace")

        result = create_secret_yaml(cluster, namespace, yaml_data.yaml_content)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("message") or "通过YAML创建Secret失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="Secret",
            resource_name="通过YAML创建",
            cluster_id=cluster.id,
            details="通过YAML创建Secret"
        ))
        db.commit()
        return {"message": result.get("message") or "Secret创建成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"通过YAML创建Secret失败: {str(e)}")


@router.post("/", response_model=dict)
def create_new_secret(
    secret_data: SecretCreate,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """创建Secret"""
    try:
        secret_dict = {
            "name": secret_data.name,
            "type": secret_data.type,
            "data": secret_data.data,
            "labels": secret_data.labels,
            "annotations": secret_data.annotations
        }

        if not create_secret(cluster, secret_data.namespace, secret_dict):
            raise HTTPException(status_code=500, detail="创建Secret失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="Secret",
            resource_name=f"{secret_data.namespace}/{secret_data.name}",
            cluster_id=cluster.id,
            details=f"创建Secret {secret_data.name} 在命名空间 {secret_data.namespace}"
        ))
        db.commit()
        return {"message": "Secret创建成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建Secret失败: {str(e)}")


@router.put("/{namespace}/{secret_name}", response_model=dict)
def update_existing_secret(
    namespace: str,
    secret_name: str,
    updates: SecretUpdate,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """更新Secret"""
    try:
        update_dict = {k: v for k, v in updates.dict().items() if v is not None}

        if not update_secret(cluster, namespace, secret_name, update_dict):
            raise HTTPException(status_code=500, detail="更新Secret失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Secret",
            resource_name=f"{namespace}/{secret_name}",
            cluster_id=cluster.id,
            details=f"更新Secret {secret_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": "Secret更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Secret失败: {str(e)}")


@router.delete("/{namespace}/{secret_name}", response_model=dict)
def delete_existing_secret(
    namespace: str,
    secret_name: str,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """删除Secret"""
    try:
        if not delete_secret(cluster, namespace, secret_name):
            raise HTTPException(status_code=500, detail="删除Secret失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="Secret",
            resource_name=f"{namespace}/{secret_name}",
            cluster_id=cluster.id,
            details=f"删除Secret {secret_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": "Secret删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除Secret失败: {str(e)}")


@router.get("/{namespace}/{secret_name}/yaml", response_model=dict)
@handle_k8s_operation("获取YAML配置")
def get_secret_yaml_config(
    namespace: str,
    secret_name: str,
    cluster: Cluster = Depends(get_active_cluster_with_read_access),
    current_user: User = Depends(require_read_only)
):
    """获取Secret的YAML配置"""
    yaml_content = get_secret_yaml(cluster, namespace, secret_name)
    if not yaml_content:
        raise HTTPException(status_code=404, detail="获取YAML配置失败")
    return {"yaml": yaml_content}


@router.put("/{namespace}/{secret_name}/yaml", response_model=dict)
def update_secret_yaml_config(
    namespace: str,
    secret_name: str,
    yaml_data: YamlRequest,
    cluster: Cluster = Depends(get_active_cluster),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_resource_management)
):
    """通过YAML更新Secret"""
    try:
        if not yaml_data.yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        result = update_secret_yaml(cluster, namespace, secret_name, yaml_data.yaml_content)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("message") or "更新Secret YAML失败")

        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Secret",
            resource_name=f"{namespace}/{secret_name}",
            cluster_id=cluster.id,
            details=f"通过YAML更新Secret {secret_name} 在命名空间 {namespace}"
        ))
        db.commit()
        return {"message": result.get("message") or f"Secret {namespace}/{secret_name} YAML更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Secret YAML失败: {str(e)}")
