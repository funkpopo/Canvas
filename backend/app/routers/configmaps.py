from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import get_current_user
from ..k8s_client import (
    get_namespace_configmaps, get_configmap_details, create_configmap, update_configmap, delete_configmap,
    get_configmap_yaml, update_configmap_yaml
)
from ..audit import log_action
from pydantic import BaseModel

router = APIRouter()

# ConfigMap相关模型
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


# ========== ConfigMaps管理 ==========

@router.get("/", response_model=List[ConfigMapInfo])
async def get_configmaps(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ConfigMap列表"""
    try:
        if cluster_id:
            # 获取特定集群的ConfigMaps
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")

            if namespace:
                configmaps = get_namespace_configmaps(cluster, namespace)
            else:
                # 获取所有命名空间的ConfigMaps
                configmaps = []
                # 这里可以扩展为获取所有命名空间的ConfigMaps
                raise HTTPException(status_code=400, detail="必须指定命名空间")
        else:
            # 获取所有活跃集群的ConfigMaps
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
            configmaps = []
            for cluster in clusters:
                if namespace:
                    cluster_configmaps = get_namespace_configmaps(cluster, namespace)
                    configmaps.extend(cluster_configmaps)

        return configmaps

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取ConfigMap列表失败: {str(e)}")


@router.get("/{namespace}/{configmap_name}", response_model=ConfigMapInfo)
async def get_configmap(
    namespace: str,
    configmap_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ConfigMap详细信息"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        configmap = get_configmap_details(cluster, namespace, configmap_name)
        if not configmap:
            raise HTTPException(status_code=404, detail="ConfigMap不存在")

        return configmap

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取ConfigMap详情失败: {str(e)}")


@router.post("/", response_model=dict)
async def create_new_configmap(
    configmap_data: ConfigMapCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建ConfigMap"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建ConfigMap数据
        cm_dict = {
            "name": configmap_data.name,
            "data": configmap_data.data,
            "labels": configmap_data.labels,
            "annotations": configmap_data.annotations
        }

        success = create_configmap(cluster, configmap_data.namespace, cm_dict)
        if not success:
            raise HTTPException(status_code=500, detail="创建ConfigMap失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="ConfigMap",
            resource_name=f"{configmap_data.namespace}/{configmap_data.name}",
            cluster_id=cluster_id,
            details=f"创建ConfigMap {configmap_data.name} 在命名空间 {configmap_data.namespace}"
        )
        db.add(audit_log)
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
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新ConfigMap"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建更新数据
        update_dict = {}
        if updates.data is not None:
            update_dict["data"] = updates.data
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations

        success = update_configmap(cluster, namespace, configmap_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新ConfigMap失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="ConfigMap",
            resource_name=f"{namespace}/{configmap_name}",
            cluster_id=cluster_id,
            details=f"更新ConfigMap {configmap_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
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
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除ConfigMap"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_configmap(cluster, namespace, configmap_name)
        if not success:
            raise HTTPException(status_code=500, detail="删除ConfigMap失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="ConfigMap",
            resource_name=f"{namespace}/{configmap_name}",
            cluster_id=cluster_id,
            details=f"删除ConfigMap {configmap_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "ConfigMap删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除ConfigMap失败: {str(e)}")


class YamlCreateRequest(BaseModel):
    yaml_content: str


@router.post("/yaml", response_model=dict)
async def create_configmap_from_yaml(
    yaml_data: YamlCreateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """通过YAML创建ConfigMap"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = yaml_data.yaml_content
        if not yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        success = create_configmap_from_yaml(cluster, yaml_content)
        if not success:
            raise HTTPException(status_code=500, detail="创建ConfigMap失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="ConfigMap",
            resource_name="通过YAML创建",
            cluster_id=cluster_id,
            details="通过YAML创建ConfigMap"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "ConfigMap创建成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建ConfigMap失败: {str(e)}")


class YamlUpdateRequest(BaseModel):
    yaml_content: str


@router.get("/{namespace}/{configmap_name}/yaml", response_model=dict)
async def get_configmap_yaml_config(
    namespace: str,
    configmap_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取ConfigMap的YAML配置"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = get_configmap_yaml(cluster, namespace, configmap_name)
        if not yaml_content:
            raise HTTPException(status_code=404, detail="获取YAML配置失败")

        return {"yaml": yaml_content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取YAML配置失败: {str(e)}")


@router.put("/{namespace}/{configmap_name}/yaml", response_model=dict)
async def update_configmap_yaml_config(
    namespace: str,
    configmap_name: str,
    yaml_data: YamlUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """通过YAML更新ConfigMap"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = yaml_data.yaml_content
        if not yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        success = update_configmap_yaml(cluster, namespace, configmap_name, yaml_content)
        if not success:
            raise HTTPException(status_code=500, detail="更新ConfigMap YAML失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="ConfigMap",
            resource_name=f"{namespace}/{configmap_name}",
            cluster_id=cluster_id,
            details=f"通过YAML更新ConfigMap {configmap_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": f"ConfigMap {namespace}/{configmap_name} YAML更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新ConfigMap YAML失败: {str(e)}")
