"""
Kubernetes监控操作模块
提供Metrics Server相关的操作功能
"""

from datetime import datetime
from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import KubernetesClientContext
from .utils import parse_cpu, parse_memory


logger = get_logger(__name__)


def check_metrics_server_available(cluster: Cluster) -> bool:
    """检查metrics-server是否可用"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            # 尝试调用metrics API来检测metrics-server是否可用
            custom_api = client.CustomObjectsApi(client_instance)
            custom_api.list_cluster_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                plural="nodes",
                limit=1,
            )
            return True
        except ApiException as e:
            if e.status == 404:
                logger.warning("metrics-server API不可用: %s", e)
                return False
            logger.error("检查metrics-server可用性失败: %s", e)
            return False
        except Exception as e:
            logger.exception("检查metrics-server可用性异常: %s", e)
            return False


def get_cluster_metrics(cluster: Cluster) -> Optional[Dict[str, Any]]:
    """获取集群整体资源使用指标"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            custom_api = client.CustomObjectsApi(client_instance)
            core_v1 = client.CoreV1Api(client_instance)

            # 获取节点指标
            node_metrics = custom_api.list_cluster_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                plural="nodes",
            )

            # 计算总CPU和内存使用
            total_cpu = 0.0
            total_memory = 0
            for item in node_metrics.get("items", []):
                usage = item.get("usage", {})
                cpu_str = usage.get("cpu", "0")
                memory_str = usage.get("memory", "0")

                # 解析CPU (格式如: "100m" 或 "1")
                if cpu_str.endswith("n"):
                    total_cpu += float(cpu_str[:-1]) / 1_000_000_000
                elif cpu_str.endswith("m"):
                    total_cpu += float(cpu_str[:-1]) / 1000
                else:
                    total_cpu += float(cpu_str or 0)

                # 解析内存 (格式如: "1024Ki")
                total_memory += parse_memory(memory_str)

            # 获取节点和Pod数量
            nodes = core_v1.list_node()
            pods = core_v1.list_pod_for_all_namespaces()

            return {
                "cluster_id": cluster.id,
                "cluster_name": cluster.name,
                "cpu_usage": f"{total_cpu:.2f}",
                "memory_usage": f"{total_memory}Mi",
                "pod_count": len(pods.items),
                "node_count": len(nodes.items),
                "timestamp": datetime.utcnow().isoformat(),
            }

        except ApiException as e:
            if e.status == 404:
                logger.warning("metrics-server未部署或不可用: cluster=%s", cluster.name)
            else:
                logger.error("获取集群指标失败: cluster=%s error=%s", cluster.name, e)
            return None
        except Exception as e:
            logger.exception("获取集群指标异常: cluster=%s error=%s", cluster.name, e)
            return None


