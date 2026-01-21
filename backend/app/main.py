import os
import logging
import asyncio
import json
import uuid
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response
from contextlib import asynccontextmanager
from .database import create_tables, init_default_user
from .routers import auth, clusters, stats, nodes, namespaces, pods, deployments, storage, services, configmaps, secrets, network_policies, resource_quotas, events, jobs, websocket, users, audit_logs, rbac, permissions, app_rbac, statefulsets, daemonsets, hpas, cronjobs, ingresses, limit_ranges, pdbs, metrics, alerts, monitoring
from .exceptions import register_exception_handlers
from .core.logging import setup_logging, get_logger
from .core.request_context import request_id_var
from .observability import request_metrics

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger = get_logger(__name__)

    # 启动时执行
    logger.info("正在初始化数据库...")
    create_tables()
    init_default_user()
    logger.info("数据库初始化完成")

    # 启动Kubernetes连接池清理线程
    from .services.k8s import _client_pool
    _client_pool.start_cleanup_thread()
    logger.info("Kubernetes连接池清理线程已启动")

    # 启动WebSocket心跳检测
    from .websocket_manager import manager
    await manager.start_heartbeat_monitor()
    logger.info("WebSocket心跳检测已启动")

    # 启动告警检查器
    from .services.alert_checker import alert_checker
    asyncio.create_task(alert_checker.start())
    logger.info("告警检查器已启动")

    # 启动审计日志归档/清理任务
    from .services.audit_archive import audit_log_cleanup_worker
    audit_stop_event = asyncio.Event()
    audit_cleanup_task = asyncio.create_task(audit_log_cleanup_worker(audit_stop_event))
    logger.info("审计日志清理任务已启动")

    yield

    # 关闭时执行
    logger.info("正在关闭应用...")

    # 停止告警检查器
    await alert_checker.stop()
    logger.info("告警检查器已停止")

    # 停止Kubernetes连接池清理线程
    _client_pool.stop_cleanup_thread()
    logger.info("Kubernetes连接池清理线程已停止")

    # 停止WebSocket心跳检测
    await manager.stop_heartbeat_monitor()
    logger.info("WebSocket心跳检测已停止")

    # 停止所有Kubernetes监听器
    from .services.k8s import watcher_manager
    watcher_manager.stop_all_watchers()
    logger.info("所有Kubernetes监听器已停止")

    # 停止审计日志清理任务
    audit_stop_event.set()
    audit_cleanup_task.cancel()
    try:
        await audit_cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("审计日志清理任务已停止")

# 日志初始化需尽早执行（支持彩色/JSON输出、文件轮转）
setup_logging()

# 创建FastAPI应用
app = FastAPI(
    title="Canvas Kubernetes Management API",
    description="Kubernetes集群管理后端API",
    version="1.0.0",
    lifespan=lifespan
)

