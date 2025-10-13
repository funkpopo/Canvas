from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import get_current_user
from ..kubernetes import (
    get_namespace_ingresses, get_ingress_details, create_ingress, update_ingress, delete_ingress,
    check_controller_status, install_ingress_controller, uninstall_ingress_controller,
    get_ingress_classes, create_ingress_class, update_ingress_class, delete_ingress_class
)
from pydantic import BaseModel

router = APIRouter()

# Ingress相关模型
class IngressInfo(BaseModel):
    name: str
    namespace: str
    hosts: List[str]
    tls_hosts: List[str]
    class_name: Optional[str] = None
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int

class IngressRule(BaseModel):
    host: Optional[str] = None
    paths: List[dict] = []

class IngressTLS(BaseModel):
    hosts: List[str] = []
    secret_name: Optional[str] = None

class IngressDetails(BaseModel):
    name: str
    namespace: str
    class_name: Optional[str] = None
    rules: List[IngressRule]
    tls: List[IngressTLS]
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int

class IngressCreate(BaseModel):
    name: str
    namespace: str
    class_name: Optional[str] = None
    rules: List[dict] = []
    tls: List[dict] = []
    labels: Optional[dict] = None
    annotations: Optional[dict] = None

class IngressUpdate(BaseModel):
    class_name: Optional[str] = None
    rules: Optional[List[dict]] = None
    tls: Optional[List[dict]] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None

# Controller相关模型
class ControllerStatus(BaseModel):
    installed: bool
    namespace: str
    deployment_exists: bool
    service_exists: bool
    ingressclass_exists: bool
    webhook_exists: bool
    version: Optional[str] = None
    namespace_exists: bool = False
    error: Optional[str] = None

class ControllerInstallResult(BaseModel):
    success: bool
    message: str
    steps: List[str]
    error: Optional[str] = None

class ControllerInstallRequest(BaseModel):
    version: Optional[str] = "latest"
    image: Optional[str] = None

# IngressClass相关模型
class IngressClassInfo(BaseModel):
    name: str
    controller: str
    is_default: bool
    labels: dict
    annotations: dict
    age: str

class IngressClassCreate(BaseModel):
    name: str
    controller: str
    labels: Optional[dict] = None
    annotations: Optional[dict] = None
    parameters: Optional[dict] = None

class IngressClassUpdate(BaseModel):
    controller: Optional[str] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


# ========== IngressClass管理 ==========

