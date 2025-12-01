from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from ..database import get_db
from ..models import Cluster, JobTemplate, JobHistory
from ..auth import get_current_user
from ..services.k8s import (
    get_namespace_jobs, get_job_details, create_job, delete_job, restart_job,
    get_job_pods, get_job_yaml, update_job_yaml, monitor_job_status_changes
)
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

# ===== 数据模型 =====

class JobInfo(BaseModel):
    name: str
    namespace: str
    completions: int
    succeeded: int
    failed: int
    active: int
    age: str
    status: str
    labels: dict
    cluster_id: int
    cluster_name: str

class JobDetails(BaseModel):
    name: str
    namespace: str
    completions: int
    parallelism: int
    backoff_limit: int
    succeeded: int
    failed: int
    active: int
    age: str
    creation_timestamp: str
    status: str
    conditions: List[dict]
    labels: dict
    annotations: dict
    spec: dict
    status_detail: dict
    cluster_id: int
    cluster_name: str

class JobPod(BaseModel):
    name: str
    namespace: str
    status: str
    node_name: Optional[str]
    age: str
    restarts: int
    ready_containers: str
    labels: dict

class CreateJobRequest(BaseModel):
    yaml_content: str

class UpdateJobRequest(BaseModel):
    yaml_content: str

class JobTemplateInfo(BaseModel):
    id: int
    name: str
    description: Optional[str]
    category: Optional[str]
    is_public: bool
    created_by: int
    created_at: str
    updated_at: str

class CreateJobTemplateRequest(BaseModel):
    name: str
    description: Optional[str]
    category: Optional[str]
    yaml_content: str
    is_public: bool = True

class UpdateJobTemplateRequest(BaseModel):
    name: Optional[str]
    description: Optional[str]
    category: Optional[str]
    yaml_content: Optional[str]
    is_public: Optional[bool]

class JobHistoryInfo(BaseModel):
    id: int
    cluster_id: int
    namespace: str
    job_name: str
    template_id: Optional[int]
    status: str
    start_time: Optional[str]
    end_time: Optional[str]
    duration: Optional[int]
    succeeded_pods: int
    failed_pods: int
    total_pods: int
    error_message: Optional[str]
    created_by: int
    created_at: str
    updated_at: str

# ===== Jobs 管理 API =====

