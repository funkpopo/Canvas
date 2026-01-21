"""
Kubernetes ConfigMap 和 Secret 操作模块
提供 ConfigMap / Secret 的增删查改，以及 YAML 导入/导出能力
"""

from __future__ import annotations

import base64
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple

import yaml
from kubernetes import client
from kubernetes.client.rest import ApiException

from ...core.logging import get_logger
from ...models import Cluster
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


def _decode_secret_data(data: Optional[Dict[str, str]]) -> Dict[str, str]:
    decoded: Dict[str, str] = {}
    for key, value in (data or {}).items():
        try:
            decoded[key] = base64.b64decode(value).decode("utf-8")
        except Exception:
            decoded[key] = "[二进制数据]"
    return decoded


def _encode_secret_data(data: Optional[Dict[str, Any]]) -> Dict[str, str]:
    encoded: Dict[str, str] = {}
    for key, value in (data or {}).items():
        if value is None:
            continue
        if isinstance(value, bytes):
            raw = value
        else:
            raw = str(value).encode("utf-8")
        encoded[key] = base64.b64encode(raw).decode("utf-8")
    return encoded


def _yaml_secret_payload(secret_dict: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """从 YAML dict 中提取 Secret 的 data / stringData。"""
    data = secret_dict.get("data") or {}
    string_data = secret_dict.get("stringData") or secret_dict.get("string_data") or {}
    if not isinstance(data, dict):
        data = {}
    if not isinstance(string_data, dict):
        string_data = {}
    return data, string_data


# ========== ConfigMap 操作 ==========


def get_namespace_configmaps(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的 ConfigMaps（列表）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            configmaps = core_v1.list_namespaced_config_map(namespace)

            configmap_list: List[Dict[str, Any]] = []
            for cm in configmaps.items or []:
                age = calculate_age(getattr(getattr(cm, "metadata", None), "creation_timestamp", None))
                configmap_list.append(
                    {
                        "name": cm.metadata.name,
                        "namespace": namespace,
                        "data": dict(cm.data) if cm.data else {},
                        "labels": dict(cm.metadata.labels) if cm.metadata.labels else {},
                        "annotations": dict(cm.metadata.annotations) if cm.metadata.annotations else {},
                        "age": age,
                        "cluster_name": cluster.name,
                        "cluster_id": cluster.id,
                    }
                )

            return configmap_list

        except ApiException as e:
            logger.warning("获取命名空间ConfigMaps失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []
        except Exception as e:
            logger.exception("获取命名空间ConfigMaps失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []


def get_configmap_details(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[Dict[str, Any]]:
    """获取 ConfigMap 详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

            age = calculate_age(getattr(getattr(cm, "metadata", None), "creation_timestamp", None))
            creation_timestamp = str(cm.metadata.creation_timestamp) if cm.metadata and cm.metadata.creation_timestamp else "Unknown"

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
                "cluster_id": cluster.id,
            }

        except ApiException as e:
            logger.warning(
                "获取ConfigMap详情失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return None
        except Exception as e:
            logger.exception(
                "获取ConfigMap详情失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return None


def create_configmap(cluster: Cluster, namespace: str, configmap_data: Dict[str, Any]) -> bool:
    """创建 ConfigMap（非 YAML）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            configmap = client.V1ConfigMap(
                metadata=client.V1ObjectMeta(
                    name=configmap_data["name"],
                    namespace=namespace,
                    labels=configmap_data.get("labels", {}) or {},
                    annotations=configmap_data.get("annotations", {}) or {},
                ),
                data=configmap_data.get("data", {}) or {},
                binary_data=configmap_data.get("binary_data", {}) or {},
            )

            core_v1.create_namespaced_config_map(namespace, configmap)
            return True

        except ApiException as e:
            logger.warning("创建ConfigMap失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return False
        except Exception as e:
            logger.exception("创建ConfigMap失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return False


def update_configmap(cluster: Cluster, namespace: str, configmap_name: str, update_data: Dict[str, Any]) -> bool:
    """更新 ConfigMap（非 YAML）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

            if "data" in update_data and update_data["data"] is not None:
                cm.data = update_data["data"]
            if "binary_data" in update_data and update_data["binary_data"] is not None:
                cm.binary_data = update_data["binary_data"]
            if "labels" in update_data and update_data["labels"] is not None:
                cm.metadata.labels = update_data["labels"]
            if "annotations" in update_data and update_data["annotations"] is not None:
                cm.metadata.annotations = update_data["annotations"]

            core_v1.replace_namespaced_config_map(configmap_name, namespace, cm)
            return True

        except ApiException as e:
            logger.warning(
                "更新ConfigMap失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return False
        except Exception as e:
            logger.exception(
                "更新ConfigMap失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return False


def delete_configmap(cluster: Cluster, namespace: str, configmap_name: str) -> bool:
    """删除 ConfigMap"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_namespaced_config_map(configmap_name, namespace)
            return True
        except ApiException as e:
            logger.warning(
                "删除ConfigMap失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return False
        except Exception as e:
            logger.exception(
                "删除ConfigMap失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return False


def get_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str) -> Optional[str]:
    """获取 ConfigMap 的 YAML 配置"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            cm = core_v1.read_namespaced_config_map(configmap_name, namespace)

            cm_dict = client_instance.sanitize_for_serialization(cm)
            yaml_output = StringIO()
            yaml.dump(cm_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
            return yaml_output.getvalue()

        except ApiException as e:
            logger.warning(
                "获取ConfigMap YAML失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return None
        except Exception as e:
            logger.exception(
                "获取ConfigMap YAML失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e
            )
            return None


def create_configmap_from_yaml(cluster: Cluster, namespace: str, yaml_content: str) -> Dict[str, Any]:
    """从 YAML 创建 ConfigMap"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            core_v1 = client.CoreV1Api(client_instance)

            cm_dict = yaml.safe_load(yaml_content) or {}
            if not isinstance(cm_dict, dict):
                return {"success": False, "message": "YAML内容格式不正确"}

            metadata = cm_dict.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
            name = metadata.get("name")
            if not name:
                return {"success": False, "message": "YAML缺少 metadata.name"}

            # 强制使用 URL 参数 namespace，避免越权/误操作
            metadata["namespace"] = namespace
            cm_dict["metadata"] = metadata
            cm_dict.pop("status", None)

            cm = client.V1ConfigMap(
                api_version=cm_dict.get("apiVersion", "v1"),
                kind=cm_dict.get("kind", "ConfigMap"),
                metadata=client.V1ObjectMeta(
                    name=name,
                    namespace=namespace,
                    labels=metadata.get("labels", {}) or {},
                    annotations=metadata.get("annotations", {}) or {},
                ),
                data=cm_dict.get("data", {}) or {},
                binary_data=cm_dict.get("binaryData", {}) or cm_dict.get("binary_data", {}) or {},
            )

            core_v1.create_namespaced_config_map(namespace, cm)
            return {"success": True, "message": f"ConfigMap '{name}' 创建成功", "name": name}

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            logger.exception("通过YAML创建ConfigMap失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return {"success": False, "message": f"创建ConfigMap失败: {str(e)}"}


def update_configmap_yaml(cluster: Cluster, namespace: str, configmap_name: str, yaml_content: str) -> Dict[str, Any]:
    """通过 YAML 更新 ConfigMap"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            core_v1 = client.CoreV1Api(client_instance)

            cm_dict = yaml.safe_load(yaml_content) or {}
            if not isinstance(cm_dict, dict):
                return {"success": False, "message": "YAML内容格式不正确"}

            # 读取现有对象以携带 resourceVersion，避免 422 Invalid
            existing = core_v1.read_namespaced_config_map(configmap_name, namespace)

            metadata = cm_dict.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
            # 强制与 URL 参数一致
            metadata["name"] = configmap_name
            metadata["namespace"] = namespace

            if "labels" in metadata and metadata["labels"] is not None:
                existing.metadata.labels = metadata.get("labels") or {}
            if "annotations" in metadata and metadata["annotations"] is not None:
                existing.metadata.annotations = metadata.get("annotations") or {}

            if "data" in cm_dict and cm_dict["data"] is not None:
                existing.data = cm_dict.get("data") or {}
            if "binaryData" in cm_dict or "binary_data" in cm_dict:
                existing.binary_data = cm_dict.get("binaryData") or cm_dict.get("binary_data") or {}

            core_v1.replace_namespaced_config_map(configmap_name, namespace, existing)
            return {"success": True, "message": f"ConfigMap '{configmap_name}' 更新成功"}

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            logger.exception("通过YAML更新ConfigMap失败: cluster=%s ns=%s cm=%s error=%s", cluster.name, namespace, configmap_name, e)
            return {"success": False, "message": f"更新ConfigMap失败: {str(e)}"}


# ========== Secret 操作 ==========


def get_namespace_secrets(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的 Secrets（列表）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            secrets = core_v1.list_namespaced_secret(namespace)

            secret_list: List[Dict[str, Any]] = []
            for secret in secrets.items or []:
                age = calculate_age(getattr(getattr(secret, "metadata", None), "creation_timestamp", None))
                secret_list.append(
                    {
                        "name": secret.metadata.name,
                        "namespace": namespace,
                        "type": secret.type,
                        "data_keys": list((secret.data or {}).keys()),
                        "labels": dict(secret.metadata.labels) if secret.metadata.labels else {},
                        "annotations": dict(secret.metadata.annotations) if secret.metadata.annotations else {},
                        "age": age,
                        "cluster_name": cluster.name,
                        "cluster_id": cluster.id,
                    }
                )

            return secret_list

        except ApiException as e:
            logger.warning("获取命名空间Secrets失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []
        except Exception as e:
            logger.exception("获取命名空间Secrets失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []


def get_secret_details(cluster: Cluster, namespace: str, secret_name: str) -> Optional[Dict[str, Any]]:
    """获取 Secret 详情（data 自动 base64 解码为明文字符串；非 UTF-8 显示为占位符）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            secret = core_v1.read_namespaced_secret(secret_name, namespace)

            age = calculate_age(getattr(getattr(secret, "metadata", None), "creation_timestamp", None))
            creation_timestamp = (
                str(secret.metadata.creation_timestamp) if secret.metadata and secret.metadata.creation_timestamp else "Unknown"
            )

            decoded_data = _decode_secret_data(secret.data)

            return {
                "name": secret.metadata.name,
                "namespace": namespace,
                "type": secret.type,
                "data": decoded_data,
                "data_keys": list((secret.data or {}).keys()),
                "age": age,
                "creation_timestamp": creation_timestamp,
                "labels": dict(secret.metadata.labels) if secret.metadata.labels else {},
                "annotations": dict(secret.metadata.annotations) if secret.metadata.annotations else {},
                "cluster_name": cluster.name,
                "cluster_id": cluster.id,
            }

        except ApiException as e:
            logger.warning(
                "获取Secret详情失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return None
        except Exception as e:
            logger.exception(
                "获取Secret详情失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return None


def create_secret(cluster: Cluster, namespace: str, secret_data: Dict[str, Any]) -> bool:
    """创建 Secret（非 YAML；入参 data 为明文，将自动编码为 base64 后写入 data 字段）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            encoded_data = _encode_secret_data(secret_data.get("data"))
            secret = client.V1Secret(
                metadata=client.V1ObjectMeta(
                    name=secret_data["name"],
                    namespace=namespace,
                    labels=secret_data.get("labels", {}) or {},
                    annotations=secret_data.get("annotations", {}) or {},
                ),
                type=secret_data.get("type", "Opaque"),
                data=encoded_data,
            )

            core_v1.create_namespaced_secret(namespace, secret)
            return True

        except ApiException as e:
            logger.warning("创建Secret失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return False
        except Exception as e:
            logger.exception("创建Secret失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return False


def update_secret(cluster: Cluster, namespace: str, secret_name: str, update_data: Dict[str, Any]) -> bool:
    """更新 Secret（非 YAML）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            secret = core_v1.read_namespaced_secret(secret_name, namespace)

            if "type" in update_data and update_data["type"] is not None:
                secret.type = update_data["type"]

            if "data" in update_data and update_data["data"] is not None:
                secret.data = _encode_secret_data(update_data["data"])

            if "labels" in update_data and update_data["labels"] is not None:
                secret.metadata.labels = update_data["labels"]

            if "annotations" in update_data and update_data["annotations"] is not None:
                secret.metadata.annotations = update_data["annotations"]

            core_v1.replace_namespaced_secret(secret_name, namespace, secret)
            return True

        except ApiException as e:
            logger.warning(
                "更新Secret失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return False
        except Exception as e:
            logger.exception(
                "更新Secret失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return False


def delete_secret(cluster: Cluster, namespace: str, secret_name: str) -> bool:
    """删除 Secret"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_namespaced_secret(secret_name, namespace)
            return True
        except ApiException as e:
            logger.warning(
                "删除Secret失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return False
        except Exception as e:
            logger.exception(
                "删除Secret失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return False


def get_secret_yaml(cluster: Cluster, namespace: str, secret_name: str) -> Optional[str]:
    """获取 Secret 的 YAML 配置"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            secret = core_v1.read_namespaced_secret(secret_name, namespace)

            secret_dict = client_instance.sanitize_for_serialization(secret)
            yaml_output = StringIO()
            yaml.dump(secret_dict, yaml_output, default_flow_style=False, allow_unicode=True, sort_keys=False)
            return yaml_output.getvalue()

        except ApiException as e:
            logger.warning(
                "获取Secret YAML失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return None
        except Exception as e:
            logger.exception(
                "获取Secret YAML失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e
            )
            return None


def create_secret_yaml(cluster: Cluster, namespace: str, yaml_content: str) -> Dict[str, Any]:
    """从 YAML 创建 Secret（namespace 由 URL/调用方决定，避免 YAML 越权）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            core_v1 = client.CoreV1Api(client_instance)

            secret_dict = yaml.safe_load(yaml_content) or {}
            if not isinstance(secret_dict, dict):
                return {"success": False, "message": "YAML内容格式不正确"}

            metadata = secret_dict.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}

            name = metadata.get("name")
            if not name:
                return {"success": False, "message": "YAML缺少 metadata.name"}

            data, string_data = _yaml_secret_payload(secret_dict)

            secret = client.V1Secret(
                api_version=secret_dict.get("apiVersion", "v1"),
                kind=secret_dict.get("kind", "Secret"),
                metadata=client.V1ObjectMeta(
                    name=name,
                    namespace=namespace,
                    labels=metadata.get("labels", {}) or {},
                    annotations=metadata.get("annotations", {}) or {},
                ),
                type=secret_dict.get("type", "Opaque"),
                data=data,
                string_data=string_data,
            )

            core_v1.create_namespaced_secret(namespace, secret)
            return {"success": True, "message": f"Secret '{name}' 创建成功", "name": name}

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            logger.exception("通过YAML创建Secret失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return {"success": False, "message": f"创建Secret失败: {str(e)}"}


def update_secret_yaml(cluster: Cluster, namespace: str, secret_name: str, yaml_content: str) -> Dict[str, Any]:
    """通过 YAML 更新 Secret"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return {"success": False, "message": "无法创建Kubernetes客户端"}

        try:
            core_v1 = client.CoreV1Api(client_instance)

            secret_dict = yaml.safe_load(yaml_content) or {}
            if not isinstance(secret_dict, dict):
                return {"success": False, "message": "YAML内容格式不正确"}

            # 读取现有对象以携带 resourceVersion，避免 422 Invalid
            existing = core_v1.read_namespaced_secret(secret_name, namespace)

            metadata = secret_dict.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
            # 强制与 URL 参数一致
            metadata["name"] = secret_name
            metadata["namespace"] = namespace

            if "labels" in metadata and metadata["labels"] is not None:
                existing.metadata.labels = metadata.get("labels") or {}
            if "annotations" in metadata and metadata["annotations"] is not None:
                existing.metadata.annotations = metadata.get("annotations") or {}

            if "type" in secret_dict and secret_dict["type"] is not None:
                existing.type = secret_dict.get("type")

            if "data" in secret_dict or "stringData" in secret_dict or "string_data" in secret_dict:
                data, string_data = _yaml_secret_payload(secret_dict)
                existing.data = data
                existing.string_data = string_data

            core_v1.replace_namespaced_secret(secret_name, namespace, existing)
            return {"success": True, "message": f"Secret '{secret_name}' 更新成功"}

        except ApiException as e:
            return {"success": False, "message": f"API错误: {e.body}"}
        except Exception as e:
            logger.exception("通过YAML更新Secret失败: cluster=%s ns=%s secret=%s error=%s", cluster.name, namespace, secret_name, e)
            return {"success": False, "message": f"更新Secret失败: {str(e)}"}

