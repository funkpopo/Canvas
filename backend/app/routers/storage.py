from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import get_current_user
from ..services.k8s import (
    get_storage_classes, create_storage_class, delete_storage_class,
    get_persistent_volumes, get_pv_details, create_pv, delete_pv,
    get_persistent_volume_claims, get_pvc_details, create_pvc, delete_pvc,
    get_namespace_pvcs, browse_volume_files, read_volume_file
)
from pydantic import BaseModel

router = APIRouter()

# 存储类相关模型
class StorageClassInfo(BaseModel):
    name: str
    provisioner: str
    reclaim_policy: str
    volume_binding_mode: str
    allow_volume_expansion: bool
    cluster_name: str
    cluster_id: int

class StorageClassCreate(BaseModel):
    name: str
    provisioner: str
    reclaim_policy: Optional[str] = "Delete"
    volume_binding_mode: Optional[str] = "Immediate"
    allow_volume_expansion: Optional[bool] = False
    parameters: Optional[dict] = None
    # NFS specific fields
    nfs_server: Optional[str] = None
    nfs_path: Optional[str] = None
    # Custom provisioner fields
    custom_provisioner: Optional[bool] = False
    provisioner_image: Optional[str] = None

# PV相关模型
class PersistentVolumeInfo(BaseModel):
    name: str
    capacity: str
    access_modes: List[str]
    status: str
    claim: Optional[str]
    storage_class: Optional[str]
    volume_mode: str
    cluster_name: str
    cluster_id: int

class PVCreate(BaseModel):
    name: str
    capacity: str
    access_modes: List[str]
    storage_class_name: Optional[str] = None
    volume_mode: Optional[str] = "Filesystem"
    host_path: Optional[str] = None  # 简化版，只支持hostPath

# PVC相关模型
class PersistentVolumeClaimInfo(BaseModel):
    name: str
    namespace: str
    status: str
    volume: Optional[str]
    capacity: Optional[str]
    access_modes: List[str]
    storage_class: Optional[str]
    volume_mode: str
    cluster_name: str
    cluster_id: int

class PVCCreate(BaseModel):
    name: str
    namespace: str
    access_modes: List[str]
    storage_class_name: Optional[str] = None
    volume_mode: Optional[str] = "Filesystem"
    requests: dict  # {"storage": "1Gi"}

# 文件浏览相关模型
class FileItem(BaseModel):
    name: str
    type: str  # "file" or "directory"
    size: Optional[int] = None
    modified_time: Optional[str] = None
    permissions: Optional[str] = None

# ========== 存储类管理 ==========

