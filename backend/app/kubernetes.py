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
        return []

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
        print(f"获取命名空间信息失败: {e}")
        return []
    finally:
        if client_instance:
            client_instance.close()

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

        # 获取日志
        logs = core_v1.read_namespaced_pod_log(
            name=pod_name,
            namespace=namespace,
            container=container,
            tail_lines=tail_lines
        )

        return logs

    except Exception as e:
        print(f"获取Pod日志失败: {e}")
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
        # 尝试获取节点列表来测试连接（这是一个轻量级的API调用）
        nodes = core_v1.list_node(limit=1)  # 只获取一个节点来测试连接
        return {"success": True, "message": "连接成功"}
    except ApiException as e:
        return {"success": False, "message": f"连接失败: {e.reason}"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()
