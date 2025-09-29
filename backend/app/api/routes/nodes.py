from fastapi import APIRouter, Depends

from app.dependencies import get_kubernetes_service
from app.schemas.kubernetes import (
    EventMessage,
    NodeDetail,
    NodeMetrics,
    NodePodSummary,
    NodeSummary,
    OperationResult,
    YamlContent,
)
from app.services.kube_client import KubernetesService

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("/", response_model=list[NodeSummary], summary="List cluster nodes")
async def list_nodes(service: KubernetesService = Depends(get_kubernetes_service)) -> list[NodeSummary]:
    return await service.list_nodes()


@router.get("/{name}", response_model=NodeDetail, summary="Get node detail")
async def get_node_detail(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> NodeDetail:
    return await service.get_node_detail(name)


@router.get("/{name}/events", response_model=list[EventMessage], summary="List node events")
async def get_node_events(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> list[EventMessage]:
    return await service.list_node_events(name)


@router.get("/{name}/pods", response_model=list[NodePodSummary], summary="List pods on node")
async def get_node_pods(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> list[NodePodSummary]:
    return await service.list_pods_on_node(name)


@router.get("/{name}/metrics", response_model=NodeMetrics, summary="Get node metrics")
async def get_node_metrics(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> NodeMetrics:
    return await service.get_node_metrics(name)


@router.get("/{name}/yaml", response_model=YamlContent, summary="Get node YAML")
async def get_node_yaml(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> YamlContent:
    text = await service.get_node_yaml(name)
    return YamlContent(yaml=text or "")


@router.put("/{name}/yaml", response_model=OperationResult, summary="Apply node YAML")
async def update_node_yaml(name: str, payload: YamlContent, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.apply_node_yaml(name, payload.yaml)
    return OperationResult(ok=ok, message=msg)


@router.post("/{name}/schedulable", response_model=OperationResult, summary="Set node schedulable")
async def set_node_schedulable(name: str, schedulable: bool, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.set_node_schedulable(name, schedulable)
    return OperationResult(ok=ok, message=msg)


@router.post("/{name}/drain", response_model=OperationResult, summary="Drain node (cordon + evict pods)")
async def drain_node(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.drain_node(name)
    return OperationResult(ok=ok, message=msg)


@router.patch("/{name}/labels", response_model=OperationResult, summary="Patch node labels")
async def patch_node_labels(name: str, labels: dict[str, str], service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.patch_node_labels(name, labels)
    return OperationResult(ok=ok, message=msg)


@router.delete("/{name}", response_model=OperationResult, summary="Delete node")
async def delete_node(name: str, service: KubernetesService = Depends(get_kubernetes_service)) -> OperationResult:
    ok, msg = await service.delete_node(name)
    return OperationResult(ok=ok, message=msg)
