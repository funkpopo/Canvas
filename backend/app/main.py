from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.api.router import api_router
from app.config import get_settings
from app.db import init_db
from app.core.logging import configure_logging
from app.dependencies import get_kubernetes_service
from app.workers.scheduler import PeriodicTask


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger = structlog.get_logger("lifespan")
    logger.info("application.startup", environment=settings.app_env)

    service = get_kubernetes_service()
    cache_warm_task = PeriodicTask(
        interval_seconds=max(settings.cache_ttl_seconds, 30),
        action=service.get_cluster_overview,
        name="cluster_overview_refresh",
    )
    cache_warm_task.start()
    asyncio.create_task(service.list_workloads())

    try:
        yield
    finally:
        await cache_warm_task.stop()
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

