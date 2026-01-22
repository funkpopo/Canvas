import os
import asyncio
import uuid
import time
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response
from contextlib import asynccontextmanager
from .database import create_tables, init_default_user
from .routers import auth, clusters, stats, nodes, namespaces, pods, deployments, storage, services, configmaps, secrets, network_policies, resource_quotas, events, jobs, websocket, users, audit_logs, rbac, permissions, app_rbac, statefulsets, daemonsets, hpas, cronjobs, ingresses, limit_ranges, pdbs, metrics, alerts, monitoring
from .exceptions import register_exception_handlers
from .core.logging import setup_logging, get_logger
from .core.background_tasks_lock import acquire_background_tasks_lock, release_background_tasks_lock
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

    # 后台任务：可通过开关禁用，并通过文件锁避免多 worker 重复启动
    enable_bg = os.getenv("ENABLE_BACKGROUND_TASKS", "true").lower() == "true"
    bg_lock_fh = None
    alert_checker = None
    audit_stop_event = None
    audit_cleanup_task = None

    if enable_bg:
        bg_lock_fh = acquire_background_tasks_lock(logger)
        if bg_lock_fh:
            from .services.alert_checker import alert_checker as _alert_checker
            from .services.audit_archive import audit_log_cleanup_worker

            alert_checker = _alert_checker
            asyncio.create_task(alert_checker.start())
            logger.info("告警检查器已启动")

            audit_stop_event = asyncio.Event()
            audit_cleanup_task = asyncio.create_task(audit_log_cleanup_worker(audit_stop_event))
            logger.info("审计日志清理任务已启动")
        else:
            logger.info("后台任务未启动：未获取到进程锁（可能已有其他 worker 在运行后台任务）")
    else:
        logger.info("后台任务已禁用（ENABLE_BACKGROUND_TASKS=false）")

    yield

    # 关闭时执行
    logger.info("正在关闭应用...")

    # 停止告警检查器
    if alert_checker:
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
    if audit_stop_event and audit_cleanup_task:
        audit_stop_event.set()
        audit_cleanup_task.cancel()
        try:
            await audit_cleanup_task
        except asyncio.CancelledError:
            pass
        logger.info("审计日志清理任务已停止")

    release_background_tasks_lock(bg_lock_fh)

# 日志初始化需尽早执行（支持彩色/JSON输出、文件轮转）
setup_logging()

# 创建FastAPI应用
app = FastAPI(
    title="Canvas Kubernetes Management API",
    description="Kubernetes集群管理后端API",
    version="1.0.0",
    lifespan=lifespan
)

# 成功 envelope 策略：默认启用，但对大响应/特定前缀跳过，避免读完整 body 再二次序列化
SUCCESS_ENVELOPE_ENABLED = os.getenv("SUCCESS_ENVELOPE_ENABLED", "true").lower() == "true"
SUCCESS_ENVELOPE_MODE = os.getenv("SUCCESS_ENVELOPE_MODE", "skip").lower()  # skip | whitelist
SUCCESS_ENVELOPE_SKIP_PREFIXES_RAW = os.getenv(
    "SUCCESS_ENVELOPE_SKIP_PREFIXES",
    "/api/pods,/api/events,/api/metrics,/api/nodes,/api/namespaces,/api/monitoring",
)
SUCCESS_ENVELOPE_SKIP_PREFIXES = [p.strip() for p in SUCCESS_ENVELOPE_SKIP_PREFIXES_RAW.split(",") if p.strip()]
SUCCESS_ENVELOPE_WHITELIST_PREFIXES_RAW = os.getenv(
    "SUCCESS_ENVELOPE_WHITELIST_PREFIXES",
    "/api/auth,/api/users,/api/permissions,/api/rbac,/api/app-rbac,/api/clusters",
)
SUCCESS_ENVELOPE_WHITELIST_PREFIXES = [
    p.strip() for p in SUCCESS_ENVELOPE_WHITELIST_PREFIXES_RAW.split(",") if p.strip()
]
try:
    SUCCESS_ENVELOPE_MAX_BYTES = int(os.getenv("SUCCESS_ENVELOPE_MAX_BYTES", "100000"))  # 100KB
