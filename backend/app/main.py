from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.api.router import api_router
from app.config import get_settings
from app.db import init_db, get_session_factory
from app.core.logging import configure_logging
from app.dependencies import get_kubernetes_service
from app.workers.scheduler import PeriodicTask


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger = structlog.get_logger("lifespan")
    logger.info("application.startup", environment=settings.app_env)

    # Ensure database schema is initialized
    await init_db()

    service = get_kubernetes_service()

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
    cache_warm_task = PeriodicTask(
        interval_seconds=max(settings.cache_ttl_seconds, 30),
        action=service.get_cluster_overview,
        name="cluster_overview_refresh",
    )
    cache_warm_task.start()
    # Run metrics collection every 60s
    metrics_collect_task = PeriodicTask(
        interval_seconds=60,
        action=_collect_and_store_container_metrics,
        name="container_metrics_collect",
    )
    metrics_collect_task.start()
    asyncio.create_task(service.list_workloads())

    try:
        yield
    finally:
        await cache_warm_task.stop()
        await metrics_collect_task.stop()
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

    app.include_router(api_router)

    @app.get("/healthz", tags=["health"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

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