# ============ request_id + 统一成功响应包装 ============
@app.middleware("http")
async def request_id_metrics_and_envelope(request, call_next):
    start = time.perf_counter()
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    token = request_id_var.set(request_id)

    response = None
    final_response = None
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        # 成功 envelope 可配置：默认启用，但对大响应/特定前缀直接透传，避免读完整 body 再二次序列化
        envelope_enabled = os.getenv("SUCCESS_ENVELOPE_ENABLED", "true").lower() == "true"
        if not envelope_enabled:
            final_response = response
            return final_response

        # 仅包装成功的 JSON 响应
        if response.status_code >= 400 or response.status_code == 204:
            final_response = response
            return final_response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            final_response = response
            return final_response

        path = request.url.path or ""
        skip_prefixes_raw = os.getenv(
            "SUCCESS_ENVELOPE_SKIP_PREFIXES",
            "/api/pods,/api/events,/api/metrics,/api/nodes,/api/namespaces,/api/monitoring",
        )
        skip_prefixes = [p.strip() for p in skip_prefixes_raw.split(",") if p.strip()]
        if any(path.startswith(p) for p in skip_prefixes):
            final_response = response
            return final_response

        # 如果响应体过大，则跳过 envelope，避免 json.loads/dumps 的 CPU/内存开销
        max_bytes = int(os.getenv("SUCCESS_ENVELOPE_MAX_BYTES", "100000"))  # 100KB
        content_length = response.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    final_response = response
                    return final_response
            except ValueError:
                # 非法 content-length 时不做大小判断，继续走后续逻辑
                pass

        # 读取 body_iterator（BaseHTTPMiddleware 返回的 response 多为流式），但仅对小 JSON 响应做聚合
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk)
        body = b"".join(chunks)

        if not body:
            final_response = response
            return final_response

        try:
            payload = json.loads(body)
        except Exception:
            # body_iterator 已被消费，必须重建响应以避免返回空 body
            headers = dict(response.headers)
            headers.pop("content-length", None)
            final_response = Response(content=body, status_code=response.status_code, headers=headers, media_type=content_type)
            return final_response

        # 已经是 envelope 则不重复包装
        if isinstance(payload, dict) and payload.get("success") is True and "request_id" in payload:
            headers = dict(response.headers)
            headers.pop("content-length", None)
            final_response = Response(content=body, status_code=response.status_code, headers=headers, media_type=content_type)
            return final_response

        wrapped = {"success": True, "data": payload, "request_id": request_id}
        headers = dict(response.headers)
        headers.pop("content-length", None)
        final_response = JSONResponse(status_code=response.status_code, content=wrapped, headers=headers)
        return final_response

    finally:
        try:
            request_id_var.reset(token)
        except Exception:
            pass
        try:
            end = time.perf_counter()
            status_code = (final_response or response).status_code if (final_response or response) else 500
            request_metrics.observe(
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=(end - start) * 1000,
            )
        except Exception:
            pass

# 配置CORS - 支持Docker环境
allowed_origins = ["http://localhost:3000", "http://frontend:3000"]
# 从环境变量获取额外允许的源，支持以逗号分隔
extra_origins = os.getenv("CORS_ORIGINS", "")
if extra_origins:
    allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

# 单次配置CORS，避免重复中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册全局异常处理
register_exception_handlers(app)

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(permissions.router, prefix="/api/permissions", tags=["permissions"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["audit-logs"])
app.include_router(rbac.router, prefix="/api/rbac", tags=["rbac"])
app.include_router(app_rbac.router, prefix="/api/app-rbac", tags=["app-rbac"])
app.include_router(clusters.router, prefix="/api/clusters", tags=["clusters"])
app.include_router(stats.router, prefix="/api/stats", tags=["statistics"])
app.include_router(nodes.router, prefix="/api/nodes", tags=["nodes"])
app.include_router(namespaces.router, prefix="/api/namespaces", tags=["namespaces"])
app.include_router(pods.router, prefix="/api/pods", tags=["pods"])
app.include_router(deployments.router, prefix="/api/deployments", tags=["deployments"])
app.include_router(storage.router, prefix="/api/storage", tags=["storage"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(configmaps.router, prefix="/api/configmaps", tags=["configmaps"])
app.include_router(secrets.router, prefix="/api/secrets", tags=["secrets"])
app.include_router(network_policies.router, prefix="/api/network-policies", tags=["network-policies"])
app.include_router(resource_quotas.router, prefix="/api/resource-quotas", tags=["resource-quotas"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(statefulsets.router, prefix="/api/statefulsets", tags=["statefulsets"])
app.include_router(daemonsets.router, prefix="/api/daemonsets", tags=["daemonsets"])
app.include_router(hpas.router, prefix="/api/hpas", tags=["hpas"])
app.include_router(cronjobs.router, prefix="/api/cronjobs", tags=["cronjobs"])
app.include_router(ingresses.router, prefix="/api/ingresses", tags=["ingresses"])
app.include_router(limit_ranges.router, prefix="/api/limit-ranges", tags=["limit-ranges"])
app.include_router(pdbs.router, prefix="/api/pdbs", tags=["pdbs"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(websocket.router, prefix="/api", tags=["websocket"])


@app.get("/")
async def root():
    return {"message": "Canvas Kubernetes Management API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