@router.get("/classes", response_model=List[StorageClassInfo])
async def get_storage_classes_list(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取存储类列表"""
    try:
        if cluster_id:
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_storage_classes = []
        for cluster in clusters:
            try:
                storage_classes = get_storage_classes(cluster)
                if storage_classes:
                    for sc in storage_classes:
                        sc['cluster_id'] = cluster.id
                        sc['cluster_name'] = cluster.name
                    all_storage_classes.extend(storage_classes)
            except Exception as e:
                continue

        return all_storage_classes

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取存储类信息失败: {str(e)}")

@router.post("/classes", response_model=StorageClassInfo)
async def create_storage_class_endpoint(
    storage_class: StorageClassCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建存储类"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 处理存储类参数
        sc_data = storage_class.dict()

        # 处理NFS存储类
        if storage_class.provisioner == "kubernetes.io/nfs" or storage_class.nfs_server:
            if not storage_class.nfs_server or not storage_class.nfs_path:
                raise HTTPException(status_code=400, detail="NFS存储类需要提供服务器地址和路径")
            # 为NFS设置默认参数
            sc_data['parameters'] = {
                'server': storage_class.nfs_server,
                'path': storage_class.nfs_path
            }
        # 处理NFS subdir external provisioner
        elif storage_class.provisioner == "k8s-sigs.io/nfs-subdir-external-provisioner":
            if not storage_class.nfs_server or not storage_class.nfs_path:
                raise HTTPException(status_code=400, detail="NFS subdir provisioner需要提供服务器地址和路径")
            # 设置NFS subdir external provisioner的参数
            sc_data['parameters'] = {
                'nfs.server': storage_class.nfs_server,
                'nfs.path': storage_class.nfs_path
            }
            # 如果提供了自定义镜像，使用自定义镜像
            if storage_class.provisioner_image:
                sc_data['parameters']['image'] = storage_class.provisioner_image
            else:
                # 默认使用eipwork/nfs-subdir-external-provisioner
                sc_data['parameters']['image'] = 'eipwork/nfs-subdir-external-provisioner'

        result = create_storage_class(cluster, sc_data)
        if result:
            storage_classes = get_storage_classes(cluster)
            for sc in storage_classes:
                if sc['name'] == storage_class.name:
                    sc['cluster_id'] = cluster.id
                    sc['cluster_name'] = cluster.name
                    return sc

        raise HTTPException(status_code=500, detail="创建存储类失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建存储类失败: {str(e)}")

@router.delete("/classes/{storage_class_name}")
async def delete_storage_class_endpoint(
    storage_class_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除存储类"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_storage_class(cluster, storage_class_name)
        if result:
            return {"message": f"存储类 '{storage_class_name}' 已删除"}
        else:
            raise HTTPException(status_code=500, detail="删除存储类失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除存储类失败: {str(e)}")

# ========== PV管理 ==========

@router.get("/volumes", response_model=List[PersistentVolumeInfo])
async def get_persistent_volumes_list(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取持久卷列表"""
    try:
        if cluster_id:
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_pvs = []
        for cluster in clusters:
            try:
                pvs = get_persistent_volumes(cluster)
                if pvs:
                    for pv in pvs:
                        pv['cluster_id'] = cluster.id
                        pv['cluster_name'] = cluster.name
                    all_pvs.extend(pvs)
            except Exception as e:
                continue

        return all_pvs

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取持久卷信息失败: {str(e)}")

@router.get("/volumes/{pv_name}", response_model=PersistentVolumeInfo)
async def get_pv_details_endpoint(
    pv_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取PV详情"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        pv_details = get_pv_details(cluster, pv_name)
        if pv_details:
            pv_details['cluster_id'] = cluster.id
            pv_details['cluster_name'] = cluster.name
            return pv_details
        else:
            raise HTTPException(status_code=404, detail="持久卷不存在")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取PV详情失败: {str(e)}")

@router.post("/volumes", response_model=PersistentVolumeInfo)
async def create_pv_endpoint(
    pv: PVCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建持久卷"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = create_pv(cluster, pv.dict())
        if result:
            pvs = get_persistent_volumes(cluster)
            for pv_item in pvs:
                if pv_item['name'] == pv.name:
                    pv_item['cluster_id'] = cluster.id
                    pv_item['cluster_name'] = cluster.name
                    return pv_item

        raise HTTPException(status_code=500, detail="创建持久卷失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建持久卷失败: {str(e)}")

@router.delete("/volumes/{pv_name}")
async def delete_pv_endpoint(
    pv_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除持久卷"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_pv(cluster, pv_name)
        if result:
            return {"message": f"持久卷 '{pv_name}' 已删除"}
        else:
            raise HTTPException(status_code=500, detail="删除持久卷失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除持久卷失败: {str(e)}")

# ========== PVC管理 ==========

@router.get("/claims", response_model=List[PersistentVolumeClaimInfo])
async def get_persistent_volume_claims_list(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间过滤"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取持久卷声明列表"""
    try:
        if cluster_id:
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")
            clusters = [cluster]
        else:
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()

        all_pvcs = []
        for cluster in clusters:
            try:
                if namespace:
                    pvcs = get_namespace_pvcs(cluster, namespace)
                else:
                    pvcs = get_persistent_volume_claims(cluster)
                if pvcs:
                    for pvc in pvcs:
                        pvc['cluster_id'] = cluster.id
                        pvc['cluster_name'] = cluster.name
                    all_pvcs.extend(pvcs)
            except Exception as e:
                continue

        return all_pvcs

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取PVC信息失败: {str(e)}")

@router.get("/claims/{namespace}/{pvc_name}", response_model=PersistentVolumeClaimInfo)
async def get_pvc_details_endpoint(
    namespace: str,
    pvc_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取PVC详情"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        pvc_details = get_pvc_details(cluster, namespace, pvc_name)
        if pvc_details:
            pvc_details['cluster_id'] = cluster.id
            pvc_details['cluster_name'] = cluster.name
            return pvc_details
        else:
            raise HTTPException(status_code=404, detail="PVC不存在")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取PVC详情失败: {str(e)}")

@router.post("/claims", response_model=PersistentVolumeClaimInfo)
async def create_pvc_endpoint(
    pvc: PVCCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建持久卷声明"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = create_pvc(cluster, pvc.dict())
        if result:
            pvcs = get_namespace_pvcs(cluster, pvc.namespace)
            for pvc_item in pvcs:
                if pvc_item['name'] == pvc.name:
                    pvc_item['cluster_id'] = cluster.id
                    pvc_item['cluster_name'] = cluster.name
                    return pvc_item

        raise HTTPException(status_code=500, detail="创建PVC失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建PVC失败: {str(e)}")

@router.delete("/claims/{namespace}/{pvc_name}")
async def delete_pvc_endpoint(
    namespace: str,
    pvc_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除持久卷声明"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        result = delete_pvc(cluster, namespace, pvc_name)
        if result:
            return {"message": f"PVC '{namespace}/{pvc_name}' 已删除"}
        else:
            raise HTTPException(status_code=500, detail="删除PVC失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除PVC失败: {str(e)}")

# ========== 卷文件浏览 ==========

@router.get("/volumes/{pv_name}/files")
async def browse_volume_files_endpoint(
    pv_name: str,
    path: str = Query("/", description="浏览路径"),
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """浏览卷内文件"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        files = browse_volume_files(cluster, pv_name, path)

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            cluster_id=cluster_id,
            action="volume_browse",
            resource_type="persistentvolume",
            resource_name=pv_name,
            details=f'{{"path": "{path}"}}',
            success=True
        )
        db.add(audit_log)
        db.commit()

        return {"files": files, "current_path": path}

    except Exception as e:
        # 记录失败的审计日志
        try:
            audit_log = AuditLog(
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="volume_browse",
                resource_type="persistentvolume",
                resource_name=pv_name,
                details=f'{{"path": "{path}"}}',
                success=False,
                error_message=str(e)
            )
            db.add(audit_log)
            db.commit()
        except:
            pass  # 审计日志失败不应该影响主要功能

        raise HTTPException(status_code=500, detail=f"浏览卷文件失败: {str(e)}")

@router.get("/volumes/{pv_name}/files/content")
async def read_volume_file_endpoint(
    pv_name: str,
    file_path: str = Query(..., description="文件路径"),
    cluster_id: int = Query(..., description="集群ID"),
    max_lines: Optional[int] = Query(None, description="最大行数限制"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """读取卷内文件内容"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        content = read_volume_file(cluster, pv_name, file_path, max_lines)

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            cluster_id=cluster_id,
            action="volume_read",
            resource_type="persistentvolume",
            resource_name=pv_name,
            details=f'{{"file_path": "{file_path}", "max_lines": {max_lines or "null"}}}',
            success=True
        )
        db.add(audit_log)
        db.commit()

        return {"content": content, "file_path": file_path}

    except Exception as e:
        # 记录失败的审计日志
        try:
            audit_log = AuditLog(
                user_id=current_user.id,
                cluster_id=cluster_id,
                action="volume_read",
                resource_type="persistentvolume",
                resource_name=pv_name,
                details=f'{{"file_path": "{file_path}", "max_lines": {max_lines or "null"}}}',
                success=False,
                error_message=str(e)
            )
            db.add(audit_log)
            db.commit()
        except:
            pass  # 审计日志失败不应该影响主要功能

        raise HTTPException(status_code=500, detail=f"读取文件内容失败: {str(e)}")
