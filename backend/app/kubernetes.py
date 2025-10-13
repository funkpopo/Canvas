import tempfile
import os
import time
import json
import uuid
from typing import Dict, Any, Optional, List
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from kubernetes.stream import stream
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

        # 获取所有Pods用于统计节点上的Pods数量
        pods = core_v1.list_pod_for_all_namespaces()

        # 统计每个节点上的Pods数量
        node_pod_counts = {}
        for pod in pods.items:
            node_name = pod.spec.node_name
            if node_name:
                node_pod_counts[node_name] = node_pod_counts.get(node_name, 0) + 1

        # 获取节点资源使用情况（从allocatable和capacity计算）
        node_resource_usage = {}
        for node in nodes.items:
            node_name = node.metadata.name

            # 获取CPU和内存使用情况（通过allocatable计算可用资源比例）
            cpu_capacity = node.status.capacity.get("cpu", "0")
            memory_capacity = node.status.capacity.get("memory", "0")
            cpu_allocatable = node.status.allocatable.get("cpu", "0")
            memory_allocatable = node.status.allocatable.get("memory", "0")

            # 计算使用率（简单估算：1 - allocatable/capacity）
            cpu_usage = None
            memory_usage = None

            try:
                if cpu_capacity and cpu_allocatable:
                    cpu_capacity_val = parse_cpu(cpu_capacity)
                    cpu_allocatable_val = parse_cpu(cpu_allocatable)
                    if cpu_capacity_val > 0:
                        cpu_usage_val = ((cpu_capacity_val - cpu_allocatable_val) / cpu_capacity_val) * 100
                        cpu_usage = f"{cpu_usage_val:.1f}%"
            except:
                pass

            try:
                if memory_capacity and memory_allocatable:
                    memory_capacity_val = parse_memory(memory_capacity)
                    memory_allocatable_val = parse_memory(memory_allocatable)
                    if memory_capacity_val > 0:
                        memory_usage_val = ((memory_capacity_val - memory_allocatable_val) / memory_capacity_val) * 100
                        memory_usage = f"{memory_usage_val:.1f}%"
            except:
                pass

            node_resource_usage[node_name] = {
                'cpu_usage': cpu_usage,
                'memory_usage': memory_usage
            }

        node_list = []
        for node in nodes.items:
            node_name = node.metadata.name

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

            # 获取实际Pods数量
            pods_usage = str(node_pod_counts.get(node_name, 0))

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
                "pods_capacity": pods_capacity,
                "cpu_usage": node_resource_usage.get(node_name, {}).get('cpu_usage'),
                "memory_usage": node_resource_usage.get(node_name, {}).get('memory_usage'),
                "pods_usage": pods_usage
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
                "ports": [{"port": port.port, "target_port": port.target_port, "protocol": port.protocol, "node_port": getattr(port, 'node_port', None)} for port in (service.spec.ports or [])],
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


# ========== 卷文件浏览 - 真实实现 ==========