except ValueError:
    SUCCESS_ENVELOPE_MAX_BYTES = 100000


def _copy_response_headers(src: Response, dst: Response, *, drop_lower_keys: set[str]) -> None:
    """尽量保留原响应头（含重复头如 Set-Cookie），但剔除会失效的头（如 content-length）。"""
    try:
        for k_raw, v_raw in getattr(src, "raw_headers", []) or []:
            k = k_raw.decode("latin-1")
            if k.lower() in drop_lower_keys:
                continue
            v = v_raw.decode("latin-1")
            dst.headers.append(k, v)
    except Exception:
        # 兜底：raw_headers 不可用时退化为 dict 拷贝（可能丢失重复头）
        headers = dict(getattr(src, "headers", {}) or {})
        for k in list(headers.keys()):
            if k.lower() in drop_lower_keys:
                headers.pop(k, None)
        for k, v in headers.items():
            try:
                dst.headers[k] = v
            except Exception:
                pass

    # 保留 background tasks（主要用于某些 Response 类型）
    try:
        dst.background = getattr(src, "background", None)
    except Exception:
        pass


def _get_response_size_bytes(response: Response) -> Optional[int]:
    """优先使用 content-length；缺失/非法时尝试从 response.body 推断。"""
    content_length = response.headers.get("content-length")
    if content_length:
        try:
            return int(content_length)
        except ValueError:
            pass

    body = getattr(response, "body", None)
    if isinstance(body, (bytes, bytearray)):
        return len(body)
    return None

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

        if not SUCCESS_ENVELOPE_ENABLED:
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

        # 已压缩/编码的响应不要做 envelope（避免对压缩后的 body 做 JSON 拼接）
        content_encoding = (response.headers.get("content-encoding") or "").strip().lower()
        if content_encoding and content_encoding != "identity":
            final_response = response
            return final_response

        path = request.url.path or ""
        if SUCCESS_ENVELOPE_MODE == "whitelist":
            if not any(path.startswith(p) for p in SUCCESS_ENVELOPE_WHITELIST_PREFIXES):
                final_response = response
                return final_response
        else:
            if any(path.startswith(p) for p in SUCCESS_ENVELOPE_SKIP_PREFIXES):
                final_response = response
                return final_response

        # 如果响应体过大/未知大小，则跳过 envelope，避免聚合 body_iterator
        size = _get_response_size_bytes(response)
        if size is None or size <= 0:
            final_response = response
            return final_response
        if size > SUCCESS_ENVELOPE_MAX_BYTES:
            final_response = response
            return final_response

        # 尽量避免 json.loads/dumps：直接把原始 JSON body 作为 data 字段拼接到 envelope 中。
        body = getattr(response, "body", None)
        if isinstance(body, (bytes, bytearray)):
            body_bytes = bytes(body)
        else:
            chunks: list[bytes] = []
            async for chunk in response.body_iterator:
                if isinstance(chunk, (bytes, bytearray)):
                    chunks.append(bytes(chunk))
                else:
                    chunks.append(bytes(chunk))
            body_bytes = b"".join(chunks)

        data_bytes = body_bytes.strip() or b"null"
        request_id_bytes = request_id.encode("utf-8")
        wrapped_bytes = b'{"success":true,"data":' + data_bytes + b',"request_id":"' + request_id_bytes + b'"}'

        # body_iterator 已可能被消费，必须返回新 Response；复制原 headers（保留 Set-Cookie 等重复头）
        final_response = Response(
            content=wrapped_bytes,
            status_code=response.status_code,
            media_type=content_type or "application/json",
        )
        _copy_response_headers(response, final_response, drop_lower_keys={"content-length", "content-type"})
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