@router.get("/classes", response_model=List[IngressClassInfo])
async def get_ingress_classes_list(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取IngressClass列表"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        classes = get_ingress_classes(cluster)
        return [IngressClassInfo(**cls) for cls in classes]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取IngressClass列表失败: {str(e)}")


@router.post("/classes", response_model=dict)
async def create_new_ingress_class(
    class_data: IngressClassCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建IngressClass"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        class_dict = {
            "name": class_data.name,
            "controller": class_data.controller,
            "labels": class_data.labels or {},
            "annotations": class_data.annotations or {},
            "parameters": class_data.parameters
        }

        success = create_ingress_class(cluster, class_dict)
        if not success:
            raise HTTPException(status_code=400, detail=f"IngressClass '{class_data.name}' 已存在或创建失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="IngressClass",
            resource_name=class_data.name,
            cluster_id=cluster_id,
            details=f"创建IngressClass {class_data.name} 使用控制器 {class_data.controller}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "IngressClass创建成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建IngressClass失败: {str(e)}")


@router.put("/classes/{class_name}", response_model=dict)
async def update_existing_ingress_class(
    class_name: str,
    updates: IngressClassUpdate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新IngressClass"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        update_dict = {}
        if updates.controller is not None:
            update_dict["controller"] = updates.controller
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations

        success = update_ingress_class(cluster, class_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新IngressClass失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="IngressClass",
            resource_name=class_name,
            cluster_id=cluster_id,
            details=f"更新IngressClass {class_name}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "IngressClass更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新IngressClass失败: {str(e)}")


@router.delete("/classes/{class_name}", response_model=dict)
async def delete_existing_ingress_class(
    class_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除IngressClass"""
    print(f"[ROUTER] IngressClass删除路由被调用: class_name={class_name}, cluster_id={cluster_id}")
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_ingress_class(cluster, class_name)
        if not success:
            raise HTTPException(status_code=404, detail=f"IngressClass '{class_name}' 不存在或删除失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="IngressClass",
            resource_name=class_name,
            cluster_id=cluster_id,
            details=f"删除IngressClass {class_name}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "IngressClass删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除IngressClass失败: {str(e)}")


# ========== Ingress管理 ==========

@router.get("/", response_model=List[IngressInfo])
async def get_ingresses(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Ingress列表"""
    try:
        if cluster_id:
            # 获取特定集群的Ingresses
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")

            if namespace:
                ingresses = get_namespace_ingresses(cluster, namespace)
            else:
                # 获取所有命名空间的Ingresses
                ingresses = []
                # 这里可以扩展为获取所有命名空间的Ingresses
                raise HTTPException(status_code=400, detail="必须指定命名空间")
        else:
            # 获取所有活跃集群的Ingresses
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
            ingresses = []
            for cluster in clusters:
                if namespace:
                    cluster_ingresses = get_namespace_ingresses(cluster, namespace)
                    ingresses.extend(cluster_ingresses)

        return ingresses

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Ingress列表失败: {str(e)}")


@router.get("/{namespace}/{ingress_name}", response_model=IngressDetails)
async def get_ingress(
    namespace: str,
    ingress_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Ingress详细信息"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        ingress = get_ingress_details(cluster, namespace, ingress_name)
        if not ingress:
            raise HTTPException(status_code=404, detail="Ingress不存在")

        return ingress

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Ingress详情失败: {str(e)}")


@router.post("/", response_model=dict)
async def create_new_ingress(
    ingress_data: IngressCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建Ingress"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建Ingress数据
        ingress_dict = {
            "name": ingress_data.name,
            "class_name": ingress_data.class_name,
            "rules": ingress_data.rules,
            "tls": ingress_data.tls,
            "labels": ingress_data.labels,
            "annotations": ingress_data.annotations
        }

        success = create_ingress(cluster, ingress_data.namespace, ingress_dict)
        if not success:
            raise HTTPException(status_code=500, detail="创建Ingress失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="Ingress",
            resource_name=f"{ingress_data.namespace}/{ingress_data.name}",
            cluster_id=cluster_id,
            details=f"创建Ingress {ingress_data.name} 在命名空间 {ingress_data.namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Ingress创建成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建Ingress失败: {str(e)}")


@router.put("/{namespace}/{ingress_name}", response_model=dict)
async def update_existing_ingress(
    namespace: str,
    ingress_name: str,
    updates: IngressUpdate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新Ingress"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建更新数据
        update_dict = {}
        if updates.class_name is not None:
            update_dict["class_name"] = updates.class_name
        if updates.rules is not None:
            update_dict["rules"] = updates.rules
        if updates.tls is not None:
            update_dict["tls"] = updates.tls
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations

        success = update_ingress(cluster, namespace, ingress_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新Ingress失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="Ingress",
            resource_name=f"{namespace}/{ingress_name}",
            cluster_id=cluster_id,
            details=f"更新Ingress {ingress_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Ingress更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Ingress失败: {str(e)}")


@router.delete("/{namespace}/{ingress_name}", response_model=dict)
async def delete_existing_ingress(
    namespace: str,
    ingress_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除Ingress"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_ingress(cluster, namespace, ingress_name)
        if not success:
            raise HTTPException(status_code=500, detail="删除Ingress失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="Ingress",
            resource_name=f"{namespace}/{ingress_name}",
            cluster_id=cluster_id,
            details=f"删除Ingress {ingress_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Ingress删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除Ingress失败: {str(e)}")


# ========== Controller管理 ==========

@router.get("/controller/status", response_model=ControllerStatus)
async def get_controller_status(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查Ingress Controller安装状态"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        status = check_controller_status(cluster)
        return ControllerStatus(**status)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Controller状态失败: {str(e)}")


@router.post("/controller/install", response_model=ControllerInstallResult)
async def install_controller(
    request: ControllerInstallRequest,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """安装Ingress Controller"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = install_ingress_controller(cluster, request.version or "latest", request.image)

        if result["success"]:
            # 记录审计日志
            image_info = request.image or f"registry.k8s.io/ingress-nginx/controller:{request.version or 'latest'}"
            audit_log = AuditLog(
                user_id=current_user.id,
                action="CREATE",
                resource_type="IngressController",
                resource_name="ingress-nginx",
                cluster_id=cluster_id,
                details=f"安装Ingress Controller镜像 {image_info}"
            )
            db.add(audit_log)
            db.commit()

        return ControllerInstallResult(**result)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"安装Controller失败: {str(e)}")


@router.delete("/controller", response_model=ControllerInstallResult)
async def uninstall_controller(
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """卸载Ingress Controller"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = uninstall_ingress_controller(cluster)

        if result["success"]:
            # 记录审计日志
            audit_log = AuditLog(
                user_id=current_user.id,
                action="DELETE",
                resource_type="IngressController",
                resource_name="ingress-nginx",
                cluster_id=cluster_id,
                details="卸载Ingress Controller"
            )
            db.add(audit_log)
            db.commit()

        return ControllerInstallResult(**result)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"卸载Controller失败: {str(e)}")


