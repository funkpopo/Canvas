from fastapi import APIRouter

from app.api.routes import cluster, cluster_config, events, namespaces, nodes, metrics, deployments

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(cluster.router)
api_router.include_router(cluster_config.router)
api_router.include_router(nodes.router)
api_router.include_router(namespaces.router)
api_router.include_router(events.router)
api_router.include_router(metrics.router)
api_router.include_router(deployments.router)
