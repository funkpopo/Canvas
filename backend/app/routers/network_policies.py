from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Cluster, AuditLog, User
from ..auth import get_current_user
from ..k8s_client import (
    get_namespace_network_policies, get_network_policy_details, create_network_policy, update_network_policy, delete_network_policy
)
from pydantic import BaseModel

router = APIRouter()

# Network Policy相关模型
class NetworkPolicyInfo(BaseModel):
    name: str
    namespace: str
    pod_selector: dict
    policy_types: List[str]
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int

class NetworkPolicyDetails(BaseModel):
    name: str
    namespace: str
    pod_selector: dict
    policy_types: List[str]
    ingress: List[dict]
    egress: List[dict]
    labels: dict
    annotations: dict
    age: str
    cluster_name: str
    cluster_id: int

class NetworkPolicyCreate(BaseModel):
    name: str
    namespace: str
    pod_selector: dict = {}
    policy_types: List[str] = []
    ingress: List[dict] = []
    egress: List[dict] = []
    labels: Optional[dict] = None
    annotations: Optional[dict] = None

class NetworkPolicyUpdate(BaseModel):
    pod_selector: Optional[dict] = None
    policy_types: Optional[List[str]] = None
    ingress: Optional[List[dict]] = None
    egress: Optional[List[dict]] = None
    labels: Optional[dict] = None
    annotations: Optional[dict] = None


# ========== Network Policies管理 ==========

@router.get("/", response_model=List[NetworkPolicyInfo])
async def get_network_policies(
    cluster_id: Optional[int] = Query(None, description="集群ID，不传则获取所有活跃集群"),
    namespace: Optional[str] = Query(None, description="命名空间名称"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Network Policy列表"""
    try:
        if cluster_id:
            # 获取特定集群的Network Policies
            cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
            if not cluster:
                raise HTTPException(status_code=404, detail="集群不存在或未激活")

            if namespace:
                policies = get_namespace_network_policies(cluster, namespace)
            else:
                # 获取所有命名空间的Network Policies
                policies = []
                # 这里可以扩展为获取所有命名空间的Network Policies
                raise HTTPException(status_code=400, detail="必须指定命名空间")
        else:
            # 获取所有活跃集群的Network Policies
            clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
            policies = []
            for cluster in clusters:
                if namespace:
                    cluster_policies = get_namespace_network_policies(cluster, namespace)
                    policies.extend(cluster_policies)

        return policies

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Network Policy列表失败: {str(e)}")


@router.get("/{namespace}/{policy_name}", response_model=NetworkPolicyDetails)
async def get_network_policy(
    namespace: str,
    policy_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取Network Policy详细信息"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        policy = get_network_policy_details(cluster, namespace, policy_name)
        if not policy:
            raise HTTPException(status_code=404, detail="Network Policy不存在")

        return policy

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Network Policy详情失败: {str(e)}")


@router.post("/", response_model=dict)
async def create_new_network_policy(
    policy_data: NetworkPolicyCreate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建Network Policy"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建Network Policy数据
        policy_dict = {
            "name": policy_data.name,
            "pod_selector": policy_data.pod_selector,
            "policy_types": policy_data.policy_types,
            "ingress": policy_data.ingress,
            "egress": policy_data.egress,
            "labels": policy_data.labels,
            "annotations": policy_data.annotations
        }

        success = create_network_policy(cluster, policy_data.namespace, policy_dict)
        if not success:
            raise HTTPException(status_code=500, detail="创建Network Policy失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="CREATE",
            resource_type="NetworkPolicy",
            resource_name=f"{policy_data.namespace}/{policy_data.name}",
            cluster_id=cluster_id,
            details=f"创建Network Policy {policy_data.name} 在命名空间 {policy_data.namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Network Policy创建成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建Network Policy失败: {str(e)}")


@router.put("/{namespace}/{policy_name}", response_model=dict)
async def update_existing_network_policy(
    namespace: str,
    policy_name: str,
    updates: NetworkPolicyUpdate,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新Network Policy"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        # 构建更新数据
        update_dict = {}
        if updates.pod_selector is not None:
            update_dict["pod_selector"] = updates.pod_selector
        if updates.policy_types is not None:
            update_dict["policy_types"] = updates.policy_types
        if updates.ingress is not None:
            update_dict["ingress"] = updates.ingress
        if updates.egress is not None:
            update_dict["egress"] = updates.egress
        if updates.labels is not None:
            update_dict["labels"] = updates.labels
        if updates.annotations is not None:
            update_dict["annotations"] = updates.annotations

        success = update_network_policy(cluster, namespace, policy_name, update_dict)
        if not success:
            raise HTTPException(status_code=500, detail="更新Network Policy失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            resource_type="NetworkPolicy",
            resource_name=f"{namespace}/{policy_name}",
            cluster_id=cluster_id,
            details=f"更新Network Policy {policy_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Network Policy更新成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新Network Policy失败: {str(e)}")


@router.delete("/{namespace}/{policy_name}", response_model=dict)
async def delete_existing_network_policy(
    namespace: str,
    policy_name: str,
    cluster_id: int = Query(..., description="集群ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除Network Policy"""
    try:
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id, Cluster.is_active == True).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在或未激活")

        success = delete_network_policy(cluster, namespace, policy_name)
        if not success:
            raise HTTPException(status_code=500, detail="删除Network Policy失败")

        # 记录审计日志
        audit_log = AuditLog(
            user_id=current_user.id,
            action="DELETE",
            resource_type="NetworkPolicy",
            resource_name=f"{namespace}/{policy_name}",
            cluster_id=cluster_id,
            details=f"删除Network Policy {policy_name} 在命名空间 {namespace}"
        )
        db.add(audit_log)
        db.commit()

        return {"message": "Network Policy删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除Network Policy失败: {str(e)}")
