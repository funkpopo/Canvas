from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import structlog
from kubernetes.stream import stream

from app.api.router import api_router, public_router
from app.config import get_settings
from app.db import init_db, get_session_factory
from app.core.logging import configure_logging
from app.dependencies import get_kubernetes_service
from app.workers.scheduler import PeriodicTask
from app.websocket import ConnectionManager, K8sWatcher
from app.schemas.websocket import WebSocketMessage
from app.core.bootstrap import ensure_bootstrap
from app.core.auth import get_current_user_ws
from app.services.storage_stats import StorageStatsService


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger = structlog.get_logger("lifespan")
    logger.info("application.startup", environment=settings.app_env)

    # Ensure database schema is initialized
    await init_db()
    # Ensure baseline roles and admin user
    try:
        await ensure_bootstrap(get_session_factory())
    except Exception:
        # best-effort bootstrap; continue even if failed
        pass

    service = get_kubernetes_service()
    
    # Initialize WebSocket manager
    ws_manager = ConnectionManager()
    app.state.ws_manager = ws_manager
    # Concurrency guard for exec sessions
    app.state.exec_semaphore = asyncio.BoundedSemaphore(settings.stream_max_concurrent_exec)
    
    # Initialize K8s watcher
    k8s_watcher = None
    try:
        # Get K8s clients
        core_v1, apps_v1 = await service._ensure_clients()
        
        # Create event handler
        async def on_k8s_event(message: WebSocketMessage):
            """处理K8s事件并广播到所有WebSocket客户端"""
            await ws_manager.broadcast(message.model_dump_json())
        
        # Start K8s watcher
        k8s_watcher = K8sWatcher(apps_v1, core_v1, on_k8s_event)
        await k8s_watcher.start()
        app.state.k8s_watcher = k8s_watcher
        logger.info("k8s_watcher.initialized")
    except Exception as e:
        logger.warning("k8s_watcher.init_failed", error=str(e))

    # Periodically collect container-level metrics if metrics-server is present
    async def _collect_and_store_container_metrics() -> None:
        try:
            status = await service.get_metrics_server_status()
            if not (status.installed and status.healthy):
                return
            rows = await service.collect_container_metrics_once()
            if not rows:
                return
            session_factory = get_session_factory()
            from app.models.container_metric import ContainerMetric
            async with session_factory() as session:
                session.add_all(
                    [
                        ContainerMetric(
                            ts=ts,
                            namespace=ns,
                            pod=pod,
                            container=container,
                            cpu_mcores=cpu,
                            memory_bytes=mem,
                        )
                        for ts, ns, pod, container, cpu, mem in rows
                    ]
                )
                await session.commit()
        except Exception:
            # Best effort; avoid crashing the scheduler
            pass
    # Periodically collect node-level metrics if metrics-server is present
    async def _collect_and_store_node_metrics() -> None:
        try:
            status = await service.get_metrics_server_status()
            if not (status.installed and status.healthy):
                return
            rows = await service.collect_node_metrics_once()
            if not rows:
                return
            session_factory = get_session_factory()
            from app.models.node_metric import NodeMetric
            async with session_factory() as session:
                session.add_all(
                    [
                        NodeMetric(
                            ts=ts,
                            node=node,
                            cpu_mcores=cpu,
                            memory_bytes=mem,
                        )
                        for ts, node, cpu, mem in rows
                    ]
                )
                await session.commit()
        except Exception:
            # Best effort
            pass
    cache_warm_task = PeriodicTask(
        interval_seconds=10,
        action=service.get_cluster_overview,
        name="cluster_overview_refresh",
    )
    cache_warm_task.start()
    # Run metrics collection every 15s
    metrics_collect_task = PeriodicTask(
        interval_seconds=15,
        action=_collect_and_store_container_metrics,
        name="container_metrics_collect",
    )
    metrics_collect_task.start()
    node_metrics_collect_task = PeriodicTask(
        interval_seconds=15,
        action=_collect_and_store_node_metrics,
        name="node_metrics_collect",
    )
    node_metrics_collect_task.start()
    
    # Storage statistics collection every 15 minutes
    async def _collect_storage_stats() -> None:
        try:
            async for session in get_session_factory()():
                stats_service = StorageStatsService(service, session)
                await stats_service.collect_storage_stats()
                break  # Only use first session
        except Exception:
            # Best effort
            pass
    
    storage_stats_task = PeriodicTask(
        interval_seconds=900,  # 15 minutes
        action=_collect_storage_stats,
        name="storage_stats_collect",
    )
    storage_stats_task.start()
    
    asyncio.create_task(service.list_workloads())

    try:
        yield
    finally:
        # Stop K8s watcher
        if hasattr(app.state, "k8s_watcher") and app.state.k8s_watcher:
            await app.state.k8s_watcher.stop()
        
        await cache_warm_task.stop()
        await metrics_collect_task.stop()
        await node_metrics_collect_task.stop()
        await storage_stats_task.stop()
        logger.info("application.shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Canvas Kubernetes Backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(public_router)
    app.include_router(api_router)

    @app.get("/healthz", tags=["health"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @app.websocket("/ws/deployments")
    async def websocket_endpoint(websocket: WebSocket):
        """WebSocket endpoint for real-time deployment updates (auth required)."""
        logger = structlog.get_logger()
        # Authenticate first
        try:
            sf = get_session_factory()
            async with sf() as session:
                await get_current_user_ws(websocket, session)
        except Exception:
            try:
                await websocket.accept()
                await websocket.close(code=1008)
            except Exception:
                pass
            return

        manager: ConnectionManager = app.state.ws_manager
        await manager.connect(websocket)
        try:
            while True:
                # Keep connection alive and listen for client messages (e.g., ping)
                data = await websocket.receive_text()
                # Echo back for heartbeat
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            await manager.disconnect(websocket)
        except Exception as e:
            logger.warning("websocket.error", error=str(e))
            await manager.disconnect(websocket)

    @app.websocket("/ws/pods/{namespace}/{name}/exec")
    async def websocket_pod_exec(websocket: WebSocket, namespace: str, name: str):
        """WebSocket bridge for `kubectl exec`-like interactive sessions (auth + RBAC)."""
        logger = structlog.get_logger()
        service = get_kubernetes_service()
        # Authenticate and authorize
        try:
            sf = get_session_factory()
            async with sf() as session:
                await get_current_user_ws(websocket, session)
        except Exception:
            try:
                await websocket.accept()
                await websocket.close(code=1008)
            except Exception:
                pass
            return
        # Namespace-level RBAC: require permission to exec
        try:
            allowed = await service.check_access(verb="create", resource="pods", namespace=namespace, group="", subresource="exec")
            if not allowed:
                await websocket.accept()
                await websocket.close(code=1008)
                return
        except Exception:
            try:
                await websocket.accept()
                await websocket.close(code=1011)
            except Exception:
                pass
            return
        await websocket.accept()
        # Parse query params
        qp = dict(websocket.query_params)
        container = qp.get("container")
        raw_cmd = qp.get("cmd") or "/bin/sh"
        cmd_parts = [part for part in str(raw_cmd).split(" ") if part]

        try:
            # Concurrency limit for exec sessions
            await app.state.exec_semaphore.acquire()  # type: ignore[attr-defined]
            await service._rate_limiter.acquire()
            core_v1, _ = await service._ensure_clients()

            def _open_ws():
                return stream(
                    core_v1.connect_get_namespaced_pod_exec,
                    name,
                    namespace,
                    container=container,
                    command=cmd_parts,
                    stderr=True,
                    stdin=True,
                    stdout=True,
                    tty=True,
                    _preload_content=False,
                )

            ws_client = await asyncio.to_thread(_open_ws)

            async def _reader():
                try:
                    while ws_client.is_open():
                        out = await asyncio.to_thread(ws_client.read_stdout)
                        err = await asyncio.to_thread(ws_client.read_stderr)
                        payload = ""
                        if out:
                            payload += out
                        if err:
                            payload += err
                        if payload:
                            await websocket.send_text(payload)
                        else:
                            await asyncio.sleep(0.02)
                except Exception:
                    pass

            async def _writer():
                try:
                    while ws_client.is_open():
                        try:
                            msg = await websocket.receive_text()
                        except Exception:
                            break
                        if msg is None:
                            break
                        await asyncio.to_thread(ws_client.write_stdin, msg)
                except Exception:
                    pass

            reader = asyncio.create_task(_reader())
            writer = asyncio.create_task(_writer())
            # Enforce max session duration
            max_seconds = get_settings().exec_session_max_seconds
            if max_seconds and max_seconds > 0:
                try:
                    await asyncio.wait_for(asyncio.gather(reader, writer), timeout=max_seconds)
                except asyncio.TimeoutError:
                    pass
            else:
                await asyncio.gather(reader, writer)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning("websocket.exec.error", error=str(e))
        finally:
            try:
                await websocket.close()
            except Exception:
                pass
            try:
                app.state.exec_semaphore.release()  # type: ignore[attr-defined]
            except Exception:
                pass

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_debug,
        log_level=settings.log_level.lower(),
    )
