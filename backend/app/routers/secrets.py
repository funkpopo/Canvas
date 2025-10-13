from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import get_current_user
from ..kubernetes import (
    get_namespace_secrets, get_secret_details, create_secret, update_secret, delete_secret,
    get_secret_yaml, update_secret_yaml
)
from pydantic import BaseModel

router = APIRouter()

# Secret相关模型
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


# ========== Secrets管理 ==========

@router.get("/", response_model=List[SecretInfo])
async def get_secrets(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Secret列表"""
    try:
        if cluster_id:
            # 获取特定集群的Secrets
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")

            if namespace:
                secrets = get_namespace_secrets(cluster, namespace)
            else:
                # 获取所有命名空间的Secrets
                secrets = []
                # 这里可以扩展为获取所有命名空间的Secrets
                raise HTTPException(status_code=400, detail="必须指定命名空间")
        else:
            # 获取所有活跃集群的Secrets
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
            secrets = []
            for cluster in clusters:
                if namespace:
                    cluster_secrets = get_namespace_secrets(cluster, namespace)
                    secrets.extend(cluster_secrets)

        return secrets

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Secret列表失败: {str(e)}")


@router.get("/{namespace}/{secret_name}", response_model=SecretDetails)
async def get_secret(
    namespace: str,
    secret_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Secret详细信息"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        secret = get_secret_details(cluster, namespace, secret_name)
        if not secret:
            raise HTTPException(status_code=404, detail="Secret不存在")

        return secret

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Secret详情失败: {str(e)}")


@router.post("/", response_model=dict)
async def create_new_secret(
    secret_data: SecretCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建Secret"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建Secret数据
        secret_dict = {
            "name": secret_data.name,
            "type": secret_data.type,
            "data": secret_data.data,
            "labels": secret_data.labels,
            "annotations": secret_data.annotations
        }

        success = create_secret(cluster, secret_data.namespace, secret_dict)
        if not success:
            raise HTTPException(status_code=500, detail="创建Secret失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="Secret",
            resource_name=f"{secret_data.namespace}/{secret_data.name}",
            cluster_id=cluster_id,
            details=f"创建Secret {secret_data.name} 在命名空间 {secret_data.namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Secret创建成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建Secret失败: {str(e)}")


@router.put("/{namespace}/{secret_name}", response_model=dict)
async def update_existing_secret(
    namespace: str,
    secret_name: str,
    updates: SecretUpdate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新Secret"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建更新数据
        update_dict = {}
        if updates.type is not None:
            update_dict["type"] = updates.type
        if updates.data is not None:
            update_dict["data"] = updates.data
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations

        success = update_secret(cluster, namespace, secret_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新Secret失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Secret",
            resource_name=f"{namespace}/{secret_name}",
            cluster_id=cluster_id,
            details=f"更新Secret {secret_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Secret更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Secret失败: {str(e)}")


@router.delete("/{namespace}/{secret_name}", response_model=dict)
async def delete_existing_secret(
    namespace: str,
    secret_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除Secret"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_secret(cluster, namespace, secret_name)
        if not success:
            raise HTTPException(status_code=500, detail="删除Secret失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="Secret",
            resource_name=f"{namespace}/{secret_name}",
            cluster_id=cluster_id,
            details=f"删除Secret {secret_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Secret删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除Secret失败: {str(e)}")


class YamlUpdateRequest(BaseModel):
    yaml_content: str


@router.get("/{namespace}/{secret_name}/yaml", response_model=dict)
async def get_secret_yaml_config(
    namespace: str,
    secret_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Secret的YAML配置"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = get_secret_yaml(cluster, namespace, secret_name)
        if not yaml_content:
            raise HTTPException(status_code=404, detail="获取YAML配置失败")

        return {"yaml": yaml_content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取YAML配置失败: {str(e)}")


@router.put("/{namespace}/{secret_name}/yaml", response_model=dict)
async def update_secret_yaml_config(
    namespace: str,
    secret_name: str,
    yaml_data: YamlUpdateRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """通过YAML更新Secret"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        yaml_content = yaml_data.yaml_content
        if not yaml_content:
            raise HTTPException(status_code=400, detail="YAML内容不能为空")

        success = update_secret_yaml(cluster, namespace, secret_name, yaml_content)
        if not success:
            raise HTTPException(status_code=500, detail="更新Secret YAML失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Secret",
            resource_name=f"{namespace}/{secret_name}",
            cluster_id=cluster_id,
            details=f"通过YAML更新Secret {secret_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": f"Secret {namespace}/{secret_name} YAML更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Secret YAML失败: {str(e)}")
