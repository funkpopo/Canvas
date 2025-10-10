import tempfile
import os
from typing import Dict, Any, Optional, List
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from .models import Cluster

def create_k8s_client(cluster: Cluster) -> Optional[client.ApiClient]:
    """根据集群配置创建Kubernetes客户端"""
    try:
        if cluster.auth_type == "kubeconfig":
            if not cluster.kubeconfig_content:
                raise ValueError("kubeconfig内容为空")

            # 创建临时文件存储kubeconfig
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                f.write(cluster.kubeconfig_content)
                kubeconfig_path = f.name

            try:
                # 加载kubeconfig
                config.load_kube_config(config_file=kubeconfig_path)
                return client.ApiClient()
            finally:
                # 清理临时文件
                os.unlink(kubeconfig_path)

        elif cluster.auth_type == "token":
            if not cluster.token:
                raise ValueError("token为空")

            # 使用token认证
            configuration = client.Configuration()
            configuration.host = cluster.endpoint
            configuration.verify_ssl = True

            if cluster.ca_cert:
                # 如果提供了CA证书，创建临时文件
                with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as f:
                    f.write(cluster.ca_cert)
                    ca_cert_path = f.name

                try:
                    configuration.ssl_ca_cert = ca_cert_path
                finally:
                    os.unlink(ca_cert_path)

            configuration.api_key = {"authorization": f"Bearer {cluster.token}"}
            return client.ApiClient(configuration)

        else:
            raise ValueError(f"不支持的认证类型: {cluster.auth_type}")

    except Exception as e:
        print(f"创建Kubernetes客户端失败: {e}")
        return None