def get_node_metrics(cluster: Cluster) -> Optional[List[Dict[str, Any]]]:
    """获取集群所有节点的资源使用指标"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            custom_api = client.CustomObjectsApi(client_instance)
            core_v1 = client.CoreV1Api(client_instance)

            # 获取节点指标
            node_metrics = custom_api.list_cluster_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                plural="nodes",
            )

            # 获取节点容量信息
            nodes = core_v1.list_node()
            node_capacities = {}
            for node in nodes.items:
                node_capacities[node.metadata.name] = {
                    "cpu": parse_cpu(node.status.capacity.get("cpu", "0")),
                    "memory": parse_memory(node.status.capacity.get("memory", "0")),
                }

            metrics_list = []
            for item in node_metrics.get("items", []):
                node_name = item["metadata"]["name"]
                usage = item.get("usage", {})
                cpu_str = usage.get("cpu", "0")
                memory_str = usage.get("memory", "0")

                # 解析CPU使用量
                if cpu_str.endswith("n"):
                    cpu_usage = float(cpu_str[:-1]) / 1_000_000_000
                elif cpu_str.endswith("m"):
                    cpu_usage = float(cpu_str[:-1]) / 1000
                else:
                    cpu_usage = float(cpu_str or 0)

                # 解析内存使用量
                memory_usage = parse_memory(memory_str)

                # 计算使用百分比
                capacity = node_capacities.get(node_name, {"cpu": 1, "memory": 1})
                cpu_percentage = (cpu_usage / capacity["cpu"] * 100) if capacity["cpu"] > 0 else 0
                memory_percentage = (
                    (memory_usage / capacity["memory"] * 100) if capacity["memory"] > 0 else 0
                )

                metrics_list.append(
                    {
                        "name": node_name,
                        "cpu_usage": f"{cpu_usage:.2f}",
                        "memory_usage": f"{memory_usage}Mi",
                        "cpu_percentage": round(cpu_percentage, 2),
                        "memory_percentage": round(memory_percentage, 2),
                        "timestamp": item["timestamp"],
                    }
                )

            return metrics_list

        except ApiException as e:
            if e.status == 404:
                logger.warning("metrics-server未部署或不可用: cluster=%s", cluster.name)
            else:
                logger.error("获取节点指标失败: cluster=%s error=%s", cluster.name, e)
            return None
        except Exception as e:
            logger.exception("获取节点指标异常: cluster=%s error=%s", cluster.name, e)
            return None


def get_pod_metrics(cluster: Cluster, namespace: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
    """获取Pod资源使用指标"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            custom_api = client.CustomObjectsApi(client_instance)

            # 获取Pod指标
            if namespace:
                pod_metrics = custom_api.list_namespaced_custom_object(
                    group="metrics.k8s.io",
                    version="v1beta1",
                    namespace=namespace,
                    plural="pods",
                )
            else:
                pod_metrics = custom_api.list_cluster_custom_object(
                    group="metrics.k8s.io",
                    version="v1beta1",
                    plural="pods",
                )

            metrics_list = []
            for item in pod_metrics.get("items", []):
                pod_name = item["metadata"]["name"]
                pod_namespace = item["metadata"]["namespace"]
                containers = item.get("containers", [])

                # 累计所有容器的使用量
                total_cpu = 0.0
                total_memory = 0
                for container in containers:
                    usage = container.get("usage", {})
                    cpu_str = usage.get("cpu", "0")
                    memory_str = usage.get("memory", "0")

                    # 解析CPU
                    if cpu_str.endswith("n"):
                        total_cpu += float(cpu_str[:-1]) / 1_000_000_000
                    elif cpu_str.endswith("m"):
                        total_cpu += float(cpu_str[:-1]) / 1000
                    else:
                        total_cpu += float(cpu_str or 0)

                    # 解析内存
                    total_memory += parse_memory(memory_str)

                metrics_list.append(
                    {
                        "name": pod_name,
                        "namespace": pod_namespace,
                        "cpu_usage": f"{total_cpu:.3f}",
                        "memory_usage": f"{total_memory}Mi",
                        "timestamp": item["timestamp"],
                    }
                )

            return metrics_list

        except ApiException as e:
            if e.status == 404:
                logger.warning("metrics-server未部署或不可用: cluster=%s", cluster.name)
            else:
                logger.error("获取Pod指标失败: cluster=%s error=%s", cluster.name, e)
            return None
        except Exception as e:
            logger.exception("获取Pod指标异常: cluster=%s error=%s", cluster.name, e)
            return None