def create_helper_pod_for_volume(cluster: Cluster, pv_name: str, namespace: str = "default") -> Optional[tuple]:
    """为指定的PV创建一个临时的helper Pod，返回(pod_name, temp_pvc_name)"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    temp_pvc_name = None
    pod_name = None

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取PV详情以确定如何挂载
        pv_details = get_pv_details(cluster, pv_name)
        if not pv_details:
            print(f"无法获取PV {pv_name} 的详细信息")
            return None

        # 生成唯一的Pod名称
        pod_name = f"volume-helper-{pv_name}-{uuid.uuid4().hex[:8]}"

        claim_name = pv_name  # 默认使用PV名称作为PVC名称

        # 如果PV没有绑定的PVC，我们需要创建一个临时的PVC
        if not pv_details.get('claim') or pv_details['claim'] is None:
            # 生成临时PVC名称
            temp_pvc_name = f"temp-pvc-{pv_name}-{uuid.uuid4().hex[:8]}"

            # 创建临时PVC来绑定PV
            temp_pvc = client.V1PersistentVolumeClaim(
                metadata=client.V1ObjectMeta(
                    name=temp_pvc_name,
                    namespace=namespace,
                    labels={"app": "volume-helper", "managed-by": "canvas"}
                ),
                spec=client.V1PersistentVolumeClaimSpec(
                    volume_name=pv_name,  # 绑定到指定的PV
                    access_modes=pv_details.get('access_modes', ['ReadWriteOnce']),
                    resources=client.V1ResourceRequirements(
                        requests={"storage": pv_details.get('capacity', '1Gi')}
                    )
                )
            )

            try:
                core_v1.create_namespaced_persistent_volume_claim(namespace, temp_pvc)
                claim_name = temp_pvc_name
            except Exception as e:
                print(f"创建临时PVC失败: {e}")
                return None

        # 如果PV有绑定的PVC，使用已有的PVC
        elif isinstance(pv_details.get('claim'), str) and '/' in pv_details['claim']:
            claim_namespace, claim_name_from_pv = pv_details['claim'].split('/', 1)
            claim_name = claim_name_from_pv

        # 创建helper Pod配置
        pod = client.V1Pod(
            metadata=client.V1ObjectMeta(
                name=pod_name,
                namespace=namespace,
                labels={"app": "volume-helper", "managed-by": "canvas"}
            ),
            spec=client.V1PodSpec(
                restart_policy="Never",
                containers=[
                    client.V1Container(
                        name="helper",
                        image="busybox:1.35",  # 使用轻量级的busybox镜像
                        command=["sleep", "300"],  # 运行5分钟
                        volume_mounts=[
                            client.V1VolumeMount(
                                name="volume",
                                mount_path="/data"
                            )
                        ],
                        security_context=client.V1SecurityContext(
                            privileged=False,
                            allow_privilege_escalation=False,
                            run_as_non_root=True,
                            run_as_user=1000,
                            run_as_group=1000,
                            capabilities=client.V1Capabilities(
                                drop=["ALL"]
                            )
                        )
                    )
                ],
                volumes=[
                    client.V1Volume(
                        name="volume",
                        persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                            claim_name=claim_name
                        )
                    )
                ],
                # 添加安全策略
                security_context=client.V1PodSecurityContext(
                    run_as_non_root=True,
                    run_as_user=1000,
                    run_as_group=1000,
                    fs_group=1000
                )
            )
        )

        # 创建Pod
        core_v1.create_namespaced_pod(namespace, pod)

        # 等待Pod就绪，最多等待30秒
        for _ in range(30):
            pod_status = core_v1.read_namespaced_pod(pod_name, namespace)
            if pod_status.status.phase == "Running":
                return (pod_name, temp_pvc_name)
            elif pod_status.status.phase in ["Failed", "Succeeded"]:
                # Pod创建失败，清理Pod和临时PVC
                try:
                    core_v1.delete_namespaced_pod(pod_name, namespace)
                except:
                    pass
                if temp_pvc_name:
                    try:
                        core_v1.delete_namespaced_persistent_volume_claim(temp_pvc_name, namespace)
                    except:
                        pass
                return None
            time.sleep(1)

        # 超时，清理Pod和临时PVC
        try:
            core_v1.delete_namespaced_pod(pod_name, namespace)
        except:
            pass
        if temp_pvc_name:
            try:
                core_v1.delete_namespaced_persistent_volume_claim(temp_pvc_name, namespace)
            except:
                pass
        return None

    except Exception as e:
        print(f"创建helper Pod失败: {e}")
        # 清理可能已创建的资源
        if pod_name:
            try:
                core_v1.delete_namespaced_pod(pod_name, namespace)
            except:
                pass
        if temp_pvc_name:
            try:
                core_v1.delete_namespaced_persistent_volume_claim(temp_pvc_name, namespace)
            except:
                pass
        return None
    finally:
        if client_instance:
            client_instance.close()


def cleanup_helper_pod(cluster: Cluster, pod_name: str, temp_pvc_name: Optional[str] = None, namespace: str = "default") -> bool:
    """清理helper Pod和临时PVC"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 删除Pod
        try:
            core_v1.delete_namespaced_pod(pod_name, namespace, grace_period_seconds=0)
        except Exception as e:
            print(f"清理helper Pod失败: {e}")

        # 删除临时PVC（如果存在）
        if temp_pvc_name:
            try:
                core_v1.delete_namespaced_persistent_volume_claim(temp_pvc_name, namespace, grace_period_seconds=0)
            except Exception as e:
                print(f"清理临时PVC失败: {e}")

        return True
    except Exception as e:
        print(f"清理helper资源失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def execute_command_in_pod(cluster: Cluster, pod_name: str, namespace: str, command: List[str]) -> Optional[str]:
    """在Pod中执行命令并返回输出"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 执行命令
        exec_command = ['/bin/sh', '-c'] + command
        resp = stream(
            core_v1.connect_get_namespaced_pod_exec,
            pod_name,
            namespace,
            command=exec_command,
            stderr=True,
            stdin=False,
            stdout=True,
            tty=False,
            _preload_content=False
        )

        # 读取输出
        output = ""
        while resp.is_open():
            resp.update(timeout=1)
            if resp.peek_stdout():
                output += resp.read_stdout()
            if resp.peek_stderr():
                output += resp.read_stderr()

        return output

    except Exception as e:
        print(f"在Pod中执行命令失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def browse_volume_files(cluster: Cluster, pv_name: str, path: str = "/") -> List[Dict[str, Any]]:
    """浏览卷内文件（真实实现，使用helper Pod）"""
    helper_resources = None
    try:
        # 创建helper Pod
        helper_resources = create_helper_pod_for_volume(cluster, pv_name)
        if not helper_resources:
            print("无法创建helper Pod用于文件浏览")
            return []

        pod_name, temp_pvc_name = helper_resources

        # 构建ls命令
        target_path = f"/data{path}" if path != "/" else "/data"
        command = [
            f"ls -la --time-style=long-iso '{target_path}' 2>/dev/null || echo 'Path not found'"
        ]

        # 执行命令
        output = execute_command_in_pod(cluster, pod_name, "default", command)
        if not output or "Path not found" in output:
            return []

        # 解析ls -la输出
        files = []
        lines = output.strip().split('\n')[1:]  # 跳过第一行（总计）

        for line in lines:
            if not line.strip():
                continue

            parts = line.split()
            if len(parts) < 8:
                continue

            permissions = parts[0]
            file_type = "directory" if permissions.startswith('d') else "file"
            size = int(parts[4]) if parts[4].isdigit() else None
            date_time = f"{parts[5]} {parts[6]}" if len(parts) > 6 else None
            name = ' '.join(parts[7:])  # 处理文件名包含空格的情况

            # 跳过.和..目录
            if name in ['.', '..']:
                continue

            files.append({
                "name": name,
                "type": file_type,
                "size": size,
                "modified_time": date_time,
                "permissions": permissions
            })

        return files

    except Exception as e:
        print(f"浏览卷文件失败: {e}")
        return []
    finally:
        # 清理helper资源
        if helper_resources:
            pod_name, temp_pvc_name = helper_resources
            cleanup_helper_pod(cluster, pod_name, temp_pvc_name)


def read_volume_file(cluster: Cluster, pv_name: str, file_path: str, max_lines: Optional[int] = None) -> Optional[str]:
    """读取卷内文件内容（真实实现，使用helper Pod）"""
    helper_resources = None
    try:
        # 创建helper Pod
        helper_resources = create_helper_pod_for_volume(cluster, pv_name)
        if not helper_resources:
            print("无法创建helper Pod用于文件读取")
            return None

        pod_name, temp_pvc_name = helper_resources

        # 构建文件路径
        full_path = f"/data{file_path}"

        # 首先检查文件是否存在和类型
        check_command = [f"test -f '{full_path}' && echo 'file' || (test -d '{full_path}' && echo 'directory' || echo 'not_found')"]
        check_output = execute_command_in_pod(cluster, pod_name, "default", check_command)

        if not check_output or "not_found" in check_output.strip():
            return f"文件不存在: {file_path}"

        if "directory" in check_output.strip():
            return f"路径是目录而非文件: {file_path}"

        # 读取文件内容
        if max_lines:
            command = [f"head -n {max_lines} '{full_path}' 2>/dev/null || echo '无法读取文件'"]
        else:
            command = [f"cat '{full_path}' 2>/dev/null || echo '无法读取文件'"]

        content = execute_command_in_pod(cluster, pod_name, "default", command)

        if not content or "无法读取文件" in content:
            return f"无法读取文件内容: {file_path}"

        # 如果设置了行数限制且内容被截断，添加提示
        if max_lines and content.count('\n') >= max_lines:
            content += f"\n\n[已截断，显示前 {max_lines} 行]"

        return content

    except Exception as e:
        print(f"读取卷文件失败: {e}")
        return f"读取文件失败: {str(e)}"
    finally:
        # 清理helper资源
        if helper_resources:
            pod_name, temp_pvc_name = helper_resources
            cleanup_helper_pod(cluster, pod_name, temp_pvc_name)


# ========== 核心资源管理 ==========

# ========== 服务管理 ==========

def get_namespace_services(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间下的所有服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        services = core_v1.list_namespaced_service(namespace_name)

        result = []
        for service in services.items:
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

            result.append({
                "name": service.metadata.name,
                "namespace": namespace_name,
                "type": service.spec.type,
                "cluster_ip": service.spec.cluster_ip,
                "external_ip": getattr(service.status, 'load_balancer', {}).get('ingress', [{}])[0].get('ip', None) if service.spec.type == 'LoadBalancer' else None,
                "ports": [{"port": port.port, "target_port": port.target_port, "protocol": port.protocol, "name": getattr(port, 'name', None)} for port in (service.spec.ports or [])],
                "selector": service.spec.selector or {},
                "labels": service.metadata.labels or {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            })

        return result

    except Exception as e:
        print(f"获取命名空间服务失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def create_service(cluster: Cluster, namespace: str, service_data: Dict[str, Any]) -> bool:
    """创建服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建Service对象
        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(
                name=service_data["name"],
                namespace=namespace,
                labels=service_data.get("labels", {}),
                annotations=service_data.get("annotations", {})
            ),
            spec=client.V1ServiceSpec(
                type=service_data.get("type", "ClusterIP"),
                selector=service_data.get("selector", {}),
                ports=[
                    client.V1ServicePort(
                        name=port.get("name"),
                        port=port["port"],
                        target_port=port["target_port"],
                        protocol=port.get("protocol", "TCP")
                    ) for port in service_data.get("ports", [])
                ]
            )
        )

        # 设置ClusterIP（如果指定）
        if service_data.get("cluster_ip"):
            service.spec.cluster_ip = service_data["cluster_ip"]

        # 设置LoadBalancer相关配置
        if service_data.get("type") == "LoadBalancer":
            if service_data.get("load_balancer_ip"):
                service.spec.load_balancer_ip = service_data["load_balancer_ip"]
            if service_data.get("external_traffic_policy"):
                service.spec.external_traffic_policy = service_data["external_traffic_policy"]

        # 设置NodePort相关配置
        if service_data.get("type") == "NodePort":
            if service_data.get("external_traffic_policy"):
                service.spec.external_traffic_policy = service_data["external_traffic_policy"]

        # 设置会话亲和性
        if service_data.get("session_affinity"):
            service.spec.session_affinity = service_data["session_affinity"]
            if service_data.get("session_affinity_config"):
                service.spec.session_affinity_config = client.V1SessionAffinityConfig(
                    client_ip=client.V1ClientIPConfig(
                        timeout_seconds=service_data["session_affinity_config"].get("timeout_seconds", 10800)
                    )
                )

        core_v1.create_namespaced_service(namespace, service)
        return True

    except Exception as e:
        print(f"创建服务失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_service(cluster: Cluster, namespace: str, service_name: str) -> bool:
    """删除服务"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_service(service_name, namespace)
        return True

    except Exception as e:
        print(f"删除服务失败: {e}")
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

        # 将对象转换为字典
        service_dict = client.ApiClient().sanitize_for_serialization(service)

        # 使用yaml库转换为YAML字符串
        import yaml
        return yaml.dump(service_dict, default_flow_style=False)

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
        service_dict = yaml.safe_load(yaml_content)

        # 使用patch更新服务
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.patch_namespaced_service(service_name, namespace, service_dict)
        return True

    except Exception as e:
        print(f"更新服务YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== ConfigMaps管理 ==========

def get_namespace_configmaps(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间下的所有ConfigMaps"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        configmaps = core_v1.list_namespaced_config_map(namespace_name)

        result = []
        for cm in configmaps.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if cm.metadata.creation_timestamp:
                created = cm.metadata.creation_timestamp.replace(tzinfo=None)
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
                "name": cm.metadata.name,
                "namespace": namespace_name,
                "data": cm.data or {},
                "labels": cm.metadata.labels or {},
                "annotations": cm.metadata.annotations or {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            })

        return result

    except Exception as e:
        print(f"获取命名空间ConfigMaps失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_configmap_details(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[Dict[str, Any]]:
    """获取ConfigMap详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if cm.metadata.creation_timestamp:
            created = cm.metadata.creation_timestamp.replace(tzinfo=None)
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
            "name": cm.metadata.name,
            "namespace": namespace,
            "data": cm.data or {},
            "labels": cm.metadata.labels or {},
            "annotations": cm.metadata.annotations or {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取ConfigMap详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_configmap(cluster: Cluster, namespace: str, configmap_data: Dict[str, Any]) -> bool:
    """创建ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        configmap = client.V1ConfigMap(
            api_version="v1",
            kind="ConfigMap",
            metadata=client.V1ObjectMeta(
                name=configmap_data["name"],
                namespace=namespace,
                labels=configmap_data.get("labels", {}),
                annotations=configmap_data.get("annotations", {})
            ),
            data=configmap_data.get("data", {})
        )

        core_v1.create_namespaced_config_map(namespace, configmap)
        return True

    except Exception as e:
        print(f"创建ConfigMap失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_configmap(cluster: Cluster, namespace: str, configmap_name: str, updates: Dict[str, Any]) -> bool:
    """更新ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取现有ConfigMap
        existing_cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

        # 构建更新对象
        patch = {
            "metadata": {
                "labels": updates.get("labels", existing_cm.metadata.labels or {}),
                "annotations": updates.get("annotations", existing_cm.metadata.annotations or {})
            },
            "data": updates.get("data", existing_cm.data or {})
        }

        core_v1.patch_namespaced_config_map(configmap_name, namespace, patch)
        return True

    except Exception as e:
        print(f"更新ConfigMap失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_configmap(cluster: Cluster, namespace: str, configmap_name: str) -> bool:
    """删除ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_config_map(configmap_name, namespace)
        return True

    except Exception as e:
        print(f"删除ConfigMap失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[str]:
    """获取ConfigMap的YAML配置"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        cm = core_v1.read_namespaced_config_map(configmap_name, namespace)
        # 转换为YAML
        import yaml
        yaml_content = yaml.dump(cm.to_dict(), default_flow_style=False)
        return yaml_content
    except Exception as e:
        print(f"获取ConfigMap YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def update_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str, yaml_content: str) -> bool:
    """通过YAML更新ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        import yaml
        # 解析YAML
        configmap_dict = yaml.safe_load(yaml_content)

        core_v1 = client.CoreV1Api(client_instance)

        # 创建新的ConfigMap对象
        configmap = client.V1ConfigMap(
            api_version=configmap_dict.get('apiVersion', 'v1'),
            kind=configmap_dict.get('kind', 'ConfigMap'),
            metadata=client.V1ObjectMeta(
                name=configmap_dict['metadata']['name'],
                namespace=configmap_dict['metadata']['namespace'],
                labels=configmap_dict['metadata'].get('labels', {}),
                annotations=configmap_dict['metadata'].get('annotations', {})
            ),
            data=configmap_dict.get('data', {})
        )

        # 使用replace更新ConfigMap
        core_v1.replace_namespaced_config_map(configmap_name, namespace, configmap)
        return True
    except Exception as e:
        print(f"更新ConfigMap YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_secret_yaml(cluster: Cluster, namespace: str, secret_name: str) -> Optional[str]:
    """获取Secret的YAML配置"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secret = core_v1.read_namespaced_secret(secret_name, namespace)
        # 转换为YAML
        import yaml
        yaml_content = yaml.dump(secret.to_dict(), default_flow_style=False)
        return yaml_content
    except Exception as e:
        print(f"获取Secret YAML失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def update_secret_yaml(cluster: Cluster, namespace: str, secret_name: str, yaml_content: str) -> bool:
    """通过YAML更新Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        import yaml
        # 解析YAML
        secret_dict = yaml.safe_load(yaml_content)

        core_v1 = client.CoreV1Api(client_instance)

        # 创建新的Secret对象
        secret = client.V1Secret(
            api_version=secret_dict.get('apiVersion', 'v1'),
            kind=secret_dict.get('kind', 'Secret'),
            metadata=client.V1ObjectMeta(
                name=secret_dict['metadata']['name'],
                namespace=secret_dict['metadata']['namespace'],
                labels=secret_dict['metadata'].get('labels', {}),
                annotations=secret_dict['metadata'].get('annotations', {})
            ),
            type=secret_dict.get('type', 'Opaque'),
            data=secret_dict.get('data', {}),
            string_data=secret_dict.get('stringData', {})
        )

        # 使用replace更新Secret
        core_v1.replace_namespaced_secret(secret_name, namespace, secret)
        return True
    except Exception as e:
        print(f"更新Secret YAML失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Secrets管理 ==========

def get_namespace_secrets(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间下的所有Secrets"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secrets = core_v1.list_namespaced_secret(namespace_name)

        result = []
        for secret in secrets.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if secret.metadata.creation_timestamp:
                created = secret.metadata.creation_timestamp.replace(tzinfo=None)
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
                "name": secret.metadata.name,
                "namespace": namespace_name,
                "type": secret.type,
                "data_keys": list(secret.data.keys()) if secret.data else [],
                "labels": secret.metadata.labels or {},
                "annotations": secret.metadata.annotations or {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            })

        return result

    except Exception as e:
        print(f"获取命名空间Secrets失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_secret_details(cluster: Cluster, namespace: str, secret_name: str) -> Optional[Dict[str, Any]]:
    """获取Secret详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secret = core_v1.read_namespaced_secret(secret_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if secret.metadata.creation_timestamp:
            created = secret.metadata.creation_timestamp.replace(tzinfo=None)
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

        # 解码base64数据（前端需要时再编码）
        decoded_data = {}
        if secret.data:
            import base64
            for key, value in secret.data.items():
                try:
                    decoded_data[key] = base64.b64decode(value).decode('utf-8')
                except:
                    decoded_data[key] = value  # 如果解码失败，保持原样

        return {
            "name": secret.metadata.name,
            "namespace": namespace,
            "type": secret.type,
            "data": decoded_data,
            "labels": secret.metadata.labels or {},
            "annotations": secret.metadata.annotations or {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Secret详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_secret(cluster: Cluster, namespace: str, secret_data: Dict[str, Any]) -> bool:
    """创建Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 对数据进行base64编码
        import base64
        encoded_data = {}
        if secret_data.get("data"):
            for key, value in secret_data["data"].items():
                encoded_data[key] = base64.b64encode(value.encode('utf-8')).decode('utf-8')

        secret = client.V1Secret(
            api_version="v1",
            kind="Secret",
            metadata=client.V1ObjectMeta(
                name=secret_data["name"],
                namespace=namespace,
                labels=secret_data.get("labels", {}),
                annotations=secret_data.get("annotations", {})
            ),
            type=secret_data.get("type", "Opaque"),
            data=encoded_data
        )

        core_v1.create_namespaced_secret(namespace, secret)
        return True

    except Exception as e:
        print(f"创建Secret失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_secret(cluster: Cluster, namespace: str, secret_name: str, updates: Dict[str, Any]) -> bool:
    """更新Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取现有Secret
        existing_secret = core_v1.read_namespaced_secret(secret_name, namespace)

        # 构建更新对象
        patch = {
            "metadata": {
                "labels": updates.get("labels", existing_secret.metadata.labels or {}),
                "annotations": updates.get("annotations", existing_secret.metadata.annotations or {})
            }
        }

        # 如果提供了新数据，编码后更新
        if updates.get("data"):
            import base64
            encoded_data = {}
            for key, value in updates["data"].items():
                encoded_data[key] = base64.b64encode(value.encode('utf-8')).decode('utf-8')
            patch["data"] = encoded_data

        core_v1.patch_namespaced_secret(secret_name, namespace, patch)
        return True

    except Exception as e:
        print(f"更新Secret失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_secret(cluster: Cluster, namespace: str, secret_name: str) -> bool:
    """删除Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_secret(secret_name, namespace)
        return True

    except Exception as e:
        print(f"删除Secret失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Ingress管理 ==========

def get_namespace_ingresses(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间下的所有Ingress"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        ingresses = networking_v1.list_namespaced_ingress(namespace_name)

        result = []
        for ingress in ingresses.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if ingress.metadata.creation_timestamp:
                created = ingress.metadata.creation_timestamp.replace(tzinfo=None)
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

            # 提取主机和路径信息
            hosts = []
            tls_hosts = []
            if ingress.spec.rules:
                for rule in ingress.spec.rules:
                    if rule.host:
                        hosts.append(rule.host)
                    if rule.http and rule.http.paths:
                        for path in rule.http.paths:
                            hosts.append(f"{rule.host or '*'}{path.path}")

            if ingress.spec.tls:
                for tls in ingress.spec.tls:
                    tls_hosts.extend(tls.hosts or [])

            result.append({
                "name": ingress.metadata.name,
                "namespace": namespace_name,
                "hosts": hosts,
                "tls_hosts": tls_hosts,
                "class_name": ingress.spec.ingress_class_name,
                "labels": ingress.metadata.labels or {},
                "annotations": ingress.metadata.annotations or {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            })

        return result

    except Exception as e:
        print(f"获取命名空间Ingress失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_ingress_details(cluster: Cluster, namespace: str, ingress_name: str) -> Optional[Dict[str, Any]]:
    """获取Ingress详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        ingress = networking_v1.read_namespaced_ingress(ingress_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if ingress.metadata.creation_timestamp:
            created = ingress.metadata.creation_timestamp.replace(tzinfo=None)
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

        # 构建规则详细信息
        rules = []
        if ingress.spec.rules:
            for rule in ingress.spec.rules:
                rule_info = {
                    "host": rule.host,
                    "paths": []
                }
                if rule.http and rule.http.paths:
                    for path in rule.http.paths:
                        rule_info["paths"].append({
                            "path": path.path,
                            "path_type": path.path_type,
                            "service_name": path.backend.service.name if path.backend.service else None,
                            "service_port": path.backend.service.port.number if path.backend.service and path.backend.service.port else None
                        })
                rules.append(rule_info)

        # 构建TLS信息
        tls_info = []
        if ingress.spec.tls:
            for tls in ingress.spec.tls:
                tls_info.append({
                    "hosts": tls.hosts or [],
                    "secret_name": tls.secret_name
                })

        return {
            "name": ingress.metadata.name,
            "namespace": namespace,
            "class_name": ingress.spec.ingress_class_name,
            "rules": rules,
            "tls": tls_info,
            "labels": ingress.metadata.labels or {},
            "annotations": ingress.metadata.annotations or {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Ingress详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_ingress(cluster: Cluster, namespace: str, ingress_data: Dict[str, Any]) -> bool:
    """创建Ingress"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 构建规则
        rules = []
        if ingress_data.get("rules"):
            for rule in ingress_data["rules"]:
                http_paths = []
                if rule.get("paths"):
                    for path in rule["paths"]:
                        http_paths.append(client.V1HTTPIngressPath(
                            path=path["path"],
                            path_type=path.get("path_type", "Prefix"),
                            backend=client.V1IngressBackend(
                                service=client.V1IngressServiceBackend(
                                    name=path["service_name"],
                                    port=client.V1ServiceBackendPort(
                                        number=path["service_port"]
                                    )
                                )
                            )
                        ))

                rules.append(client.V1IngressRule(
                    host=rule.get("host"),
                    http=client.V1HTTPIngressRuleValue(
                        paths=http_paths
                    )
                ))

        # 构建TLS配置
        tls = []
        if ingress_data.get("tls"):
            for tls_config in ingress_data["tls"]:
                tls.append(client.V1IngressTLS(
                    hosts=tls_config.get("hosts", []),
                    secret_name=tls_config.get("secret_name")
                ))

        ingress = client.V1Ingress(
            api_version="networking.k8s.io/v1",
            kind="Ingress",
            metadata=client.V1ObjectMeta(
                name=ingress_data["name"],
                namespace=namespace,
                labels=ingress_data.get("labels", {}),
                annotations=ingress_data.get("annotations", {})
            ),
            spec=client.V1IngressSpec(
                ingress_class_name=ingress_data.get("class_name"),
                rules=rules,
                tls=tls
            )
        )

        networking_v1.create_namespaced_ingress(namespace, ingress)
        return True

    except Exception as e:
        print(f"创建Ingress失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_ingress(cluster: Cluster, namespace: str, ingress_name: str, updates: Dict[str, Any]) -> bool:
    """更新Ingress"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 获取现有Ingress
        existing_ingress = networking_v1.read_namespaced_ingress(ingress_name, namespace)

        # 构建更新对象
        patch = {
            "metadata": {
                "labels": updates.get("labels", existing_ingress.metadata.labels or {}),
                "annotations": updates.get("annotations", existing_ingress.metadata.annotations or {})
            }
        }

        # 如果提供了规则和TLS配置，则更新spec
        if updates.get("rules") or updates.get("tls") or updates.get("class_name"):
            spec_patch = {}

            if updates.get("class_name"):
                spec_patch["ingress_class_name"] = updates["class_name"]

            if updates.get("rules"):
                rules = []
                for rule in updates["rules"]:
                    http_paths = []
                    if rule.get("paths"):
                        for path in rule["paths"]:
                            http_paths.append(client.V1HTTPIngressPath(
                                path=path["path"],
                                path_type=path.get("path_type", "Prefix"),
                                backend=client.V1IngressBackend(
                                    service=client.V1IngressServiceBackend(
                                        name=path["service_name"],
                                        port=client.V1ServiceBackendPort(
                                            number=path["service_port"]
                                        )
                                    )
                                )
                            ))

                    rules.append(client.V1IngressRule(
                        host=rule.get("host"),
                        http=client.V1HTTPIngressRuleValue(
                            paths=http_paths
                        )
                    ))
                spec_patch["rules"] = rules

            if updates.get("tls"):
                tls = []
                for tls_config in updates["tls"]:
                    tls.append(client.V1IngressTLS(
                        hosts=tls_config.get("hosts", []),
                        secret_name=tls_config.get("secret_name")
                    ))
                spec_patch["tls"] = tls

            patch["spec"] = spec_patch

        networking_v1.patch_namespaced_ingress(ingress_name, namespace, patch)
        return True

    except Exception as e:
        print(f"更新Ingress失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_ingress(cluster: Cluster, namespace: str, ingress_name: str) -> bool:
    """删除Ingress"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        networking_v1.delete_namespaced_ingress(ingress_name, namespace)
        return True

    except Exception as e:
        print(f"删除Ingress失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Network Policies管理 ==========

def get_namespace_network_policies(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间下的所有Network Policies"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        policies = networking_v1.list_namespaced_network_policy(namespace_name)

        result = []
        for policy in policies.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if policy.metadata.creation_timestamp:
                created = policy.metadata.creation_timestamp.replace(tzinfo=None)
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
                "name": policy.metadata.name,
                "namespace": namespace_name,
                "pod_selector": policy.spec.pod_selector.match_labels if policy.spec.pod_selector else {},
                "policy_types": policy.spec.policy_types or [],
                "labels": policy.metadata.labels or {},
                "annotations": policy.metadata.annotations or {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            })

        return result

    except Exception as e:
        print(f"获取命名空间Network Policies失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_network_policy_details(cluster: Cluster, namespace: str, policy_name: str) -> Optional[Dict[str, Any]]:
    """获取Network Policy详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        policy = networking_v1.read_namespaced_network_policy(policy_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if policy.metadata.creation_timestamp:
            created = policy.metadata.creation_timestamp.replace(tzinfo=None)
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

        # 构建ingress规则信息
        ingress_rules = []
        if policy.spec.ingress:
            for ingress in policy.spec.ingress:
                rule = {
                    "from": [],
                    "ports": []
                }

                if ingress.from_:
                    for from_rule in ingress.from_:
                        from_info = {}
                        if from_rule.pod_selector:
                            from_info["pod_selector"] = from_rule.pod_selector.match_labels
                        if from_rule.namespace_selector:
                            from_info["namespace_selector"] = from_rule.namespace_selector.match_labels
                        if from_rule.ip_block:
                            from_info["ip_block"] = {
                                "cidr": from_rule.ip_block.cidr,
                                "except": from_rule.ip_block.except_
                            }
                        rule["from"].append(from_info)

                if ingress.ports:
                    for port in ingress.ports:
                        port_info = {}
                        if port.port:
                            port_info["port"] = port.port
                        if port.protocol:
                            port_info["protocol"] = port.protocol
                        rule["ports"].append(port_info)

                ingress_rules.append(rule)

        # 构建egress规则信息
        egress_rules = []
        if policy.spec.egress:
            for egress in policy.spec.egress:
                rule = {
                    "to": [],
                    "ports": []
                }

                if egress.to:
                    for to_rule in egress.to:
                        to_info = {}
                        if to_rule.pod_selector:
                            to_info["pod_selector"] = to_rule.pod_selector.match_labels
                        if to_rule.namespace_selector:
                            to_info["namespace_selector"] = to_rule.namespace_selector.match_labels
                        if to_rule.ip_block:
                            to_info["ip_block"] = {
                                "cidr": to_rule.ip_block.cidr,
                                "except": to_rule.ip_block.except_
                            }
                        rule["to"].append(to_info)

                if egress.ports:
                    for port in egress.ports:
                        port_info = {}
                        if port.port:
                            port_info["port"] = port.port
                        if port.protocol:
                            port_info["protocol"] = port.protocol
                        rule["ports"].append(port_info)

                egress_rules.append(rule)

        return {
            "name": policy.metadata.name,
            "namespace": namespace,
            "pod_selector": policy.spec.pod_selector.match_labels if policy.spec.pod_selector else {},
            "policy_types": policy.spec.policy_types or [],
            "ingress": ingress_rules,
            "egress": egress_rules,
            "labels": policy.metadata.labels or {},
            "annotations": policy.metadata.annotations or {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Network Policy详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_network_policy(cluster: Cluster, namespace: str, policy_data: Dict[str, Any]) -> bool:
    """创建Network Policy"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 构建pod selector
        pod_selector = None
        if policy_data.get("pod_selector"):
            pod_selector = client.V1LabelSelector(
                match_labels=policy_data["pod_selector"]
            )

        # 构建ingress规则
        ingress_rules = []
        if policy_data.get("ingress"):
            for ingress in policy_data["ingress"]:
                from_rules = []
                if ingress.get("from"):
                    for from_rule in ingress["from"]:
                        peer = client.V1NetworkPolicyPeer()
                        if from_rule.get("pod_selector"):
                            peer.pod_selector = client.V1LabelSelector(match_labels=from_rule["pod_selector"])
                        if from_rule.get("namespace_selector"):
                            peer.namespace_selector = client.V1LabelSelector(match_labels=from_rule["namespace_selector"])
                        if from_rule.get("ip_block"):
                            peer.ip_block = client.V1IPBlock(
                                cidr=from_rule["ip_block"]["cidr"],
                                except_=from_rule["ip_block"].get("except")
                            )
                        from_rules.append(peer)

                ports = []
                if ingress.get("ports"):
                    for port in ingress["ports"]:
                        ports.append(client.V1NetworkPolicyPort(
                            port=port.get("port"),
                            protocol=port.get("protocol", "TCP")
                        ))

                ingress_rules.append(client.V1NetworkPolicyIngressRule(
                    from_=from_rules,
                    ports=ports
                ))

        # 构建egress规则
        egress_rules = []
        if policy_data.get("egress"):
            for egress in policy_data["egress"]:
                to_rules = []
                if egress.get("to"):
                    for to_rule in egress["to"]:
                        peer = client.V1NetworkPolicyPeer()
                        if to_rule.get("pod_selector"):
                            peer.pod_selector = client.V1LabelSelector(match_labels=to_rule["pod_selector"])
                        if to_rule.get("namespace_selector"):
                            peer.namespace_selector = client.V1LabelSelector(match_labels=to_rule["namespace_selector"])
                        if to_rule.get("ip_block"):
                            peer.ip_block = client.V1IPBlock(
                                cidr=to_rule["ip_block"]["cidr"],
                                except_=to_rule["ip_block"].get("except")
                            )
                        to_rules.append(peer)

                ports = []
                if egress.get("ports"):
                    for port in egress["ports"]:
                        ports.append(client.V1NetworkPolicyPort(
                            port=port.get("port"),
                            protocol=port.get("protocol", "TCP")
                        ))

                egress_rules.append(client.V1NetworkPolicyEgressRule(
                    to=to_rules,
                    ports=ports
                ))

        policy = client.V1NetworkPolicy(
            api_version="networking.k8s.io/v1",
            kind="NetworkPolicy",
            metadata=client.V1ObjectMeta(
                name=policy_data["name"],
                namespace=namespace,
                labels=policy_data.get("labels", {}),
                annotations=policy_data.get("annotations", {})
            ),
            spec=client.V1NetworkPolicySpec(
                pod_selector=pod_selector,
                policy_types=policy_data.get("policy_types", []),
                ingress=ingress_rules,
                egress=egress_rules
            )
        )

        networking_v1.create_namespaced_network_policy(namespace, policy)
        return True

    except Exception as e:
        print(f"创建Network Policy失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_network_policy(cluster: Cluster, namespace: str, policy_name: str, updates: Dict[str, Any]) -> bool:
    """更新Network Policy"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 获取现有Network Policy
        existing_policy = networking_v1.read_namespaced_network_policy(policy_name, namespace)

        # 构建更新对象
        patch = {
            "metadata": {
                "labels": updates.get("labels", existing_policy.metadata.labels or {}),
                "annotations": updates.get("annotations", existing_policy.metadata.annotations or {})
            }
        }

        # 如果提供了spec更新
        if any(key in updates for key in ["pod_selector", "policy_types", "ingress", "egress"]):
            spec_patch = {}

            if updates.get("pod_selector"):
                spec_patch["pod_selector"] = {"match_labels": updates["pod_selector"]}

            if updates.get("policy_types"):
                spec_patch["policy_types"] = updates["policy_types"]

            # 这里简化处理，实际项目中可能需要完整的规则重建
            if updates.get("ingress") or updates.get("egress"):
                # 重新构建完整的spec
                if updates.get("ingress"):
                    spec_patch["ingress"] = updates["ingress"]
                if updates.get("egress"):
                    spec_patch["egress"] = updates["egress"]

            patch["spec"] = spec_patch

        networking_v1.patch_namespaced_network_policy(policy_name, namespace, patch)
        return True

    except Exception as e:
        print(f"更新Network Policy失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_network_policy(cluster: Cluster, namespace: str, policy_name: str) -> bool:
    """删除Network Policy"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        networking_v1.delete_namespaced_network_policy(policy_name, namespace)
        return True

    except Exception as e:
        print(f"删除Network Policy失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Resource Quotas管理 ==========

def get_namespace_resource_quotas(cluster: Cluster, namespace_name: str) -> List[Dict[str, Any]]:
    """获取命名空间下的所有Resource Quotas"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        quotas = core_v1.list_namespaced_resource_quota(namespace_name)

        result = []
        for quota in quotas.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if quota.metadata.creation_timestamp:
                created = quota.metadata.creation_timestamp.replace(tzinfo=None)
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
                "name": quota.metadata.name,
                "namespace": namespace_name,
                "hard": quota.spec.hard or {},
                "used": quota.status.used or {},
                "labels": quota.metadata.labels or {},
                "annotations": quota.metadata.annotations or {},
                "age": age,
                "cluster_name": cluster.name,
                "cluster_id": cluster.id
            })

        return result

    except Exception as e:
        print(f"获取命名空间Resource Quotas失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_resource_quota_details(cluster: Cluster, namespace: str, quota_name: str) -> Optional[Dict[str, Any]]:
    """获取Resource Quota详细信息"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        quota = core_v1.read_namespaced_resource_quota(quota_name, namespace)

        # 计算年龄
        from datetime import datetime
        age = "Unknown"
        if quota.metadata.creation_timestamp:
            created = quota.metadata.creation_timestamp.replace(tzinfo=None)
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
            "name": quota.metadata.name,
            "namespace": namespace,
            "hard": quota.spec.hard or {},
            "used": quota.status.used or {},
            "scopes": quota.spec.scopes or [],
            "scope_selector": quota.spec.scope_selector.match_expressions if quota.spec.scope_selector else [],
            "labels": quota.metadata.labels or {},
            "annotations": quota.metadata.annotations or {},
            "age": age,
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        print(f"获取Resource Quota详情失败: {e}")
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_resource_quota(cluster: Cluster, namespace: str, quota_data: Dict[str, Any]) -> bool:
    """创建Resource Quota"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 构建scope selector
        scope_selector = None
        if quota_data.get("scope_selector"):
            match_expressions = []
            for expr in quota_data["scope_selector"]:
                match_expressions.append(client.V1ScopedResourceSelectorRequirement(
                    scope_name=expr["scope_name"],
                    operator=expr["operator"],
                    values=expr.get("values", [])
                ))

            scope_selector = client.V1ScopeSelector(
                match_expressions=match_expressions
            )

        quota = client.V1ResourceQuota(
            api_version="v1",
            kind="ResourceQuota",
            metadata=client.V1ObjectMeta(
                name=quota_data["name"],
                namespace=namespace,
                labels=quota_data.get("labels", {}),
                annotations=quota_data.get("annotations", {})
            ),
            spec=client.V1ResourceQuotaSpec(
                hard=quota_data.get("hard", {}),
                scopes=quota_data.get("scopes", []),
                scope_selector=scope_selector
            )
        )

        core_v1.create_namespaced_resource_quota(namespace, quota)
        return True

    except Exception as e:
        print(f"创建Resource Quota失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_resource_quota(cluster: Cluster, namespace: str, quota_name: str, updates: Dict[str, Any]) -> bool:
    """更新Resource Quota"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 获取现有Resource Quota
        existing_quota = core_v1.read_namespaced_resource_quota(quota_name, namespace)

        # 构建更新对象
        patch = {
            "metadata": {
                "labels": updates.get("labels", existing_quota.metadata.labels or {}),
                "annotations": updates.get("annotations", existing_quota.metadata.annotations or {})
            }
        }

        # 如果提供了spec更新
        if any(key in updates for key in ["hard", "scopes", "scope_selector"]):
            spec_patch = {}

            if updates.get("hard"):
                spec_patch["hard"] = updates["hard"]

            if updates.get("scopes"):
                spec_patch["scopes"] = updates["scopes"]

            if updates.get("scope_selector"):
                match_expressions = []
                for expr in updates["scope_selector"]:
                    match_expressions.append(client.V1ScopedResourceSelectorRequirement(
                        scope_name=expr["scope_name"],
                        operator=expr["operator"],
                        values=expr.get("values", [])
                    ))
                spec_patch["scope_selector"] = {"match_expressions": match_expressions}

            patch["spec"] = spec_patch

        core_v1.patch_namespaced_resource_quota(quota_name, namespace, patch)
        return True

    except Exception as e:
        print(f"更新Resource Quota失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_resource_quota(cluster: Cluster, namespace: str, quota_name: str) -> bool:
    """删除Resource Quota"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        core_v1 = client.CoreV1Api(client_instance)
        core_v1.delete_namespaced_resource_quota(quota_name, namespace)
        return True

    except Exception as e:
        print(f"删除Resource Quota失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


# ========== Ingress Controller 管理 ==========

def check_controller_status(cluster: Cluster) -> Dict[str, Any]:
    """检查Ingress Controller安装状态"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"installed": False, "error": "无法连接到集群"}

    status = {
        "installed": False,
        "namespace": "ingress-nginx",
        "deployment_exists": False,
        "service_exists": False,
        "ingressclass_exists": False,
        "webhook_exists": False,
        "version": None,
        "error": None
    }

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        core_v1 = client.CoreV1Api(client_instance)
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 检查命名空间是否存在
        try:
            core_v1.read_namespace("ingress-nginx")
            status["namespace_exists"] = True
        except ApiException as e:
            if e.status != 404:
                status["error"] = f"检查命名空间失败: {e}"
            status["namespace_exists"] = False
            return status

        # 检查Deployment
        try:
            deployment = apps_v1.read_namespaced_deployment("ingress-nginx-controller", "ingress-nginx")
            status["deployment_exists"] = True
            # 获取版本信息
            if deployment.spec.template.spec.containers:
                container = deployment.spec.template.spec.containers[0]
                status["version"] = container.image.split(":")[-1] if ":" in container.image else "latest"
        except ApiException as e:
            if e.status != 404:
                status["error"] = f"检查Deployment失败: {e}"

        # 检查Service
        try:
            core_v1.read_namespaced_service("ingress-nginx-controller", "ingress-nginx")
            status["service_exists"] = True
        except ApiException as e:
            if e.status != 404:
                status["error"] = f"检查Service失败: {e}"

        # 检查IngressClass
        try:
            ingress_classes = networking_v1.list_ingress_class()
            for ic in ingress_classes.items:
                if ic.metadata.name == "nginx":
                    status["ingressclass_exists"] = True
                    break
        except ApiException as e:
            if e.status != 404:
                status["error"] = f"检查IngressClass失败: {e}"

        # 检查Webhook
        try:
            apps_v1.read_namespaced_deployment("ingress-nginx-admission-create", "ingress-nginx")
            status["webhook_exists"] = True
        except ApiException:
            pass

        # 判断是否完全安装
        status["installed"] = (status["deployment_exists"] and
                              status["service_exists"] and
                              status["ingressclass_exists"])

        return status

    except Exception as e:
        status["error"] = f"检查Controller状态失败: {e}"
        return status
    finally:
        if client_instance:
            client_instance.close()


def install_ingress_controller(cluster: Cluster, version: str = "latest", image: str = None) -> Dict[str, Any]:
    """安装Ingress Nginx Controller"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "error": "无法连接到集群"}

    result = {
        "success": False,
        "message": "",
        "steps": [],
        "error": None
    }

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        core_v1 = client.CoreV1Api(client_instance)
        rbac_v1 = client.RbacAuthorizationV1Api(client_instance)
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 步骤1: 创建命名空间
        result["steps"].append("创建ingress-nginx命名空间")
        try:
            namespace = client.V1Namespace(
                api_version="v1",
                kind="Namespace",
                metadata=client.V1ObjectMeta(name="ingress-nginx")
            )
            core_v1.create_namespace(namespace)
            result["steps"].append("✓ 命名空间创建成功")
        except ApiException as e:
            if e.status == 409:  # Already exists
                result["steps"].append("✓ 命名空间已存在")
            else:
                result["error"] = f"创建命名空间失败: {e}"
                return result

        # 步骤2: 创建ServiceAccount
        result["steps"].append("创建ServiceAccount")
        try:
            sa = client.V1ServiceAccount(
                api_version="v1",
                kind="ServiceAccount",
                metadata=client.V1ObjectMeta(
                    name="ingress-nginx",
                    namespace="ingress-nginx"
                )
            )
            core_v1.create_namespaced_service_account("ingress-nginx", sa)
            result["steps"].append("✓ ServiceAccount创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ ServiceAccount已存在")
            else:
                result["error"] = f"创建ServiceAccount失败: {e}"
                return result

        # 步骤3: 创建ClusterRole
        result["steps"].append("创建ClusterRole")
        try:
            cluster_role = client.V1ClusterRole(
                api_version="rbac.authorization.k8s.io/v1",
                kind="ClusterRole",
                metadata=client.V1ObjectMeta(name="ingress-nginx"),
                rules=[
                    client.V1PolicyRule(
                        api_groups=[""],
                        resources=["configmaps", "endpoints", "nodes", "pods", "secrets"],
                        verbs=["list", "watch"]
                    ),
                    client.V1PolicyRule(
                        api_groups=[""],
                        resources=["nodes/proxy"],
                        verbs=["get"]
                    ),
                    client.V1PolicyRule(
                        api_groups=[""],
                        resources=["services", "events", "namespaces"],
                        verbs=["get", "list", "watch"]
                    ),
                    client.V1PolicyRule(
                        api_groups=["networking.k8s.io"],
                        resources=["ingresses", "ingressclasses"],
                        verbs=["get", "list", "watch"]
                    ),
                    client.V1PolicyRule(
                        api_groups=["networking.k8s.io"],
                        resources=["ingresses/status"],
                        verbs=["update"]
                    ),
                    client.V1PolicyRule(
                        api_groups=["networking.k8s.io"],
                        resources=["ingressclasses"],
                        verbs=["get", "list", "watch"]
                    ),
                    client.V1PolicyRule(
                        api_groups=[""],
                        resources=["events"],
                        verbs=["create", "patch"]
                    ),
                    client.V1PolicyRule(
                        api_groups=["coordination.k8s.io"],
                        resources=["leases"],
                        verbs=["get", "list", "watch", "create", "update"]
                    )
                ]
            )
            rbac_v1.create_cluster_role(cluster_role)
            result["steps"].append("✓ ClusterRole创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ ClusterRole已存在")
            else:
                result["error"] = f"创建ClusterRole失败: {e}"
                return result

        # 步骤4: 创建ClusterRoleBinding
        result["steps"].append("创建ClusterRoleBinding")
        try:
            role_binding = client.V1ClusterRoleBinding(
                api_version="rbac.authorization.k8s.io/v1",
                kind="ClusterRoleBinding",
                metadata=client.V1ObjectMeta(name="ingress-nginx"),
                role_ref=client.V1RoleRef(
                    api_group="rbac.authorization.k8s.io",
                    kind="ClusterRole",
                    name="ingress-nginx"
                ),
                subjects=[
                    client.V1Subject(
                        kind="ServiceAccount",
                        name="ingress-nginx",
                        namespace="ingress-nginx"
                    )
                ]
            )
            rbac_v1.create_cluster_role_binding(role_binding)
            result["steps"].append("✓ ClusterRoleBinding创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ ClusterRoleBinding已存在")
            else:
                result["error"] = f"创建ClusterRoleBinding失败: {e}"
                return result

        # 步骤5: 创建ConfigMap
        result["steps"].append("创建ConfigMap")
        try:
            config_map = client.V1ConfigMap(
                api_version="v1",
                kind="ConfigMap",
                metadata=client.V1ObjectMeta(
                    name="ingress-nginx-controller",
                    namespace="ingress-nginx"
                ),
                data={
                    "use-forwarded-headers": "true",
                    "proxy-real-ip-cidr": "0.0.0.0/0"
                }
            )
            core_v1.create_namespaced_config_map("ingress-nginx", config_map)
            result["steps"].append("✓ ConfigMap创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ ConfigMap已存在")
            else:
                result["error"] = f"创建ConfigMap失败: {e}"
                return result

        # 步骤6: 创建Service
        result["steps"].append("创建Service")
        try:
            service = client.V1Service(
                api_version="v1",
                kind="Service",
                metadata=client.V1ObjectMeta(
                    name="ingress-nginx-controller",
                    namespace="ingress-nginx",
                    labels={"app.kubernetes.io/name": "ingress-nginx"}
                ),
                spec=client.V1ServiceSpec(
                    type="NodePort",
                    ports=[
                        client.V1ServicePort(
                            name="http",
                            port=80,
                            target_port=80,
                            protocol="TCP"
                        ),
                        client.V1ServicePort(
                            name="https",
                            port=443,
                            target_port=443,
                            protocol="TCP"
                        )
                    ],
                    selector={"app.kubernetes.io/name": "ingress-nginx"}
                )
            )
            core_v1.create_namespaced_service("ingress-nginx", service)
            result["steps"].append("✓ Service创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ Service已存在")
            else:
                result["error"] = f"创建Service失败: {e}"
                return result

        # 步骤7: 创建Deployment
        result["steps"].append("创建Deployment")
        try:
            # 确定使用的镜像
            if image:
                controller_image = image
            else:
                image_tag = version if version != "latest" else "v1.9.6"
                controller_image = f"registry.k8s.io/ingress-nginx/controller:{image_tag}"

            deployment = client.V1Deployment(
                api_version="apps/v1",
                kind="Deployment",
                metadata=client.V1ObjectMeta(
                    name="ingress-nginx-controller",
                    namespace="ingress-nginx",
                    labels={"app.kubernetes.io/name": "ingress-nginx"}
                ),
                spec=client.V1DeploymentSpec(
                    replicas=1,
                    selector=client.V1LabelSelector(
                        match_labels={"app.kubernetes.io/name": "ingress-nginx"}
                    ),
                    template=client.V1PodTemplateSpec(
                        metadata=client.V1ObjectMeta(
                            labels={"app.kubernetes.io/name": "ingress-nginx"}
                        ),
                        spec=client.V1PodSpec(
                            service_account_name="ingress-nginx",
                            containers=[
                                client.V1Container(
                                    name="controller",
                                    image=controller_image,
                                    ports=[
                                        client.V1ContainerPort(
                                            name="http",
                                            container_port=80,
                                            protocol="TCP"
                                        ),
                                        client.V1ContainerPort(
                                            name="https",
                                            container_port=443,
                                            protocol="TCP"
                                        ),
                                        client.V1ContainerPort(
                                            name="webhook",
                                            container_port=8443,
                                            protocol="TCP"
                                        )
                                    ],
                                    env=[
                                        client.V1EnvVar(
                                            name="POD_NAME",
                                            value_from=client.V1EnvVarSource(
                                                field_ref=client.V1ObjectFieldSelector(field_path="metadata.name")
                                            )
                                        ),
                                        client.V1EnvVar(
                                            name="POD_NAMESPACE",
                                            value_from=client.V1EnvVarSource(
                                                field_ref=client.V1ObjectFieldSelector(field_path="metadata.namespace")
                                            )
                                        )
                                    ],
                                    liveness_probe=client.V1Probe(
                                        http_get=client.V1HTTPGetAction(
                                            path="/healthz",
                                            port=10254,
                                            scheme="HTTP"
                                        ),
                                        initial_delay_seconds=10,
                                        period_seconds=10,
                                        timeout_seconds=1,
                                        success_threshold=1,
                                        failure_threshold=3
                                    ),
                                    readiness_probe=client.V1Probe(
                                        http_get=client.V1HTTPGetAction(
                                            path="/healthz",
                                            port=10254,
                                            scheme="HTTP"
                                        ),
                                        initial_delay_seconds=10,
                                        period_seconds=10,
                                        timeout_seconds=1,
                                        success_threshold=1,
                                        failure_threshold=3
                                    ),
                                    security_context=client.V1SecurityContext(
                                        allow_privilege_escalation=True,
                                        capabilities=client.V1Capabilities(
                                            drop=["ALL"],
                                            add=["NET_BIND_SERVICE"]
                                        ),
                                        run_as_user=101
                                    )
                                )
                            ],
                            node_selector={"kubernetes.io/os": "linux"},
                            tolerations=[
                                client.V1Toleration(
                                    key="node-role.kubernetes.io/master",
                                    operator="Equal",
                                    value="true",
                                    effect="NoSchedule"
                                ),
                                client.V1Toleration(
                                    key="node-role.kubernetes.io/control-plane",
                                    operator="Equal",
                                    value="true",
                                    effect="NoSchedule"
                                )
                            ]
                        )
                    )
                )
            )
            apps_v1.create_namespaced_deployment("ingress-nginx", deployment)
            result["steps"].append("✓ Deployment创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ Deployment已存在")
            else:
                result["error"] = f"创建Deployment失败: {e}"
                return result

        # 步骤8: 创建IngressClass
        result["steps"].append("创建IngressClass")
        try:
            ingress_class = client.V1IngressClass(
                api_version="networking.k8s.io/v1",
                kind="IngressClass",
                metadata=client.V1ObjectMeta(
                    name="nginx",
                    annotations={"ingressclass.kubernetes.io/is-default-class": "true"}
                ),
                spec=client.V1IngressClassSpec(
                    controller="k8s.io/ingress-nginx"
                )
            )
            networking_v1.create_ingress_class(ingress_class)
            result["steps"].append("✓ IngressClass创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ IngressClass已存在")
            else:
                result["error"] = f"创建IngressClass失败: {e}"
                return result

        # 步骤9: 创建Webhook相关资源 (简化版本)
        result["steps"].append("创建Admission Webhook")
        try:
            # 创建webhook证书生成Job
            job = client.V1Job(
                api_version="batch/v1",
                kind="Job",
                metadata=client.V1ObjectMeta(
                    name="ingress-nginx-admission-create",
                    namespace="ingress-nginx"
                ),
                spec=client.V1JobSpec(
                    template=client.V1PodTemplateSpec(
                        spec=client.V1PodSpec(
                            containers=[
                                client.V1Container(
                                    name="create",
                                    image="registry.k8s.io/ingress-nginx/kube-webhook-certgen:v20231011-8b53cabe0",
                                    command=["/generate-certificates"],
                                    env=[
                                        client.V1EnvVar(
                                            name="CERTIFICATE_NAMESPACE",
                                            value="ingress-nginx"
                                        )
                                    ]
                                )
                            ],
                            restart_policy="OnFailure",
                            service_account_name="ingress-nginx"
                        )
                    )
                )
            )
            batch_v1 = client.BatchV1Api(client_instance)
            batch_v1.create_namespaced_job("ingress-nginx", job)
            result["steps"].append("✓ Admission Webhook创建成功")
        except ApiException as e:
            if e.status == 409:
                result["steps"].append("✓ Admission Webhook已存在")
            else:
                result["steps"].append(f"⚠ Admission Webhook创建失败 (可选): {e}")

        result["success"] = True
        result["message"] = "Ingress Nginx Controller安装完成"
        return result

    except Exception as e:
        result["error"] = f"安装Controller失败: {e}"
        return result
    finally:
        if client_instance:
            client_instance.close()


def uninstall_ingress_controller(cluster: Cluster) -> Dict[str, Any]:
    """卸载Ingress Nginx Controller"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "error": "无法连接到集群"}

    result = {
        "success": False,
        "message": "",
        "steps": [],
        "error": None
    }

    try:
        apps_v1 = client.AppsV1Api(client_instance)
        core_v1 = client.CoreV1Api(client_instance)
        rbac_v1 = client.RbacAuthorizationV1Api(client_instance)
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 删除顺序与安装相反
        steps = [
            ("删除Admission Webhook Job", lambda: core_v1.delete_collection_namespaced_pod("ingress-nginx", label_selector="job-name=ingress-nginx-admission-create")),
            ("删除Job", lambda: client.BatchV1Api(client_instance).delete_namespaced_job("ingress-nginx-admission-create", "ingress-nginx")),
            ("删除IngressClass", lambda: networking_v1.delete_ingress_class("nginx")),
            ("删除Deployment", lambda: apps_v1.delete_namespaced_deployment("ingress-nginx-controller", "ingress-nginx")),
            ("删除Service", lambda: core_v1.delete_namespaced_service("ingress-nginx-controller", "ingress-nginx")),
            ("删除ConfigMap", lambda: core_v1.delete_namespaced_config_map("ingress-nginx-controller", "ingress-nginx")),
            ("删除ClusterRoleBinding", lambda: rbac_v1.delete_cluster_role_binding("ingress-nginx")),
            ("删除ClusterRole", lambda: rbac_v1.delete_cluster_role("ingress-nginx")),
            ("删除ServiceAccount", lambda: core_v1.delete_namespaced_service_account("ingress-nginx", "ingress-nginx")),
            ("删除命名空间", lambda: core_v1.delete_namespace("ingress-nginx"))
        ]

        for step_name, delete_func in steps:
            result["steps"].append(step_name)
            try:
                delete_func()
                result["steps"].append(f"✓ {step_name}成功")
            except ApiException as e:
                if e.status == 404:
                    result["steps"].append(f"✓ {step_name} (已不存在)")
                else:
                    result["steps"].append(f"⚠ {step_name}失败: {e}")
            except Exception as e:
                result["steps"].append(f"⚠ {step_name}失败: {e}")

        result["success"] = True
        result["message"] = "Ingress Nginx Controller卸载完成"
        return result

    except Exception as e:
        result["error"] = f"卸载Controller失败: {e}"
        return result
    finally:
        if client_instance:
            client_instance.close()


# ========== IngressClass 管理 ==========

def get_ingress_classes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取所有IngressClass"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        ingress_classes = networking_v1.list_ingress_class()

        result = []
        for ic in ingress_classes.items:
            # 计算年龄
            from datetime import datetime
            age = "Unknown"
            if ic.metadata.creation_timestamp:
                created = ic.metadata.creation_timestamp.replace(tzinfo=None)
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
                "name": ic.metadata.name if ic.metadata else "unknown",
                "controller": ic.spec.controller if ic.spec else "unknown",
                "is_default": ic.metadata.annotations.get("ingressclass.kubernetes.io/is-default-class", "false") == "true" if ic.metadata and ic.metadata.annotations else False,
                "labels": ic.metadata.labels or {} if ic.metadata else {},
                "annotations": ic.metadata.annotations or {} if ic.metadata else {},
                "age": age
            })

        return result

    except Exception as e:
        print(f"获取IngressClass列表失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()


def create_ingress_class(cluster: Cluster, class_data: Dict[str, Any]) -> bool:
    """创建IngressClass"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 检查IngressClass是否已存在
        try:
            existing = networking_v1.read_ingress_class(class_data["name"])
            if existing:
                print(f"IngressClass '{class_data['name']}' 已存在")
                return False
        except Exception:
            # 如果不存在，会抛出异常，这是正常的
            pass

        ingress_class = client.V1IngressClass(
            api_version="networking.k8s.io/v1",
            kind="IngressClass",
            metadata=client.V1ObjectMeta(
                name=class_data["name"],
                labels=class_data.get("labels", {}),
                annotations=class_data.get("annotations", {})
            ),
            spec=client.V1IngressClassSpec(
                controller=class_data["controller"],
                parameters=class_data.get("parameters")
            )
        )

        networking_v1.create_ingress_class(ingress_class)
        return True

    except Exception as e:
        print(f"创建IngressClass失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def update_ingress_class(cluster: Cluster, class_name: str, updates: Dict[str, Any]) -> bool:
    """更新IngressClass"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)

        # 构建patch对象
        patch = {
            "metadata": {
                "labels": updates.get("labels", {}),
                "annotations": updates.get("annotations", {})
            }
        }

        if "controller" in updates:
            patch["spec"] = {"controller": updates["controller"]}

        networking_v1.patch_ingress_class(class_name, patch)
        return True

    except Exception as e:
        print(f"更新IngressClass失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()


def delete_ingress_class(cluster: Cluster, class_name: str) -> bool:
    """删除IngressClass"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return False

    try:
        networking_v1 = client.NetworkingV1Api(client_instance)
        networking_v1.delete_ingress_class(class_name)
        return True

    except Exception as e:
        print(f"删除IngressClass失败: {e}")
        return False
    finally:
        if client_instance:
            client_instance.close()