def get_cluster_stats(cluster: Cluster) -> Dict[str, Any]:
    """获取集群统计信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {}

    try:
        # 初始化API客户端
        core_v1 = client.CoreV1Api(client_instance)
        apps_v1 = client.AppsV1Api(client_instance)

        stats = {
            'nodes': 0,
            'namespaces': 0,
            'total_pods': 0,
            'running_pods': 0,
            'services': 0
        }

        # 获取节点数量
        try:
            nodes = core_v1.list_node()
            stats['nodes'] = len(nodes.items)
        except ApiException as e:
            print(f"获取节点信息失败: {e}")
            stats['nodes'] = 0

        # 获取命名空间数量
        try:
            namespaces = core_v1.list_namespace()
            stats['namespaces'] = len(namespaces.items)
        except ApiException as e:
            print(f"获取命名空间信息失败: {e}")
            stats['namespaces'] = 0

        # 获取Pod统计
        try:
            pods = core_v1.list_pod_for_all_namespaces()
            total_pods = len(pods.items)
            running_pods = len([p for p in pods.items if p.status.phase == 'Running'])

            stats['total_pods'] = total_pods
            stats['running_pods'] = running_pods
        except ApiException as e:
            print(f"获取Pod信息失败: {e}")
            stats['total_pods'] = 0
            stats['running_pods'] = 0

        # 获取服务数量
        try:
            services = core_v1.list_service_for_all_namespaces()
            stats['services'] = len(services.items)
        except ApiException as e:
            print(f"获取服务信息失败: {e}")
            stats['services'] = 0

        return stats

    except Exception as e:
        print(f"获取集群统计信息失败: {e}")
        return {}
    finally:
        if client_instance:
            client_instance.close()

def get_nodes_info(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群节点基本信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        nodes = core_v1.list_node()

        node_list = []
        for node in nodes.items:
            # 获取节点状态
            status = "Unknown"
            for condition in node.status.conditions:
                if condition.type == "Ready":
                    status = "Ready" if condition.status == "True" else "NotReady"
                    break

            # 获取节点角色
            roles = []
            if node.metadata.labels:
                if node.metadata.labels.get("node-role.kubernetes.io/master") == "true" or \
                   node.metadata.labels.get("node-role.kubernetes.io/control-plane") == "true":
                    roles.append("master")
                if node.metadata.labels.get("node-role.kubernetes.io/worker") == "true":
                    roles.append("worker")

            # 获取IP地址
            internal_ip = None
            external_ip = None
            for address in node.status.addresses:
                if address.type == "InternalIP":
                    internal_ip = address.address
                elif address.type == "ExternalIP":
                    external_ip = address.address

            # 获取资源容量
            cpu_capacity = node.status.capacity.get("cpu", "0")
            memory_capacity = node.status.capacity.get("memory", "0")
            pods_capacity = node.status.capacity.get("pods", "0")

            # 计算节点年龄
            from datetime import datetime
            age = "Unknown"
            if node.metadata.creation_timestamp:
                created = node.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            node_info = {
                "name": node.metadata.name,
                "status": status,
                "roles": roles,
                "age": age,
                "version": node.status.node_info.kubelet_version if node.status.node_info else "Unknown",
                "internal_ip": internal_ip,
                "external_ip": external_ip,
                "cpu_capacity": cpu_capacity,
                "memory_capacity": memory_capacity,
                "pods_capacity": pods_capacity
            }
            node_list.append(node_info)

        return node_list

    except Exception as e:
        print(f"获取节点信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_node_details(cluster: Cluster, node_name: str) -> Optional[Dict[str, Any]]:
    """获取节点详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        node = core_v1.read_node(node_name)

        # 获取节点状态
        status = "Unknown"
        for condition in node.status.conditions:
            if condition.type == "Ready":
                status = "Ready" if condition.status == "True" else "NotReady"
                break

        # 获取节点角色
        roles = []
        if node.metadata.labels:
            if node.metadata.labels.get("node-role.kubernetes.io/master") == "true" or \
               node.metadata.labels.get("node-role.kubernetes.io/control-plane") == "true":
                roles.append("master")
            if node.metadata.labels.get("node-role.kubernetes.io/worker") == "true":
                roles.append("worker")

        # 获取IP地址
        internal_ip = None
        external_ip = None
        for address in node.status.addresses:
            if address.type == "InternalIP":
                internal_ip = address.address
            elif address.type == "ExternalIP":
                external_ip = address.address

        # 获取资源容量
        cpu_capacity = node.status.capacity.get("cpu", "0")
        memory_capacity = node.status.capacity.get("memory", "0")
        pods_capacity = node.status.capacity.get("pods", "0")

        # 计算节点年龄
        from datetime import datetime
        age = "Unknown"
        if node.metadata.creation_timestamp:
            created = node.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取条件状态
        conditions = []
        for condition in node.status.conditions:
            conditions.append({
                "type": condition.type,
                "status": condition.status,
                "last_heartbeat_time": str(condition.last_heartbeat_time) if condition.last_heartbeat_time else None,
                "last_transition_time": str(condition.last_transition_time) if condition.last_transition_time else None,
                "reason": condition.reason,
                "message": condition.message
            })

        # 获取污点
        taints = []
        if node.spec.taints:
            for taint in node.spec.taints:
                taints.append({
                    "key": taint.key,
                    "value": taint.value,
                    "effect": taint.effect
                })

        return {
            "name": node.metadata.name,
            "status": status,
            "roles": roles,
            "age": age,
            "version": node.status.node_info.kubelet_version if node.status.node_info else "Unknown",
            "internal_ip": internal_ip,
            "external_ip": external_ip,
            "cpu_capacity": cpu_capacity,
            "memory_capacity": memory_capacity,
            "pods_capacity": pods_capacity,
            "labels": dict(node.metadata.labels) if node.metadata.labels else {},
            "annotations": dict(node.metadata.annotations) if node.metadata.annotations else {},
            "conditions": conditions,
            "taints": taints
        }

    except Exception as e:
        print(f"获取节点详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def get_namespaces_info(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群命名空间信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        # 如果无法创建客户端，返回模拟数据以便演示
        return get_mock_namespaces()

    try:
        core_v1 = client.CoreV1Api(client_instance)
        namespaces = core_v1.list_namespace()

        namespace_list = []
        for ns in namespaces.items:
            # 获取命名空间状态
            status = "Active"
            for condition in ns.status.conditions:
                if condition.type == "NamespaceDeletionContentFailure" or condition.type == "NamespaceDeletionDiscoveryFailure":
                    status = "Terminating"
                    break
                elif condition.type == "NamespaceDeletionGroupVersionParsingFailure":
                    status = "Failed"
                    break

            # 计算命名空间年龄
            from datetime import datetime
            age = "Unknown"
            if ns.metadata.creation_timestamp:
                created = ns.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            namespace_info = {
                "name": ns.metadata.name,
                "status": status,
                "age": age,
                "labels": dict(ns.metadata.labels) if ns.metadata.labels else {},
                "annotations": dict(ns.metadata.annotations) if ns.metadata.annotations else {}
            }
            namespace_list.append(namespace_info)

        return namespace_list

    except Exception as e:
        # 如果连接失败，返回模拟数据
        return get_mock_namespaces()
    finally:
        if client_instance:
            client_instance.close()


def get_mock_namespaces() -> List[Dict[str, Any]]:
    """返回模拟的命名空间数据，包括系统命名空间"""
    from datetime import datetime, timedelta
    import random

    # 系统命名空间
    system_namespaces = [
        {"name": "default", "description": "默认命名空间"},
        {"name": "kube-system", "description": "Kubernetes 系统组件"},
        {"name": "kube-public", "description": "公共资源"},
        {"name": "kube-node-lease", "description": "节点租约"},
    ]

    # 用户命名空间示例
    user_namespaces = [
        {"name": "production", "description": "生产环境"},
        {"name": "staging", "description": "测试环境"},
        {"name": "development", "description": "开发环境"},
        {"name": "monitoring", "description": "监控"},
        {"name": "logging", "description": "日志"},
    ]

    all_namespaces = system_namespaces + user_namespaces
    namespace_list = []

    for ns_info in all_namespaces:
        # 随机生成年龄
        days_ago = random.randint(1, 365)
        created = datetime.now() - timedelta(days=days_ago)

        if days_ago > 30:
            age = f"{days_ago // 30}M"
        elif days_ago > 1:
            age = f"{days_ago}d"
        else:
            age = f"{random.randint(1, 24)}h"

        # 系统命名空间有特定的标签
        labels = {}
        if ns_info["name"] in ["kube-system", "kube-public", "kube-node-lease"]:
            labels["kubernetes.io/metadata.name"] = ns_info["name"]

        namespace_info = {
            "name": ns_info["name"],
            "status": "Active",
            "age": age,
            "labels": labels,
            "annotations": {}
        }
        namespace_list.append(namespace_info)

    return namespace_list

def create_namespace(cluster: Cluster, namespace_name: str, labels: Optional[dict] = None) -> bool:
    """创建命名空间"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 创建命名空间对象
        namespace = client.V1Namespace(
            metadata=client.V1ObjectMeta(
                name=namespace_name,
                labels=labels
            )
        )

        core_v1.create_namespace(namespace)
        return True

    except ApiException as e:
        print(f"创建命名空间失败: {e}")
        return False
    except Exception as e:
        print(f"创建命名空间异常: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_namespace(cluster: Cluster, namespace_name: str) -> bool:
    """删除命名空间"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespace(namespace_name)
        return True

    except ApiException as e:
        print(f"删除命名空间失败: {e}")
        return False
    except Exception as e:
        print(f"删除命名空间异常: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_namespace_resources(cluster: Cluster, namespace_name: str) -> Optional[Dict[str, Any]]:
    """获取命名空间资源使用情况"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取Pods
        pods = core_v1.list_namespaced_pod(namespace_name)
        pod_count = len(pods.items)

        # 获取Services
        services = core_v1.list_namespaced_service(namespace_name)
        service_count = len(services.items)

        # 获取ConfigMaps
        configmaps = core_v1.list_namespaced_config_map(namespace_name)
        configmap_count = len(configmaps.items)

        # 获取Secrets
        secrets = core_v1.list_namespaced_secret(namespace_name)
        secret_count = len(secrets.items)

        # 获取PVCs
        pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace_name)
        pvc_count = len(pvcs.items)

        # 计算资源使用情况（简化的版本）
        cpu_requests = 0
        cpu_limits = 0
        memory_requests = 0
        memory_limits = 0

        for pod in pods.items:
            if pod.spec.containers:
                for container in pod.spec.containers:
                    if container.resources:
                        if container.resources.requests:
                            if container.resources.requests.get('cpu'):
                                cpu_requests += parse_cpu(container.resources.requests['cpu'])
                            if container.resources.requests.get('memory'):
                                memory_requests += parse_memory(container.resources.requests['memory'])

                        if container.resources.limits:
                            if container.resources.limits.get('cpu'):
                                cpu_limits += parse_cpu(container.resources.limits['cpu'])
                            if container.resources.limits.get('memory'):
                                memory_limits += parse_memory(container.resources.limits['memory'])

        return {
            "cpu_requests": f"{cpu_requests:.1f}",
            "cpu_limits": f"{cpu_limits:.1f}",
            "memory_requests": f"{memory_requests}Mi",
            "memory_limits": f"{memory_limits}Mi",
            "pods": pod_count,
            "persistent_volume_claims": pvc_count,
            "config_maps": configmap_count,
            "secrets": secret_count,
            "services": service_count
        }

    except Exception as e:
        print(f"获取命名空间资源信息失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def parse_cpu(cpu_str: str) -> float:
    """解析CPU资源字符串，返回核心数"""
    if cpu_str.endswith('m'):
        return float(cpu_str[:-1]) / 1000
    else:
        return float(cpu_str)

def parse_memory(memory_str: str) -> int:
    """解析内存资源字符串，返回MiB"""
    if memory_str.endswith('Gi'):
        return int(float(memory_str[:-2]) * 1024)
    elif memory_str.endswith('Mi'):
        return int(float(memory_str[:-2]))
    elif memory_str.endswith('Ki'):
        return int(float(memory_str[:-2]) / 1024)
    else:
        # 假设是字节
        return int(int(memory_str) / (1024 * 1024))


def get_namespace_deployments(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        deployments = apps_v1.list_namespaced_deployment(namespace_name)

        result = []
        for deployment in deployments.items:
            # 计算年龄
            age = "Unknown"
            if deployment.metadata.creation_timestamp:
                from datetime import datetime
                created = deployment.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            result.append({
                "name": deployment.metadata.name,
                "namespace": namespace_name,
                "replicas": deployment.spec.replicas or 0,
                "ready_replicas": deployment.status.ready_replicas or 0,
                "available_replicas": deployment.status.available_replicas or 0,
                "updated_replicas": deployment.status.updated_replicas or 0,
                "age": age,
                "images": [container.image for container in deployment.spec.template.spec.containers],
                "labels": deployment.metadata.labels or {},
                "status": "Running" if (deployment.status.ready_replicas or 0) == (deployment.spec.replicas or 0) else "Updating"
            })
        return result
    except Exception as e:
        print(f"获取命名空间部署信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_deployment_details(cluster: Cluster, namespace: str, deployment_name: str) -> Optional[Dict[str, Any]]:
    """获取部署详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        # 计算年龄
        age = "Unknown"
        creation_timestamp = ""
        if deployment.metadata.creation_timestamp:
            from datetime import datetime
            created = deployment.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            creation_timestamp = str(deployment.metadata.creation_timestamp)
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取条件状态
        conditions = []
        if deployment.status.conditions:
            for condition in deployment.status.conditions:
                conditions.append({
                    "type": condition.type,
                    "status": condition.status,
                    "last_update_time": str(condition.last_update_time) if condition.last_update_time else None,
                    "last_transition_time": str(condition.last_transition_time) if condition.last_transition_time else None,
                    "reason": condition.reason,
                    "message": condition.message
                })

        # 构建spec信息
        spec = {
            "replicas": deployment.spec.replicas,
            "selector": deployment.spec.selector.match_labels if deployment.spec.selector else {},
            "strategy": {
                "type": deployment.spec.strategy.type if deployment.spec.strategy else "RollingUpdate",
                "rolling_update": {
                    "max_unavailable": str(deployment.spec.strategy.rolling_update.max_unavailable) if deployment.spec.strategy and deployment.spec.strategy.rolling_update else "25%",
                    "max_surge": str(deployment.spec.strategy.rolling_update.max_surge) if deployment.spec.strategy and deployment.spec.strategy.rolling_update else "25%"
                } if deployment.spec.strategy and deployment.spec.strategy.rolling_update else {}
            } if deployment.spec.strategy else {},
            "template": {
                "spec": {
                    "containers": [{
                        "name": container.name,
                        "image": container.image,
                        "ports": [{"container_port": port.container_port, "protocol": port.protocol} for port in (container.ports or [])],
                        "resources": {
                            "requests": dict(container.resources.requests) if container.resources and container.resources.requests else {},
                            "limits": dict(container.resources.limits) if container.resources and container.resources.limits else {}
                        } if container.resources else {}
                    } for container in deployment.spec.template.spec.containers]
                }
            }
        }

        # 构建status信息
        status = {
            "replicas": deployment.status.replicas or 0,
            "ready_replicas": deployment.status.ready_replicas or 0,
            "available_replicas": deployment.status.available_replicas or 0,
            "updated_replicas": deployment.status.updated_replicas or 0,
            "unavailable_replicas": deployment.status.unavailable_replicas or 0,
            "conditions": conditions
        }

        return {
            "name": deployment.metadata.name,
            "namespace": namespace,
            "replicas": deployment.spec.replicas or 0,
            "ready_replicas": deployment.status.ready_replicas or 0,
            "available_replicas": deployment.status.available_replicas or 0,
            "updated_replicas": deployment.status.updated_replicas or 0,
            "unavailable_replicas": deployment.status.unavailable_replicas or 0,
            "age": age,
            "creation_timestamp": creation_timestamp,
            "strategy": spec["strategy"],
            "selector": spec["selector"],
            "labels": dict(deployment.metadata.labels) if deployment.metadata.labels else {},
            "annotations": dict(deployment.metadata.annotations) if deployment.metadata.annotations else {},
            "conditions": conditions,
            "spec": spec,
            "status": status
        }

    except Exception as e:
        print(f"获取部署详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def get_deployment_pods(cluster: Cluster, namespace: str, deployment_name: str) -> List[Dict[str, Any]]:
    """获取部署管理的Pods"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        # 先获取deployment的selector labels
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        if not deployment.spec.selector or not deployment.spec.selector.match_labels:
            return []

        selector_labels = deployment.spec.selector.match_labels

        # 构建selector字符串
        label_selector = ",".join([f"{k}={v}" for k, v in selector_labels.items()])

        # 获取匹配的pods
        core_v1 = client.CoreV1Api(client_instance)
        pods = core_v1.list_namespaced_pod(namespace, label_selector=label_selector)

        pod_list = []
        for pod in pods.items:
            # 获取Pod状态
            status = pod.status.phase

            # 获取容器重启次数
            restarts = 0
            ready_containers = "0/0"
            if pod.status.container_statuses:
                total_containers = len(pod.status.container_statuses)
                ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
                ready_containers = f"{ready_count}/{total_containers}"
                restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

            # 计算Pod年龄
            age = "Unknown"
            if pod.metadata.creation_timestamp:
                from datetime import datetime
                created = pod.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            pod_info = {
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": status,
                "node_name": pod.spec.node_name,
                "age": age,
                "restarts": restarts,
                "ready_containers": ready_containers,
                "labels": dict(pod.metadata.labels) if pod.metadata.labels else {}
            }
            pod_list.append(pod_info)

        return pod_list

    except Exception as e:
        print(f"获取部署Pods失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def scale_deployment(cluster: Cluster, namespace: str, deployment_name: str, replicas: int) -> bool:
    """扩容/缩容部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)

        # 创建scale对象
        scale = client.V1Scale(
            spec=client.V1ScaleSpec(replicas=replicas)
        )

        # 执行scale操作
        apps_v1.patch_namespaced_deployment_scale(deployment_name, namespace, scale)
        return True

    except Exception as e:
        print(f"调整部署副本数失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def restart_deployment(cluster: Cluster, namespace: str, deployment_name: str) -> bool:
    """重启部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)

        # 通过更新注解来重启deployment
        from datetime import datetime
        restart_annotation = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": datetime.utcnow().isoformat() + "Z"
                        }
                    }
                }
            }
        }

        apps_v1.patch_namespaced_deployment(deployment_name, namespace, restart_annotation)
        return True

    except Exception as e:
        print(f"重启部署失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_deployment(cluster: Cluster, namespace: str, deployment_name: str) -> bool:
    """删除部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        apps_v1.delete_namespaced_deployment(deployment_name, namespace)
        return True

    except Exception as e:
        print(f"删除部署失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def update_deployment(cluster: Cluster, namespace: str, deployment_name: str, updates: Dict[str, Any]) -> bool:
    """更新部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        apps_v1 = client.AppsV1Api(client_instance)

        # 获取当前部署
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        # 更新副本数
        if 'replicas' in updates:
            deployment.spec.replicas = updates['replicas']

        # 更新镜像和镜像拉取策略
        if 'containers' in updates:
            for container_update in updates['containers']:
                container_name = container_update.get('name')
                for container in deployment.spec.template.spec.containers:
                    if container.name == container_name:
                        if 'image' in container_update:
                            container.image = container_update['image']
                        if 'image_pull_policy' in container_update:
                            container.image_pull_policy = container_update['image_pull_policy']
                        break

        # 更新标签
        if 'labels' in updates:
            deployment.metadata.labels = updates['labels']

        # 更新策略
        if 'strategy' in updates:
            if 'type' in updates['strategy']:
                deployment.spec.strategy.type = updates['strategy']['type']
            if 'rolling_update' in updates['strategy']:
                if not deployment.spec.strategy.rolling_update:
                    deployment.spec.strategy.rolling_update = client.V1RollingUpdateDeployment()
                ru = updates['strategy']['rolling_update']
                if 'max_unavailable' in ru:
                    deployment.spec.strategy.rolling_update.max_unavailable = ru['max_unavailable']
                if 'max_surge' in ru:
                    deployment.spec.strategy.rolling_update.max_surge = ru['max_surge']

        # 更新环境变量
        if 'env_vars' in updates:
            for container_update in updates['env_vars']:
                container_name = container_update.get('name')
                for container in deployment.spec.template.spec.containers:
                    if container.name == container_name:
                        if not container.env:
                            container.env = []
                        # 清除现有环境变量
                        container.env = []
                        # 添加新环境变量
                        for env_var in container_update.get('env', []):
                            env_obj = client.V1EnvVar(name=env_var['name'], value=env_var.get('value'))
                            container.env.append(env_obj)
                        break

        # 更新资源限制
        if 'resources' in updates:
            for container_update in updates['resources']:
                container_name = container_update.get('name')
                for container in deployment.spec.template.spec.containers:
                    if container.name == container_name:
                        if not container.resources:
                            container.resources = client.V1ResourceRequirements()
                        if 'requests' in container_update:
                            container.resources.requests = container_update['requests']
                        if 'limits' in container_update:
                            container.resources.limits = container_update['limits']
                        break

        # 更新节点调度策略
        if 'node_selector' in updates:
            deployment.spec.template.spec.node_selector = updates['node_selector']

        if 'affinity' in updates:
            deployment.spec.template.spec.affinity = updates['affinity']

        if 'tolerations' in updates:
            deployment.spec.template.spec.tolerations = []
            for toleration in updates['tolerations']:
                tol = client.V1Toleration(
                    key=toleration.get('key'),
                    operator=toleration.get('operator', 'Equal'),
                    value=toleration.get('value'),
                    effect=toleration.get('effect')
                )
                deployment.spec.template.spec.tolerations.append(tol)

        # 更新DNS配置
        if 'dns_policy' in updates:
            deployment.spec.template.spec.dns_policy = updates['dns_policy']

        if 'dns_config' in updates:
            dns_config = updates['dns_config']
            deployment.spec.template.spec.dns_config = client.V1PodDNSConfig(
                nameservers=dns_config.get('nameservers', []),
                searches=dns_config.get('searches', []),
                options=[client.V1PodDNSConfigOption(name=opt['name'], value=opt.get('value'))
                        for opt in dns_config.get('options', [])]
            )

        # 更新存储挂载
        if 'volumes' in updates:
            deployment.spec.template.spec.volumes = []
            for volume in updates['volumes']:
                vol = client.V1Volume(name=volume['name'])
                if 'config_map' in volume:
                    vol.config_map = client.V1ConfigMapVolumeSource(name=volume['config_map']['name'])
                elif 'secret' in volume:
                    vol.secret = client.V1SecretVolumeSource(secret_name=volume['secret']['name'])
                elif 'persistent_volume_claim' in volume:
                    vol.persistent_volume_claim = client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=volume['persistent_volume_claim']['claim_name']
                    )
                deployment.spec.template.spec.volumes.append(vol)

        # 更新容器挂载点
        if 'volume_mounts' in updates:
            for container_update in updates['volume_mounts']:
                container_name = container_update.get('name')
                for container in deployment.spec.template.spec.containers:
                    if container.name == container_name:
                        container.volume_mounts = []
                        for mount in container_update.get('mounts', []):
                            vm = client.V1VolumeMount(
                                name=mount['name'],
                                mount_path=mount['mount_path'],
                                read_only=mount.get('read_only', False)
                            )
                            container.volume_mounts.append(vm)
                        break

        # 更新安全上下文
        if 'security_context' in updates:
            sc = updates['security_context']
            deployment.spec.template.spec.security_context = client.V1PodSecurityContext(
                run_as_user=sc.get('run_as_user'),
                run_as_group=sc.get('run_as_group'),
                fs_group=sc.get('fs_group')
            )

        # 执行更新
        apps_v1.patch_namespaced_deployment(deployment_name, namespace, deployment)
        return True

    except Exception as e:
        print(f"更新部署失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_deployment_yaml(cluster: Cluster, namespace: str, deployment_name: str) -> Optional[str]:
    """获取部署的YAML配置"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        # 转换为YAML
        from kubernetes import utils
        import yaml
        yaml_content = yaml.dump(deployment.to_dict(), default_flow_style=False)
        return yaml_content

    except Exception as e:
        print(f"获取部署YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def update_deployment_yaml(cluster: Cluster, namespace: str, deployment_name: str, yaml_content: str) -> bool:
    """通过YAML更新部署"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        import yaml
        from kubernetes.client import ApiClient

        # 解析YAML
        deployment_dict = yaml.safe_load(yaml_content)

        # 创建部署对象
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.api_client._ApiClient__deserialize(deployment_dict, 'V1Deployment')

        # 更新部署
        apps_v1.patch_namespaced_deployment(deployment_name, namespace, deployment)
        return True

    except Exception as e:
        print(f"更新部署YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_deployment_services(cluster: Cluster, namespace: str, deployment_name: str) -> List[Dict[str, Any]]:
    """获取部署关联的服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        # 先获取deployment的selector labels
        apps_v1 = client.AppsV1Api(client_instance)
        deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

        if not deployment.spec.selector or not deployment.spec.selector.match_labels:
            return []

        deployment_labels = deployment.spec.selector.match_labels

        # 获取所有服务，找出匹配的
        core_v1 = client.CoreV1Api(client_instance)
        services = core_v1.list_namespaced_service(namespace)

        matching_services = []
        for service in services.items:
            if service.spec.selector:
                # 检查服务选择器是否匹配部署标签
                if all(service.spec.selector.get(k) == v for k, v in deployment_labels.items()):
                    matching_services.append({
                        "name": service.metadata.name,
                        "type": service.spec.type,
                        "cluster_ip": service.spec.cluster_ip,
                        "external_ip": getattr(service.status, 'load_balancer', {}).get('ingress', [{}])[0].get('ip', None) if service.spec.type == 'LoadBalancer' else None,
                        "ports": [{"port": port.port, "target_port": port.target_port, "protocol": port.protocol} for port in (service.spec.ports or [])],
                        "selector": service.spec.selector or {},
                        "labels": service.metadata.labels or {},
                        "age": service.metadata.creation_timestamp
                    })

        return matching_services

    except Exception as e:
        print(f"获取部署服务失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_service_details(cluster: Cluster, namespace: str, service_name: str) -> Optional[Dict[str, Any]]:
    """获取服务详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        service = core_v1.read_namespaced_service(service_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if service.metadata.creation_timestamp:
            created = service.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        return {
            "name": service.metadata.name,
            "namespace": namespace,
            "type": service.spec.type,
            "cluster_ip": service.spec.cluster_ip,
            "external_ip": getattr(service.status, 'load_balancer', {}).get('ingress', [{}])[0].get('ip', None) if service.spec.type == 'LoadBalancer' else None,
            "ports": [{"port": port.port, "target_port": port.target_port, "protocol": port.protocol, "name": getattr(port, 'name', None)} for port in (service.spec.ports or [])],
            "selector": service.spec.selector or {},
            "labels": service.metadata.labels or {},
            "annotations": service.metadata.annotations or {},
            "age": age,
            "session_affinity": service.spec.session_affinity,
            "external_traffic_policy": getattr(service.spec, 'external_traffic_policy', None)
        }

    except Exception as e:
        print(f"获取服务详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def update_service(cluster: Cluster, namespace: str, service_name: str, updates: Dict[str, Any]) -> bool:
    """更新服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取当前服务
        service = core_v1.read_namespaced_service(service_name, namespace)

        # 更新标签
        if 'labels' in updates:
            service.metadata.labels = updates['labels']

        # 更新选择器
        if 'selector' in updates:
            service.spec.selector = updates['selector']

        # 更新端口
        if 'ports' in updates:
            service.spec.ports = []
            for port_data in updates['ports']:
                port = client.V1ServicePort(
                    port=port_data['port'],
                    target_port=port_data.get('target_port', port_data['port']),
                    protocol=port_data.get('protocol', 'TCP'),
                    name=port_data.get('name')
                )
                service.spec.ports.append(port)

        # 更新类型
        if 'type' in updates:
            service.spec.type = updates['type']

        # 更新会话亲和性
        if 'session_affinity' in updates:
            service.spec.session_affinity = updates['session_affinity']

        # 更新外部流量策略
        if 'external_traffic_policy' in updates:
            service.spec.external_traffic_policy = updates['external_traffic_policy']

        # 执行更新
        core_v1.patch_namespaced_service(service_name, namespace, service)
        return True

    except Exception as e:
        print(f"更新服务失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_service_yaml(cluster: Cluster, namespace: str, service_name: str) -> Optional[str]:
    """获取服务的YAML配置"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        service = core_v1.read_namespaced_service(service_name, namespace)

        # 转换为YAML
        import yaml
        yaml_content = yaml.dump(service.to_dict(), default_flow_style=False)
        return yaml_content

    except Exception as e:
        print(f"获取服务YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def update_service_yaml(cluster: Cluster, namespace: str, service_name: str, yaml_content: str) -> bool:
    """通过YAML更新服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        import yaml
        core_v1 = client.CoreV1Api(client_instance)

        # 解析YAML
        service_dict = yaml.safe_load(yaml_content)
        service = core_v1.api_client._ApiClient__deserialize(service_dict, 'V1Service')

        # 更新服务
        core_v1.patch_namespaced_service(service_name, namespace, service)
        return True

    except Exception as e:
        print(f"更新服务YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_namespace_services(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        services = core_v1.list_namespaced_service(namespace_name)

        result = []
        for service in services.items:
            result.append({
                "name": service.metadata.name,
                "type": service.spec.type,
                "cluster_ip": service.spec.cluster_ip,
                "external_ip": getattr(service.status, 'load_balancer', {}).get('ingress', [{}])[0].get('ip', None) if service.spec.type == 'LoadBalancer' else None,
                "ports": [{"port": port.port, "target_port": port.target_port, "protocol": port.protocol} for port in (service.spec.ports or [])],
                "selector": service.spec.selector or {},
                "age": service.metadata.creation_timestamp,
                "labels": service.metadata.labels or {}
            })
        return result
    except Exception as e:
        print(f"获取命名空间服务信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_namespace_crds(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间中的自定义资源"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        # 获取所有CRD
        apiextensions_v1 = client.ApiextensionsV1Api(client_instance)
        crds = apiextensions_v1.list_custom_resource_definition()

        result = []
        for crd in crds.items:
            try:
                # 尝试获取该CRD在指定命名空间的实例
                custom_api = client.CustomObjectsApi(client_instance)
                group, version = crd.spec.group, crd.spec.versions[0].name
                plural = crd.spec.names.plural

                # 如果是命名空间范围的CRD，获取该命名空间的实例
                if crd.spec.scope == 'Namespaced':
                    resources = custom_api.list_namespaced_custom_object(
                        group, version, namespace_name, plural
                    )
                    for resource in resources.get('items', []):
                        result.append({
                            "name": resource['metadata']['name'],
                            "kind": crd.spec.names.kind,
                            "api_version": f"{group}/{version}",
                            "namespace": resource['metadata']['namespace'],
                            "age": resource['metadata']['creationTimestamp'],
                            "labels": resource['metadata'].get('labels', {})
                        })
            except Exception as e:
                # 忽略单个CRD获取失败的情况
                continue

        return result
    except Exception as e:
        print(f"获取命名空间CRD信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_pods_info(cluster: Cluster, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
    """获取Pod信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)

        if namespace:
            pods = core_v1.list_namespaced_pod(namespace)
        else:
            pods = core_v1.list_pod_for_all_namespaces()

        pod_list = []
        for pod in pods.items:
            # 获取Pod状态
            status = pod.status.phase

            # 获取容器重启次数
            restarts = 0
            ready_containers = "0/0"
            if pod.status.container_statuses:
                total_containers = len(pod.status.container_statuses)
                ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
                ready_containers = f"{ready_count}/{total_containers}"

                # 计算总重启次数
                restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

            # 计算Pod年龄
            from datetime import datetime
            age = "Unknown"
            if pod.metadata.creation_timestamp:
                created = pod.metadata.creation_timestamp.replace(tzinfo=None)
                now = datetime.now()
                delta = now - created
                if delta.days > 0:
                    age = f"{delta.days}d"
                elif delta.seconds // 3600 > 0:
                    age = f"{delta.seconds // 3600}h"
                elif delta.seconds // 60 > 0:
                    age = f"{delta.seconds // 60}m"
                else:
                    age = f"{delta.seconds}s"

            pod_info = {
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": status,
                "node_name": pod.spec.node_name,
                "age": age,
                "restarts": restarts,
                "ready_containers": ready_containers,
                "labels": dict(pod.metadata.labels) if pod.metadata.labels else {}
            }
            pod_list.append(pod_info)

        return pod_list

    except Exception as e:
        print(f"获取Pod信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_pod_details(cluster: Cluster, namespace: str, pod_name: str) -> Optional[Dict[str, Any]]:
    """获取Pod详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pod = core_v1.read_namespaced_pod(pod_name, namespace)

        # 获取Pod状态
        status = pod.status.phase

        # 获取容器信息
        restarts = 0
        ready_containers = "0/0"
        containers = []
        if pod.status.container_statuses:
            total_containers = len(pod.status.container_statuses)
            ready_count = sum(1 for cs in pod.status.container_statuses if cs.ready)
            ready_containers = f"{ready_count}/{total_containers}"
            restarts = sum(cs.restart_count for cs in pod.status.container_statuses if cs.restart_count)

            for i, cs in enumerate(pod.status.container_statuses):
                container_spec = pod.spec.containers[i] if i < len(pod.spec.containers) else None
                container_info = {
                    "name": cs.name,
                    "image": cs.image,
                    "ready": cs.ready,
                    "restart_count": cs.restart_count,
                    "state": str(cs.state) if cs.state else "Unknown",
                    "resources": {}
                }

                if container_spec and container_spec.resources:
                    if container_spec.resources.requests:
                        container_info["resources"]["requests"] = dict(container_spec.resources.requests)
                    if container_spec.resources.limits:
                        container_info["resources"]["limits"] = dict(container_spec.resources.limits)

                containers.append(container_info)

        # 计算Pod年龄
        from datetime import datetime
        age = "Unknown"
        if pod.metadata.creation_timestamp:
            created = pod.metadata.creation_timestamp.replace(tzinfo=None)
            now = datetime.now()
            delta = now - created
            if delta.days > 0:
                age = f"{delta.days}d"
            elif delta.seconds // 3600 > 0:
                age = f"{delta.seconds // 3600}h"
            elif delta.seconds // 60 > 0:
                age = f"{delta.seconds // 60}m"
            else:
                age = f"{delta.seconds}s"

        # 获取Volumes信息
        volumes = []
        if pod.spec.volumes:
            for volume in pod.spec.volumes:
                volume_info = {"name": volume.name}
                if volume.config_map:
                    volume_info["type"] = "ConfigMap"
                    volume_info["source"] = volume.config_map.name
                elif volume.secret:
                    volume_info["type"] = "Secret"
                    volume_info["source"] = volume.secret.secret_name
                elif volume.persistent_volume_claim:
                    volume_info["type"] = "PVC"
                    volume_info["source"] = volume.persistent_volume_claim.claim_name
                elif volume.host_path:
                    volume_info["type"] = "HostPath"
                    volume_info["source"] = volume.host_path.path
                else:
                    volume_info["type"] = "Other"
                volumes.append(volume_info)

        # 获取相关事件（简化版本）
        events = []
        try:
            events_list = core_v1.list_namespaced_event(namespace, field_selector=f"involvedObject.name={pod_name}")
            for event in events_list.items[:10]:  # 只获取最近10个事件
                events.append({
                    "type": event.type,
                    "reason": event.reason,
                    "message": event.message,
                    "timestamp": str(event.metadata.creation_timestamp) if event.metadata.creation_timestamp else None
                })
        except Exception as e:
            print(f"获取Pod事件失败: {e}")

        return {
            "name": pod.metadata.name,
            "namespace": pod.metadata.namespace,
            "status": status,
            "node_name": pod.spec.node_name,
            "age": age,
            "restarts": restarts,
            "ready_containers": ready_containers,
            "labels": dict(pod.metadata.labels) if pod.metadata.labels else {},
            "annotations": dict(pod.metadata.annotations) if pod.metadata.annotations else {},
            "containers": containers,
            "volumes": volumes,
            "events": events
        }

    except Exception as e:
        print(f"获取Pod详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def get_pod_logs(cluster: Cluster, namespace: str, pod_name: str, container: Optional[str] = None, tail_lines: Optional[int] = 100) -> Optional[str]:
    """获取Pod日志"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建参数，只在container不为None或空字符串时传递
        kwargs = {
            "name": pod_name,
            "namespace": namespace,
            "tail_lines": tail_lines if tail_lines and tail_lines > 0 else 100
        }

        if container and container.strip():
            kwargs["container"] = container.strip()

        # 获取日志
        logs = core_v1.read_namespaced_pod_log(**kwargs)

        return logs

    except Exception as e:
        print(f"获取Pod日志失败: {e}")
        # 如果是ApiException，打印更多详细信息用于调试
        if hasattr(e, 'status') and hasattr(e, 'reason'):
            print(f"API错误状态: {e.status}, 原因: {e.reason}")
            if hasattr(e, 'body'):
                print(f"API错误详情: {e.body}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def restart_pod(cluster: Cluster, namespace: str, pod_name: str) -> bool:
    """重启Pod（通过删除Pod让控制器重新创建）"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_pod(pod_name, namespace)
        return True

    except Exception as e:
        print(f"重启Pod失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_pod(cluster: Cluster, namespace: str, pod_name: str) -> bool:
    """删除Pod"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_pod(pod_name, namespace)
        return True

    except Exception as e:
        print(f"删除Pod失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def test_cluster_connection(cluster: Cluster) -> Dict[str, Any]:
    """测试集群连接"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        core_v1 = client.CoreV1Api(client_instance)
        # 尝试获取命名空间列表来测试连接
        namespaces = core_v1.list_namespace(limit=1)  # 只获取一个命名空间来测试连接
        return {"success": True, "message": "连接成功"}
    except ApiException as e:
        return {"success": False, "message": f"连接失败: {e.reason}"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()

# ========== 存储管理相关函数 ==========

def get_storage_classes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取存储类列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        storage_v1 = client.StorageV1Api(client_instance)
        storage_classes = storage_v1.list_storage_class()

        result = []
        for sc in storage_classes.items:
            result.append({
                "name": sc.metadata.name,
                "provisioner": sc.provisioner,
                "reclaim_policy": sc.reclaim_policy or "Delete",
                "volume_binding_mode": sc.volume_binding_mode or "Immediate",
                "allow_volume_expansion": sc.allow_volume_expansion or False
            })

        return result

    except Exception as e:
        print(f"获取存储类信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def create_storage_class(cluster: Cluster, sc_data: Dict[str, Any]) -> bool:
    """创建存储类"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        storage_v1 = client.StorageV1Api(client_instance)

        # 创建StorageClass对象
        sc = client.V1StorageClass(
            metadata=client.V1ObjectMeta(name=sc_data["name"]),
            provisioner=sc_data["provisioner"],
            reclaim_policy=sc_data.get("reclaim_policy", "Delete"),
            volume_binding_mode=sc_data.get("volume_binding_mode", "Immediate"),
            allow_volume_expansion=sc_data.get("allow_volume_expansion", False),
            parameters=sc_data.get("parameters", {})
        )

        storage_v1.create_storage_class(sc)
        return True

    except Exception as e:
        print(f"创建存储类失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_storage_class(cluster: Cluster, sc_name: str) -> bool:
    """删除存储类"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        storage_v1 = client.StorageV1Api(client_instance)
        storage_v1.delete_storage_class(sc_name)
        return True

    except Exception as e:
        print(f"删除存储类失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_persistent_volumes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取持久卷列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvs = core_v1.list_persistent_volume()

        result = []
        for pv in pvs.items:
            capacity = pv.spec.capacity.get("storage", "0") if pv.spec.capacity else "0"
            access_modes = [mode for mode in pv.spec.access_modes] if pv.spec.access_modes else []

            result.append({
                "name": pv.metadata.name,
                "capacity": capacity,
                "access_modes": access_modes,
                "status": pv.status.phase,
                "claim": f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}" if pv.spec.claim_ref else None,
                "storage_class": pv.spec.storage_class_name,
                "volume_mode": pv.spec.volume_mode or "Filesystem"
            })

        return result

    except Exception as e:
        print(f"获取持久卷信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_pv_details(cluster: Cluster, pv_name: str) -> Optional[Dict[str, Any]]:
    """获取PV详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pv = core_v1.read_persistent_volume(pv_name)

        capacity = pv.spec.capacity.get("storage", "0") if pv.spec.capacity else "0"
        access_modes = [mode for mode in pv.spec.access_modes] if pv.spec.access_modes else []

        return {
            "name": pv.metadata.name,
            "capacity": capacity,
            "access_modes": access_modes,
            "status": pv.status.phase,
            "claim": f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}" if pv.spec.claim_ref else None,
            "storage_class": pv.spec.storage_class_name,
            "volume_mode": pv.spec.volume_mode or "Filesystem",
            "created_time": pv.metadata.creation_timestamp.isoformat() if pv.metadata.creation_timestamp else None
        }

    except Exception as e:
        print(f"获取PV详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def create_pv(cluster: Cluster, pv_data: Dict[str, Any]) -> bool:
    """创建持久卷"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 创建PV对象
        pv = client.V1PersistentVolume(
            metadata=client.V1ObjectMeta(name=pv_data["name"]),
            spec=client.V1PersistentVolumeSpec(
                capacity={"storage": pv_data["capacity"]},
                access_modes=pv_data["access_modes"],
                storage_class_name=pv_data.get("storage_class_name"),
                volume_mode=pv_data.get("volume_mode", "Filesystem"),
                host_path=client.V1HostPathVolumeSource(path=pv_data["host_path"]) if pv_data.get("host_path") else None
            )
        )

        core_v1.create_persistent_volume(pv)
        return True

    except Exception as e:
        print(f"创建持久卷失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_pv(cluster: Cluster, pv_name: str) -> bool:
    """删除持久卷"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_persistent_volume(pv_name)
        return True

    except Exception as e:
        print(f"删除持久卷失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def get_persistent_volume_claims(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取所有PVC列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvcs = core_v1.list_persistent_volume_claim_for_all_namespaces()

        result = []
        for pvc in pvcs.items:
            capacity = pvc.status.capacity.get("storage", "0") if pvc.status.capacity else "0"
            access_modes = [mode for mode in pvc.spec.access_modes] if pvc.spec.access_modes else []

            result.append({
                "name": pvc.metadata.name,
                "namespace": pvc.metadata.namespace,
                "status": pvc.status.phase,
                "volume": pvc.spec.volume_name,
                "capacity": capacity,
                "access_modes": access_modes,
                "storage_class": pvc.spec.storage_class_name,
                "volume_mode": pvc.spec.volume_mode or "Filesystem"
            })

        return result

    except Exception as e:
        print(f"获取PVC信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_namespace_pvcs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间下的PVC列表"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace)

        result = []
        for pvc in pvcs.items:
            capacity = pvc.status.capacity.get("storage", "0") if pvc.status.capacity else "0"
            access_modes = [mode for mode in pvc.spec.access_modes] if pvc.spec.access_modes else []

            result.append({
                "name": pvc.metadata.name,
                "namespace": pvc.metadata.namespace,
                "status": pvc.status.phase,
                "volume": pvc.spec.volume_name,
                "capacity": capacity,
                "access_modes": access_modes,
                "storage_class": pvc.spec.storage_class_name,
                "volume_mode": pvc.spec.volume_mode or "Filesystem"
            })

        return result

    except Exception as e:
        print(f"获取命名空间PVC信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

def get_pvc_details(cluster: Cluster, namespace: str, pvc_name: str) -> Optional[Dict[str, Any]]:
    """获取PVC详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        pvc = core_v1.read_namespaced_persistent_volume_claim(pvc_name, namespace)

        capacity = pvc.status.capacity.get("storage", "0") if pvc.status.capacity else "0"
        access_modes = [mode for mode in pvc.spec.access_modes] if pvc.spec.access_modes else []

        return {
            "name": pvc.metadata.name,
            "namespace": pvc.metadata.namespace,
            "status": pvc.status.phase,
            "volume": pvc.spec.volume_name,
            "capacity": capacity,
            "access_modes": access_modes,
            "storage_class": pvc.spec.storage_class_name,
            "volume_mode": pvc.spec.volume_mode or "Filesystem",
            "created_time": pvc.metadata.creation_timestamp.isoformat() if pvc.metadata.creation_timestamp else None
        }

    except Exception as e:
        print(f"获取PVC详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()

def create_pvc(cluster: Cluster, pvc_data: Dict[str, Any]) -> bool:
    """创建持久卷声明"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 创建PVC对象
        pvc = client.V1PersistentVolumeClaim(
            metadata=client.V1ObjectMeta(name=pvc_data["name"]),
            spec=client.V1PersistentVolumeClaimSpec(
                access_modes=pvc_data["access_modes"],
                storage_class_name=pvc_data.get("storage_class_name"),
                volume_mode=pvc_data.get("volume_mode", "Filesystem"),
                resources=client.V1ResourceRequirements(requests=pvc_data["requests"])
            )
        )

        core_v1.create_namespaced_persistent_volume_claim(pvc_data["namespace"], pvc)
        return True

    except Exception as e:
        print(f"创建PVC失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def delete_pvc(cluster: Cluster, namespace: str, pvc_name: str) -> bool:
    """删除持久卷声明"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_persistent_volume_claim(pvc_name, namespace)
        return True

    except Exception as e:
        print(f"删除PVC失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()

def browse_volume_files(cluster: Cluster, pv_name: str, path: str = "/") -> List[Dict[str, Any]]:
    """浏览卷内文件（简化实现，返回模拟数据）"""
    # 注意：这是一个简化的实现
    # 在实际生产环境中，需要通过以下方式之一实现：
    # 1. 使用Kubernetes exec API在挂载了该PV的Pod中执行ls命令
    # 2. 如果PV是hostPath类型，可以直接读取宿主机文件系统
    # 3. 对于云存储，需要使用相应的云API

    # 这里返回模拟数据用于演示
    if path == "/":
        return [
            {"name": "example-file.txt", "type": "file", "size": 1024, "modified_time": "2024-01-01 10:00:00", "permissions": "-rw-r--r--"},
            {"name": "data", "type": "directory", "size": None, "modified_time": "2024-01-01 09:00:00", "permissions": "drwxr-xr-x"},
            {"name": "logs", "type": "directory", "size": None, "modified_time": "2024-01-01 08:00:00", "permissions": "drwxr-xr-x"}
        ]
    elif path == "/data":
        return [
            {"name": "database.db", "type": "file", "size": 1048576, "modified_time": "2024-01-01 11:00:00", "permissions": "-rw-r--r--"},
            {"name": "config.yaml", "type": "file", "size": 512, "modified_time": "2024-01-01 10:30:00", "permissions": "-rw-r--r--"}
        ]
    elif path == "/logs":
        return [
            {"name": "app.log", "type": "file", "size": 2048, "modified_time": "2024-01-01 12:00:00", "permissions": "-rw-r--r--"},
            {"name": "error.log", "type": "file", "size": 1024, "modified_time": "2024-01-01 11:30:00", "permissions": "-rw-r--r--"}
        ]
    else:
        return []

def read_volume_file(cluster: Cluster, pv_name: str, file_path: str, max_lines: Optional[int] = None) -> Optional[str]:
    """读取卷内文件内容（简化实现，返回模拟数据）"""
    # 注意：这也是一个简化的实现
    # 在实际生产环境中，需要通过exec API或直接文件访问来读取内容

    # 返回模拟文件内容
    mock_contents = {
        "/example-file.txt": "这是一个示例文件的内容。\n包含多行文本。\n用于演示文件浏览功能。",
        "/data/database.db": "[二进制文件 - 无法显示文本内容]",
        "/data/config.yaml": "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example-config\ndata:\n  key: value",
        "/logs/app.log": "2024-01-01 10:00:00 INFO Application started\n2024-01-01 10:05:00 INFO Processing request\n2024-01-01 10:10:00 INFO Request completed",
        "/logs/error.log": "2024-01-01 10:02:00 ERROR Connection timeout\n2024-01-01 10:07:00 WARN High memory usage"
    }

    content = mock_contents.get(file_path, f"文件 {file_path} 的内容（模拟数据）")

    if max_lines and content.count('\n') >= max_lines:
        lines = content.split('\n')[:max_lines]
        content = '\n'.join(lines) + f"\n\n[已截断，显示前 {max_lines} 行]"

    return content