def get_namespace_metrics(cluster: Cluster) -> Optional[List[Dict[str, Any]]]:
    """获取命名空间级别的资源使用汇总"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            custom_api = client.CustomObjectsApi(client_instance)
            core_v1 = client.CoreV1Api(client_instance)

            # 获取所有命名空间
            namespaces = core_v1.list_namespace()

            # 获取所有Pod指标
            pod_metrics = custom_api.list_cluster_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                plural="pods",
            )

            # 按命名空间聚合
            namespace_usage: Dict[str, Dict[str, Any]] = {}
            for item in pod_metrics.get("items", []):
                pod_namespace = item["metadata"]["namespace"]
                containers = item.get("containers", [])

                if pod_namespace not in namespace_usage:
                    namespace_usage[pod_namespace] = {
                        "cpu": 0.0,
                        "memory": 0,
                        "pod_count": 0,
                    }

                namespace_usage[pod_namespace]["pod_count"] += 1

                # 累计容器资源使用
                for container in containers:
                    usage = container.get("usage", {})
                    cpu_str = usage.get("cpu", "0")
                    memory_str = usage.get("memory", "0")

                    # 解析CPU
                    if cpu_str.endswith("n"):
                        namespace_usage[pod_namespace]["cpu"] += float(cpu_str[:-1]) / 1_000_000_000
                    elif cpu_str.endswith("m"):
                        namespace_usage[pod_namespace]["cpu"] += float(cpu_str[:-1]) / 1000
                    else:
                        namespace_usage[pod_namespace]["cpu"] += float(cpu_str or 0)

                    # 解析内存
                    namespace_usage[pod_namespace]["memory"] += parse_memory(memory_str)

            # 构建结果列表
            metrics_list = []
            for ns in namespaces.items:
                ns_name = ns.metadata.name
                usage = namespace_usage.get(ns_name, {"cpu": 0.0, "memory": 0, "pod_count": 0})

                metrics_list.append(
                    {
                        "namespace": ns_name,
                        "cpu_usage": f"{usage['cpu']:.2f}",
                        "memory_usage": f"{usage['memory']}Mi",
                        "pod_count": usage["pod_count"],
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )

            return metrics_list

        except ApiException as e:
            if e.status == 404:
                logger.warning("metrics-server未部署或不可用: cluster=%s", cluster.name)
            else:
                logger.error("获取命名空间指标失败: cluster=%s error=%s", cluster.name, e)
            return None
        except Exception as e:
            logger.exception("获取命名空间指标异常: cluster=%s error=%s", cluster.name, e)
            return None


def install_metrics_server(
    cluster: Cluster,
    image: str = "registry.k8s.io/metrics-server/metrics-server:v0.7.0",
    insecure_tls: bool = False,
) -> bool:
    """安装metrics-server到指定集群"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            from kubernetes import client as k8s_client

            apps_v1 = k8s_client.AppsV1Api(client_instance)
            core_v1 = k8s_client.CoreV1Api(client_instance)
            rbac_v1 = k8s_client.RbacAuthorizationV1Api(client_instance)

            # 创建kube-system命名空间的ServiceAccount
            service_account = k8s_client.V1ServiceAccount(
                metadata=k8s_client.V1ObjectMeta(
                    name="metrics-server",
                    namespace="kube-system",
                )
            )

            try:
                core_v1.create_namespaced_service_account("kube-system", service_account)
            except ApiException as e:
                if e.status != 409:  # 已存在则忽略
                    raise

            # 创建ClusterRole
            cluster_role = k8s_client.V1ClusterRole(
                metadata=k8s_client.V1ObjectMeta(name="system:metrics-server"),
                rules=[
                    k8s_client.V1PolicyRule(
                        api_groups=[""],
                        resources=["nodes/metrics"],
                        verbs=["get"],
                    ),
                    k8s_client.V1PolicyRule(
                        api_groups=[""],
                        resources=["pods", "nodes"],
                        verbs=["get", "list", "watch"],
                    ),
                ],
            )

            try:
                rbac_v1.create_cluster_role(cluster_role)
            except ApiException as e:
                if e.status != 409:
                    raise

            # 创建ClusterRoleBinding
            cluster_role_binding = k8s_client.V1ClusterRoleBinding(
                metadata=k8s_client.V1ObjectMeta(name="metrics-server:system:auth-delegator"),
                role_ref=k8s_client.V1RoleRef(
                    api_group="rbac.authorization.k8s.io",
                    kind="ClusterRole",
                    name="system:metrics-server",
                ),
                subjects=[
                    k8s_client.V1Subject(
                        kind="ServiceAccount",
                        name="metrics-server",
                        namespace="kube-system",
                    )
                ],
            )

            try:
                rbac_v1.create_cluster_role_binding(cluster_role_binding)
            except ApiException as e:
                if e.status != 409:
                    raise

            # 创建Service
            service = k8s_client.V1Service(
                metadata=k8s_client.V1ObjectMeta(
                    name="metrics-server",
                    namespace="kube-system",
                    labels={"k8s-app": "metrics-server"},
                ),
                spec=k8s_client.V1ServiceSpec(
                    selector={"k8s-app": "metrics-server"},
                    ports=[
                        k8s_client.V1ServicePort(
                            name="https",
                            port=443,
                            protocol="TCP",
                            target_port=4443,
                        )
                    ],
                ),
            )

            try:
                core_v1.create_namespaced_service("kube-system", service)
            except ApiException as e:
                if e.status != 409:
                    raise

            # 创建Deployment
            container_args = [
                "--cert-dir=/tmp",
                "--secure-port=4443",
                "--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname",
                "--kubelet-use-node-status-port",
                "--metric-resolution=15s",
            ]

            if insecure_tls:
                container_args.append("--kubelet-insecure-tls")

            deployment = k8s_client.V1Deployment(
                metadata=k8s_client.V1ObjectMeta(
                    name="metrics-server",
                    namespace="kube-system",
                    labels={"k8s-app": "metrics-server"},
                ),
                spec=k8s_client.V1DeploymentSpec(
                    selector=k8s_client.V1LabelSelector(match_labels={"k8s-app": "metrics-server"}),
                    replicas=1,
                    template=k8s_client.V1PodTemplateSpec(
                        metadata=k8s_client.V1ObjectMeta(labels={"k8s-app": "metrics-server"}),
                        spec=k8s_client.V1PodSpec(
                            service_account_name="metrics-server",
                            containers=[
                                k8s_client.V1Container(
                                    name="metrics-server",
                                    image=image,
                                    args=container_args,
                                    ports=[
                                        k8s_client.V1ContainerPort(
                                            container_port=4443,
                                            name="https",
                                            protocol="TCP",
                                        )
                                    ],
                                    volume_mounts=[
                                        k8s_client.V1VolumeMount(name="tmp-dir", mount_path="/tmp")
                                    ],
                                    security_context=k8s_client.V1SecurityContext(
                                        read_only_root_filesystem=True,
                                        run_as_non_root=True,
                                        run_as_user=1000,
                                    ),
                                    resources=k8s_client.V1ResourceRequirements(
                                        requests={"cpu": "100m", "memory": "200Mi"}
                                    ),
                                )
                            ],
                            volumes=[
                                k8s_client.V1Volume(
                                    name="tmp-dir",
                                    empty_dir=k8s_client.V1EmptyDirVolumeSource(),
                                )
                            ],
                        ),
                    ),
                ),
            )

            try:
                apps_v1.create_namespaced_deployment("kube-system", deployment)
            except ApiException as e:
                if e.status == 409:
                    # 如果已存在则更新
                    apps_v1.replace_namespaced_deployment("metrics-server", "kube-system", deployment)
                else:
                    raise

            # 创建APIService
            try:
                apiregistration_v1 = k8s_client.ApiregistrationV1Api(client_instance)
                api_service = k8s_client.V1APIService(
                    metadata=k8s_client.V1ObjectMeta(name="v1beta1.metrics.k8s.io"),
                    spec=k8s_client.V1APIServiceSpec(
                        service=k8s_client.ApiregistrationV1ServiceReference(
                            name="metrics-server",
                            namespace="kube-system",
                        ),
                        group="metrics.k8s.io",
                        version="v1beta1",
                        insecure_skip_tls_verify=insecure_tls,
                        group_priority_minimum=100,
                        version_priority=100,
                    ),
                )

                try:
                    apiregistration_v1.create_api_service(api_service)
                except ApiException as e:
                    if e.status != 409:
                        raise
            except Exception as e:
                logger.warning("创建APIService失败，但其他资源已创建: %s", e)

            logger.info("metrics-server安装成功: cluster=%s", cluster.name)
            return True

        except Exception as e:
            logger.exception("安装metrics-server失败: cluster=%s error=%s", cluster.name, e)
            return False
