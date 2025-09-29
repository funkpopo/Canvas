from fastapi import APIRouter, Depends, Query

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import OperationResult, ServiceSummary, YamlContent
from app.services.kube_client import KubernetesService


router = APIRouter(prefix="/services", tags=["services"])


@router.get("/", response_model=list[ServiceSummary], summary="List services in namespace")
async def list_services(
    namespace: str | None = Query(default=None),
    service: KubernetesService = Depends(get_kubernetes_service),
) -> list[ServiceSummary]:
    return await service.list_services(namespace=namespace)


@router.get("/{namespace}/{name}/yaml", response_model=YamlContent, summary="Get Service YAML")
async def get_service_yaml(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> YamlContent:
    text = await service.get_service_yaml(namespace=namespace, name=name)
    return YamlContent(yaml=text or "")


@router.put("/{namespace}/{name}/yaml", response_model=OperationResult, summary="Update Service YAML")
async def update_service_yaml(
    namespace: str,
    name: str,
    payload: YamlContent,
    service: KubernetesService = Depends(get_kubernetes_service),
) -> OperationResult:
    ok, msg = await service.apply_service_yaml(namespace=namespace, name=name, yaml=payload.yaml)
    return OperationResult(ok=ok, message=msg)


@router.post("/", response_model=OperationResult, summary="Create Service from YAML")
async def create_service(payload: YamlContent, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.create_service_from_yaml(payload.yaml)
    return OperationResult(ok=ok, message=msg)


@router.delete("/{namespace}/{name}", response_model=OperationResult, summary="Delete Service")
async def delete_service(namespace: str, name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.delete_service(namespace=namespace, name=name)
    return OperationResult(ok=ok, message=msg)

