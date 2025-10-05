from fastapi import APIRouter, Depends

from app.api.routes import (
    cluster,
    cluster_config,
    events,
    namespaces,
    nodes,
    metrics,
    deployments,
    storage,
    services,
    pods,
    ingresses,
    networkpolicies,
    configmaps,
    secrets,
)
from app.api.routes import statefulsets, daemonsets, jobs, cronjobs
from app.api.routes import audit, authz
from app.api.routes import crds, resources, alerts, helm, auth
from app.api.routes import alert_rules
from app.api.routes import rbac
from app.core.auth import get_current_user

# Public router (no auth required): auth endpoints and alert webhook
public_router = APIRouter(prefix="/api/v1")
public_router.include_router(auth.router)
public_router.include_router(alerts.public_router)

# Secure router: all endpoints require authentication
api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(get_current_user)])
api_router.include_router(cluster.router)
api_router.include_router(cluster_config.router)
api_router.include_router(nodes.router)
api_router.include_router(namespaces.router)
api_router.include_router(events.router)
api_router.include_router(metrics.router)
api_router.include_router(deployments.router)
api_router.include_router(storage.router)
api_router.include_router(services.router)
api_router.include_router(pods.router)
api_router.include_router(ingresses.router)
api_router.include_router(networkpolicies.router)
api_router.include_router(configmaps.router)
api_router.include_router(secrets.router)
api_router.include_router(statefulsets.router)
api_router.include_router(daemonsets.router)
api_router.include_router(jobs.router)
api_router.include_router(cronjobs.router)
api_router.include_router(audit.router)
api_router.include_router(authz.router)
api_router.include_router(crds.router)
api_router.include_router(resources.router)
api_router.include_router(alerts.router)
api_router.include_router(alert_rules.router)
api_router.include_router(helm.router)
api_router.include_router(rbac.router)
