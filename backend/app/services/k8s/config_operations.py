"""
Kubernetes ConfigMap和Secret操作模块
提供ConfigMap和Secret的增删查改功能
"""

import yaml
import base64
from io import StringIO
from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import create_k8s_client
from .utils import calculate_age


logger = get_logger(__name__)


# ========== ConfigMap 操作 ==========

def get_namespace_configmaps(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的ConfigMaps"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        configmaps = core_v1.list_namespaced_config_map(namespace)

        configmap_list = []
        for cm in configmaps.items:
            # 获取数据键数量
            data_keys = len(cm.data) if cm.data else 0

            # 计算年龄
            age = calculate_age(cm.metadata.creation_timestamp)

            configmap_info = {
                "name": cm.metadata.name,
                "namespace": namespace,
                "data_keys": data_keys,
                "age": age,
                "labels": dict(cm.metadata.labels) if cm.metadata.labels else {}
            }
            configmap_list.append(configmap_info)

        return configmap_list

    except Exception as e:
        logger.exception("获取命名空间ConfigMaps失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_configmap_details(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[Dict[str, Any]]:
    """获取ConfigMap详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

        # 计算年龄
        age = calculate_age(cm.metadata.creation_timestamp)
        creation_timestamp = str(cm.metadata.creation_timestamp) if cm.metadata.creation_timestamp else "Unknown"

        return {
            "name": cm.metadata.name,
            "namespace": namespace,
            "data": dict(cm.data) if cm.data else {},
            "binary_data": dict(cm.binary_data) if cm.binary_data else {},
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(cm.metadata.labels) if cm.metadata.labels else {},
            "annotations": dict(cm.metadata.annotations) if cm.metadata.annotations else {},
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        logger.exception("获取ConfigMap详情失败: %s", e)
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
            metadata=client.V1ObjectMeta(
                name=configmap_data["name"],
                namespace=namespace,
                labels=configmap_data.get("labels", {}),
                annotations=configmap_data.get("annotations", {})
            ),
            data=configmap_data.get("data", {}),
            binary_data=configmap_data.get("binary_data", {})
        )

        core_v1.create_namespaced_config_map(namespace, configmap)
        return True

    except Exception as e:
        logger.exception("创建ConfigMap失败: %s", e)
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
        logger.exception("删除ConfigMap失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[str]:
    """获取ConfigMap的YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

        # 使用Kubernetes Python客户端的序列化方法
        api_client = client.ApiClient()
        cm_dict = api_client.sanitize_for_serialization(cm)

        # 转换为YAML字符串
        yaml_output = StringIO()
        yaml.dump(cm_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
        return yaml_output.getvalue()

    except Exception as e:
        logger.exception("获取ConfigMap YAML失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_configmap_from_yaml(cluster: Cluster, namespace: str, yaml_content: str) -> Dict[str, Any]:
    """从YAML创建ConfigMap"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 解析YAML
        cm_dict = yaml.safe_load(yaml_content)

        # 创建ConfigMap对象
        configmap = client.V1ConfigMap(
            api_version=cm_dict.get("apiVersion", "v1"),
            kind=cm_dict.get("kind", "ConfigMap"),
            metadata=client.V1ObjectMeta(
                name=cm_dict["metadata"]["name"],
                namespace=namespace,
                labels=cm_dict["metadata"].get("labels", {}),
                annotations=cm_dict["metadata"].get("annotations", {})
            ),
            data=cm_dict.get("data", {}),
            binary_data=cm_dict.get("binaryData", {})
        )

        core_v1.create_namespaced_config_map(namespace, configmap)
        return {"success": True, "message": f"ConfigMap '{cm_dict['metadata']['name']}' 创建成功"}

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"创建ConfigMap失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


def update_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str, yaml_content: str) -> Dict[str, Any]:
    """更新ConfigMap的YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 解析YAML
        cm_dict = yaml.safe_load(yaml_content)

        # 创建ConfigMap对象
        configmap = client.V1ConfigMap(
            api_version=cm_dict.get("apiVersion", "v1"),
            kind=cm_dict.get("kind", "ConfigMap"),
            metadata=client.V1ObjectMeta(
                name=cm_dict["metadata"]["name"],
                namespace=namespace,
                labels=cm_dict["metadata"].get("labels", {}),
                annotations=cm_dict["metadata"].get("annotations", {})
            ),
            data=cm_dict.get("data", {}),
            binary_data=cm_dict.get("binaryData", {})
        )

        core_v1.replace_namespaced_config_map(configmap_name, namespace, configmap)
        return {"success": True, "message": f"ConfigMap '{configmap_name}' 更新成功"}

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"更新ConfigMap失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


# ========== Secret 操作 ==========

def get_namespace_secrets(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的Secrets"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return []

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secrets = core_v1.list_namespaced_secret(namespace)

        secret_list = []
        for secret in secrets.items:
            # 获取数据键数量
            data_keys = len(secret.data) if secret.data else 0

            # 计算年龄
            age = calculate_age(secret.metadata.creation_timestamp)

            secret_info = {
                "name": secret.metadata.name,
                "namespace": namespace,
                "type": secret.type,
                "data_keys": data_keys,
                "age": age,
                "labels": dict(secret.metadata.labels) if secret.metadata.labels else {}
            }
            secret_list.append(secret_info)

        return secret_list

    except Exception as e:
        logger.exception("获取命名空间Secrets失败: %s", e)
        return []
    finally:
        if client_instance:
            client_instance.close()


def get_secret_details(cluster: Cluster, namespace: str, secret_name: str) -> Optional[Dict[str, Any]]:
    """获取Secret详情"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secret = core_v1.read_namespaced_secret(secret_name, namespace)

        # 计算年龄
        age = calculate_age(secret.metadata.creation_timestamp)
        creation_timestamp = str(secret.metadata.creation_timestamp) if secret.metadata.creation_timestamp else "Unknown"

        # 处理数据（解码base64）
        decoded_data = {}
        if secret.data:
            for key, value in secret.data.items():
                try:
                    decoded_data[key] = base64.b64decode(value).decode('utf-8')
                except:
                    decoded_data[key] = "[二进制数据]"

        return {
            "name": secret.metadata.name,
            "namespace": namespace,
            "type": secret.type,
            "data": decoded_data,
            "data_keys": list(secret.data.keys()) if secret.data else [],
            "age": age,
            "creation_timestamp": creation_timestamp,
            "labels": dict(secret.metadata.labels) if secret.metadata.labels else {},
            "annotations": dict(secret.metadata.annotations) if secret.metadata.annotations else {},
            "cluster_name": cluster.name,
            "cluster_id": cluster.id
        }

    except Exception as e:
        logger.exception("获取Secret详情失败: %s", e)
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

        # 将数据编码为base64
        encoded_data = {}
        if secret_data.get("data"):
            for key, value in secret_data["data"].items():
                if isinstance(value, str):
                    encoded_data[key] = base64.b64encode(value.encode('utf-8')).decode('utf-8')
                else:
                    encoded_data[key] = value

        secret = client.V1Secret(
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
        logger.exception("创建Secret失败: %s", e)
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
        logger.exception("删除Secret失败: %s", e)
        return False
    finally:
        if client_instance:
            client_instance.close()


def get_secret_yaml(cluster: Cluster, namespace: str, secret_name: str) -> Optional[str]:
    """获取Secret的YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return None

    try:
        core_v1 = client.CoreV1Api(client_instance)
        secret = core_v1.read_namespaced_secret(secret_name, namespace)

        # 使用Kubernetes Python客户端的序列化方法
        api_client = client.ApiClient()
        secret_dict = api_client.sanitize_for_serialization(secret)

        # 转换为YAML字符串
        yaml_output = StringIO()
        yaml.dump(secret_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
        return yaml_output.getvalue()

    except Exception as e:
        logger.exception("获取Secret YAML失败: %s", e)
        return None
    finally:
        if client_instance:
            client_instance.close()


def create_secret_yaml(cluster: Cluster, namespace: str, yaml_content: str) -> Dict[str, Any]:
    """从YAML创建Secret"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 解析YAML
        secret_dict = yaml.safe_load(yaml_content)

        # 创建Secret对象
        secret = client.V1Secret(
            api_version=secret_dict.get("apiVersion", "v1"),
            kind=secret_dict.get("kind", "Secret"),
            metadata=client.V1ObjectMeta(
                name=secret_dict["metadata"]["name"],
                namespace=namespace,
                labels=secret_dict["metadata"].get("labels", {}),
                annotations=secret_dict["metadata"].get("annotations", {})
            ),
            type=secret_dict.get("type", "Opaque"),
            data=secret_dict.get("data", {})
        )

        core_v1.create_namespaced_secret(namespace, secret)
        return {"success": True, "message": f"Secret '{secret_dict['metadata']['name']}' 创建成功"}

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"创建Secret失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()


def update_secret_yaml(cluster: Cluster, namespace: str, secret_name: str, yaml_content: str) -> Dict[str, Any]:
    """更新Secret的YAML"""
    client_instance = create_k8s_client(cluster)
    if not client_instance:
        return {"success": False, "message": "无法创建Kubernetes客户端"}

    try:
        core_v1 = client.CoreV1Api(client_instance)

        # 解析YAML
        secret_dict = yaml.safe_load(yaml_content)

        # 创建Secret对象
        secret = client.V1Secret(
            api_version=secret_dict.get("apiVersion", "v1"),
            kind=secret_dict.get("kind", "Secret"),
            metadata=client.V1ObjectMeta(
                name=secret_dict["metadata"]["name"],
                namespace=namespace,
                labels=secret_dict["metadata"].get("labels", {}),
                annotations=secret_dict["metadata"].get("annotations", {})
            ),
            type=secret_dict.get("type", "Opaque"),
            data=secret_dict.get("data", {})
        )

        core_v1.replace_namespaced_secret(secret_name, namespace, secret)
        return {"success": True, "message": f"Secret '{secret_name}' 更新成功"}

    except ApiException as e:
        return {"success": False, "message": f"API错误: {e.body}"}
    except Exception as e:
        return {"success": False, "message": f"更新Secret失败: {str(e)}"}
    finally:
        if client_instance:
            client_instance.close()