@router.get("/{cluster_id}/namespaces/{namespace}/jobs", response_model=List[JobInfo])
async def list_jobs(
    cluster_id: int,
    namespace: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取命名空间中的Jobs列表"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    jobs = get_namespace_jobs(cluster, namespace)
    return jobs


@router.get("/{cluster_id}/namespaces/{namespace}/jobs/{job_name}", response_model=JobDetails)
async def get_job_detail(
    cluster_id: int,
    namespace: str,
    job_name: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Job详细信息"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    job_details = get_job_details(cluster, namespace, job_name)
    if not job_details:
        raise HTTPException(status_code=404, detail="Job不存在")

    return job_details


@router.post("/{cluster_id}/namespaces/{namespace}/jobs")
async def create_new_job(
    cluster_id: int,
    namespace: str,
    request: CreateJobRequest,
    template_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建Job"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    result = create_job(cluster, namespace, {"yaml_content": request.yaml_content})

    if result["success"]:
        # 记录到历史表
        job_history = JobHistory(
            cluster_id=cluster_id,
            namespace=namespace,
            job_name=result["job_name"],
            template_id=template_id,
            status="Pending",
            created_by=current_user["id"]
        )
        db.add(job_history)
        db.commit()

    return result


@router.delete("/{cluster_id}/namespaces/{namespace}/jobs/{job_name}")
async def remove_job(
    cluster_id: int,
    namespace: str,
    job_name: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除Job"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    result = delete_job(cluster, namespace, job_name)
    return result


@router.post("/{cluster_id}/namespaces/{namespace}/jobs/{job_name}/restart")
async def restart_existing_job(
    cluster_id: int,
    namespace: str,
    job_name: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """重启Job"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    result = restart_job(cluster, namespace, job_name)

    if result["success"]:
        # 记录到历史表
        job_history = JobHistory(
            cluster_id=cluster_id,
            namespace=namespace,
            job_name=result["new_job_name"],
            status="Pending",
            created_by=current_user["id"]
        )
        db.add(job_history)
        db.commit()

    return result


@router.get("/{cluster_id}/namespaces/{namespace}/jobs/{job_name}/pods", response_model=List[JobPod])
async def get_job_associated_pods(
    cluster_id: int,
    namespace: str,
    job_name: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Job关联的Pods"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    pods = get_job_pods(cluster, namespace, job_name)
    return pods


@router.get("/{cluster_id}/namespaces/{namespace}/jobs/{job_name}/yaml")
async def get_job_yaml_config(
    cluster_id: int,
    namespace: str,
    job_name: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Job的YAML配置"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    yaml_content = get_job_yaml(cluster, namespace, job_name)
    if yaml_content is None:
        raise HTTPException(status_code=404, detail="Job不存在")

    return {"yaml_content": yaml_content}


@router.put("/{cluster_id}/namespaces/{namespace}/jobs/{job_name}/yaml")
async def update_job_yaml_config(
    cluster_id: int,
    namespace: str,
    job_name: str,
    request: UpdateJobRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新Job的YAML配置"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    result = update_job_yaml(cluster, namespace, job_name, request.yaml_content)
    return result


# ===== Job模板管理 API =====

@router.get("/templates", response_model=List[JobTemplateInfo])
async def list_job_templates(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Job模板列表"""
    query = db.query(JobTemplate)

    if category:
        query = query.filter(JobTemplate.category == category)

    # 只显示公开模板或用户自己的模板
    query = query.filter(
        (JobTemplate.is_public == True) | (JobTemplate.created_by == current_user["id"])
    )

    templates = query.order_by(JobTemplate.created_at.desc()).all()

    return [{
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "is_public": template.is_public,
        "created_by": template.created_by,
        "created_at": template.created_at.isoformat(),
        "updated_at": template.updated_at.isoformat()
    } for template in templates]


@router.post("/templates")
async def create_job_template(
    request: CreateJobTemplateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建Job模板"""
    # 检查模板名称是否已存在
    existing = db.query(JobTemplate).filter(JobTemplate.name == request.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="模板名称已存在")

    template = JobTemplate(
        name=request.name,
        description=request.description,
        category=request.category,
        yaml_content=request.yaml_content,
        is_public=request.is_public,
        created_by=current_user["id"]
    )

    db.add(template)
    db.commit()
    db.refresh(template)

    return {"success": True, "message": "模板创建成功", "template_id": template.id}


@router.get("/templates/{template_id}")
async def get_job_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Job模板详情"""
    template = db.query(JobTemplate).filter(JobTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    # 检查权限（公开模板或自己的模板）
    if not template.is_public and template.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权访问此模板")

    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "yaml_content": template.yaml_content,
        "is_public": template.is_public,
        "created_by": template.created_by,
        "created_at": template.created_at.isoformat(),
        "updated_at": template.updated_at.isoformat()
    }


@router.put("/templates/{template_id}")
async def update_job_template(
    template_id: int,
    request: UpdateJobTemplateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新Job模板"""
    template = db.query(JobTemplate).filter(JobTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    # 检查权限（只能修改自己的模板）
    if template.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改此模板")

    # 更新字段
    update_data = request.dict(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(template, field):
            setattr(template, field, value)

    template.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "message": "模板更新成功"}


@router.delete("/templates/{template_id}")
async def delete_job_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除Job模板"""
    template = db.query(JobTemplate).filter(JobTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    # 检查权限（只能删除自己的模板）
    if template.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权删除此模板")

    db.delete(template)
    db.commit()

    return {"success": True, "message": "模板删除成功"}


# ===== 批量操作 API =====

class BulkDeleteJobsRequest(BaseModel):
    job_names: List[str]

class BulkActionResponse(BaseModel):
    success: bool
    message: str
    results: List[Dict[str, Any]]

@router.post("/{cluster_id}/namespaces/{namespace}/jobs/bulk-delete")
async def bulk_delete_jobs(
    cluster_id: int,
    namespace: str,
    request: BulkDeleteJobsRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """批量删除Jobs"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    results = []
    success_count = 0

    for job_name in request.job_names:
        try:
            result = delete_job(cluster, namespace, job_name)
            results.append({
                "job_name": job_name,
                "success": result["success"],
                "message": result["message"]
            })
            if result["success"]:
                success_count += 1
        except Exception as e:
            results.append({
                "job_name": job_name,
                "success": False,
                "message": f"删除失败: {str(e)}"
            })

    return {
        "success": success_count > 0,
        "message": f"批量删除完成，成功: {success_count}/{len(request.job_names)}",
        "results": results
    }


@router.get("/{cluster_id}/namespaces/{namespace}/jobs/status")
async def get_jobs_status_overview(
    cluster_id: int,
    namespace: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取命名空间中所有Jobs的状态概览"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    jobs = get_namespace_jobs(cluster, namespace)

    # 统计各状态Job数量
    status_counts = {}
    for job in jobs:
        status = job["status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "total_jobs": len(jobs),
        "status_counts": status_counts,
        "jobs": jobs
    }


# ===== Job历史记录 API =====

@router.get("/history", response_model=List[JobHistoryInfo])
async def list_job_history(
    cluster_id: Optional[int] = None,
    namespace: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,  # 格式: YYYY-MM-DD
    end_date: Optional[str] = None,    # 格式: YYYY-MM-DD
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取Job历史记录，支持高级筛选"""
    query = db.query(JobHistory).filter(JobHistory.created_by == current_user["id"])

    if cluster_id:
        query = query.filter(JobHistory.cluster_id == cluster_id)

    if namespace:
        query = query.filter(JobHistory.namespace == namespace)

    if status:
        query = query.filter(JobHistory.status == status)

    # 时间范围筛选
    if start_date:
        from datetime import datetime
        start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.filter(JobHistory.created_at >= start_datetime)

    if end_date:
        from datetime import datetime
        end_datetime = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
        query = query.filter(JobHistory.created_at <= end_datetime)

    history = query.order_by(JobHistory.created_at.desc()).limit(limit).all()

    return [{
        "id": record.id,
        "cluster_id": record.cluster_id,
        "namespace": record.namespace,
        "job_name": record.job_name,
        "template_id": record.template_id,
        "status": record.status,
        "start_time": record.start_time.isoformat() if record.start_time else None,
        "end_time": record.end_time.isoformat() if record.end_time else None,
        "duration": record.duration,
        "succeeded_pods": record.succeeded_pods,
        "failed_pods": record.failed_pods,
        "total_pods": record.total_pods,
        "error_message": record.error_message,
        "created_by": record.created_by,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat()
    } for record in history]


@router.post("/history/{history_id}/status")
async def update_job_history_status(
    history_id: int,
    status: str,
    succeeded_pods: Optional[int] = None,
    failed_pods: Optional[int] = None,
    error_message: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新Job历史记录状态（通常由系统自动调用）"""
    record = db.query(JobHistory).filter(
        JobHistory.id == history_id,
        JobHistory.created_by == current_user["id"]
    ).first()

    if not record:
        raise HTTPException(status_code=404, detail="历史记录不存在")

    record.status = status

    if succeeded_pods is not None:
        record.succeeded_pods = succeeded_pods

    if failed_pods is not None:
        record.failed_pods = failed_pods

    if error_message is not None:
        record.error_message = error_message

    # 更新开始/结束时间
    now = datetime.utcnow()
    if status == "Running" and not record.start_time:
        record.start_time = now
    elif status in ["Succeeded", "Failed"] and not record.end_time:
        record.end_time = now
        if record.start_time:
            record.duration = int((record.end_time - record.start_time).total_seconds())

    record.updated_at = now
    db.commit()

    return {"success": True, "message": "状态更新成功"}


@router.post("/monitor/{history_id}")
async def monitor_job_status(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """监控指定Job的历史记录状态"""
    # 获取历史记录
    history_record = db.query(JobHistory).filter(
        JobHistory.id == history_id,
        JobHistory.created_by == current_user["id"]
    ).first()

    if not history_record:
        raise HTTPException(status_code=404, detail="历史记录不存在")

    # 获取集群信息
    cluster = db.query(Cluster).filter(Cluster.id == history_record.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    # 监控状态变化
    result = monitor_job_status_changes(
        cluster,
        history_record.namespace,
        history_record.job_name,
        history_id,
        db
    )

    return result
