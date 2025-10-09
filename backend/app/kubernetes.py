import tempfile
import os
from typing import Dict, Any, Optional
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
