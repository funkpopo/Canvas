"""
Kubernetes存储操作模块
提供 StorageClass、PersistentVolume、PersistentVolumeClaim 的操作功能
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...core.logging import get_logger
from ...models import Cluster
from .client_pool import KubernetesClientContext
from .utils import calculate_age


logger = get_logger(__name__)


# ========== StorageClass 操作 ==========


def get_storage_classes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取存储类列表"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            storage_v1 = client.StorageV1Api(client_instance)
            scs = storage_v1.list_storage_class()

            sc_list: List[Dict[str, Any]] = []
            for sc in scs.items or []:
                age = calculate_age(getattr(getattr(sc, "metadata", None), "creation_timestamp", None))

                is_default = False
                annotations = dict(sc.metadata.annotations) if sc.metadata and sc.metadata.annotations else {}
                if annotations:
                    is_default = annotations.get("storageclass.kubernetes.io/is-default-class") == "true"

                sc_list.append(
                    {
                        "name": sc.metadata.name,
                        "provisioner": sc.provisioner,
                        "reclaim_policy": sc.reclaim_policy,
                        "volume_binding_mode": sc.volume_binding_mode,
                        "allow_volume_expansion": bool(sc.allow_volume_expansion),
                        "is_default": is_default,
                        "age": age,
                        "labels": dict(sc.metadata.labels) if sc.metadata.labels else {},
                    }
                )

            return sc_list

        except ApiException as e:
            logger.warning("获取存储类列表失败: cluster=%s error=%s", cluster.name, e)
            return []
        except Exception as e:
            logger.exception("获取存储类列表失败: cluster=%s error=%s", cluster.name, e)
            return []


def create_storage_class(cluster: Cluster, sc_data: Dict[str, Any]) -> bool:
    """创建存储类"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            storage_v1 = client.StorageV1Api(client_instance)

            sc = client.V1StorageClass(
                metadata=client.V1ObjectMeta(
                    name=sc_data["name"],
                    labels=sc_data.get("labels", {}) or {},
                    annotations=sc_data.get("annotations", {}) or {},
                ),
                provisioner=sc_data["provisioner"],
                reclaim_policy=sc_data.get("reclaim_policy", "Delete"),
                volume_binding_mode=sc_data.get("volume_binding_mode", "Immediate"),
                allow_volume_expansion=bool(sc_data.get("allow_volume_expansion", False)),
                parameters=sc_data.get("parameters", {}) or {},
            )

            storage_v1.create_storage_class(sc)
            return True

        except ApiException as e:
            logger.warning("创建存储类失败: cluster=%s error=%s", cluster.name, e)
            return False
        except Exception as e:
            logger.exception("创建存储类失败: cluster=%s error=%s", cluster.name, e)
            return False


def delete_storage_class(cluster: Cluster, sc_name: str) -> bool:
    """删除存储类"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            storage_v1 = client.StorageV1Api(client_instance)
            storage_v1.delete_storage_class(sc_name)
            return True
        except ApiException as e:
            logger.warning("删除存储类失败: cluster=%s sc=%s error=%s", cluster.name, sc_name, e)
            return False
        except Exception as e:
            logger.exception("删除存储类失败: cluster=%s sc=%s error=%s", cluster.name, sc_name, e)
            return False


# ========== PersistentVolume 操作 ==========


def get_persistent_volumes(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取持久卷列表"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvs = core_v1.list_persistent_volume()

            pv_list: List[Dict[str, Any]] = []
            for pv in pvs.items or []:
                age = calculate_age(getattr(getattr(pv, "metadata", None), "creation_timestamp", None))

                capacity = None
                if getattr(getattr(pv, "spec", None), "capacity", None):
                    capacity = pv.spec.capacity.get("storage")

                claim = None
                claim_ref = getattr(getattr(pv, "spec", None), "claim_ref", None)
                if claim_ref and getattr(claim_ref, "namespace", None) and getattr(claim_ref, "name", None):
                    claim = f"{claim_ref.namespace}/{claim_ref.name}"

                pv_list.append(
                    {
                        "name": pv.metadata.name,
                        "capacity": capacity or "",
                        "access_modes": pv.spec.access_modes if pv.spec and pv.spec.access_modes else [],
                        "status": pv.status.phase if pv.status else "Unknown",
                        "claim": claim,
                        "storage_class": getattr(getattr(pv, "spec", None), "storage_class_name", None),
                        "volume_mode": getattr(getattr(pv, "spec", None), "volume_mode", None) or "Filesystem",
                        "age": age,
                        "labels": dict(pv.metadata.labels) if pv.metadata.labels else {},
                    }
                )

            return pv_list

        except ApiException as e:
            logger.warning("获取持久卷列表失败: cluster=%s error=%s", cluster.name, e)
            return []
        except Exception as e:
            logger.exception("获取持久卷列表失败: cluster=%s error=%s", cluster.name, e)
            return []


def get_pv_details(cluster: Cluster, pv_name: str) -> Optional[Dict[str, Any]]:
    """获取持久卷详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pv = core_v1.read_persistent_volume(pv_name)

            age = calculate_age(getattr(getattr(pv, "metadata", None), "creation_timestamp", None))
            creation_timestamp = str(pv.metadata.creation_timestamp) if pv.metadata and pv.metadata.creation_timestamp else "Unknown"

            capacity = None
            if getattr(getattr(pv, "spec", None), "capacity", None):
                capacity = pv.spec.capacity.get("storage")

            claim = None
            claim_ref = getattr(getattr(pv, "spec", None), "claim_ref", None)
            if claim_ref and getattr(claim_ref, "namespace", None) and getattr(claim_ref, "name", None):
                claim = f"{claim_ref.namespace}/{claim_ref.name}"

            return {
                "name": pv.metadata.name,
                "capacity": capacity or "",
                "access_modes": pv.spec.access_modes if pv.spec and pv.spec.access_modes else [],
                "status": pv.status.phase if pv.status else "Unknown",
                "claim": claim,
                "storage_class": getattr(getattr(pv, "spec", None), "storage_class_name", None),
                "volume_mode": getattr(getattr(pv, "spec", None), "volume_mode", None) or "Filesystem",
                "age": age,
                "creation_timestamp": creation_timestamp,
                "labels": dict(pv.metadata.labels) if pv.metadata.labels else {},
                "annotations": dict(pv.metadata.annotations) if pv.metadata.annotations else {},
            }

        except ApiException as e:
            logger.warning("获取PV详情失败: cluster=%s pv=%s error=%s", cluster.name, pv_name, e)
            return None
        except Exception as e:
            logger.exception("获取PV详情失败: cluster=%s pv=%s error=%s", cluster.name, pv_name, e)
            return None


def create_pv(cluster: Cluster, pv_data: Dict[str, Any]) -> bool:
    """创建持久卷（简化：仅支持 hostPath）"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            storage_class_name = pv_data.get("storage_class_name") or pv_data.get("storage_class")
            volume_mode = pv_data.get("volume_mode") or "Filesystem"

            pv_spec = client.V1PersistentVolumeSpec(
                capacity={"storage": pv_data["capacity"]},
                access_modes=pv_data.get("access_modes", ["ReadWriteOnce"]),
                persistent_volume_reclaim_policy=pv_data.get("reclaim_policy", "Retain"),
                storage_class_name=storage_class_name,
                volume_mode=volume_mode,
            )

            # 支持 hostPath
            host_path = pv_data.get("host_path")
            if host_path:
                pv_spec.host_path = client.V1HostPathVolumeSource(path=host_path)

            pv = client.V1PersistentVolume(
                metadata=client.V1ObjectMeta(
                    name=pv_data["name"],
                    labels=pv_data.get("labels", {}) or {},
                    annotations=pv_data.get("annotations", {}) or {},
                ),
                spec=pv_spec,
            )

            core_v1.create_persistent_volume(pv)
            return True

        except ApiException as e:
            logger.warning("创建持久卷失败: cluster=%s pv=%s error=%s", cluster.name, pv_data.get("name"), e)
            return False
        except Exception as e:
            logger.exception("创建持久卷失败: cluster=%s pv=%s error=%s", cluster.name, pv_data.get("name"), e)
            return False


def delete_pv(cluster: Cluster, pv_name: str) -> bool:
    """删除持久卷"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_persistent_volume(pv_name)
            return True
        except ApiException as e:
            logger.warning("删除持久卷失败: cluster=%s pv=%s error=%s", cluster.name, pv_name, e)
            return False
        except Exception as e:
            logger.exception("删除持久卷失败: cluster=%s pv=%s error=%s", cluster.name, pv_name, e)
            return False


# ========== PersistentVolumeClaim 操作 ==========


def _pvc_to_dict(pvc: client.V1PersistentVolumeClaim, namespace: Optional[str] = None) -> Dict[str, Any]:
    ns = namespace or getattr(getattr(pvc, "metadata", None), "namespace", None)
    age = calculate_age(getattr(getattr(pvc, "metadata", None), "creation_timestamp", None))

    status = getattr(getattr(pvc, "status", None), "phase", None) or "Unknown"
    volume = getattr(getattr(pvc, "spec", None), "volume_name", None)

    capacity = None
    if getattr(getattr(pvc, "status", None), "capacity", None):
        capacity = pvc.status.capacity.get("storage")

    access_modes = []
    if getattr(getattr(pvc, "spec", None), "access_modes", None):
        access_modes = pvc.spec.access_modes or []

    storage_class = getattr(getattr(pvc, "spec", None), "storage_class_name", None)
    volume_mode = getattr(getattr(pvc, "spec", None), "volume_mode", None) or "Filesystem"

    return {
        "name": pvc.metadata.name,
        "namespace": ns,
        "status": status,
        "volume": volume,
        "capacity": capacity,
        "access_modes": access_modes,
        "storage_class": storage_class,
        "volume_mode": volume_mode,
        "age": age,
        "labels": dict(pvc.metadata.labels) if pvc.metadata.labels else {},
        "annotations": dict(pvc.metadata.annotations) if pvc.metadata.annotations else {},
    }


def get_persistent_volume_claims(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取集群所有命名空间的 PVC 列表"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvcs = core_v1.list_persistent_volume_claim_for_all_namespaces()

            pvc_list: List[Dict[str, Any]] = []
            for pvc in pvcs.items or []:
                pvc_list.append(_pvc_to_dict(pvc))

            return pvc_list

        except ApiException as e:
            logger.warning("获取PVC列表失败: cluster=%s error=%s", cluster.name, e)
            return []
        except Exception as e:
            logger.exception("获取PVC列表失败: cluster=%s error=%s", cluster.name, e)
            return []


def get_namespace_pvcs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取指定命名空间的 PVC 列表"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace)

            pvc_list: List[Dict[str, Any]] = []
            for pvc in pvcs.items or []:
                pvc_list.append(_pvc_to_dict(pvc, namespace=namespace))

            return pvc_list

        except ApiException as e:
            logger.warning("获取Namespace PVC列表失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []
        except Exception as e:
            logger.exception("获取Namespace PVC列表失败: cluster=%s ns=%s error=%s", cluster.name, namespace, e)
            return []


def get_pvc_details(cluster: Cluster, namespace: str, pvc_name: str) -> Optional[Dict[str, Any]]:
    """获取 PVC 详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvc = core_v1.read_namespaced_persistent_volume_claim(pvc_name, namespace)
            return _pvc_to_dict(pvc, namespace=namespace)
        except ApiException as e:
            logger.warning("获取PVC详情失败: cluster=%s ns=%s pvc=%s error=%s", cluster.name, namespace, pvc_name, e)
            return None
        except Exception as e:
            logger.exception("获取PVC详情失败: cluster=%s ns=%s pvc=%s error=%s", cluster.name, namespace, pvc_name, e)
            return None


def create_pvc(cluster: Cluster, pvc_data: dict) -> bool:
    """创建持久卷声明"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

            pvc_spec = client.V1PersistentVolumeClaimSpec(
                access_modes=pvc_data["access_modes"],
                storage_class_name=pvc_data.get("storage_class_name"),
                volume_mode=pvc_data.get("volume_mode", "Filesystem"),
                resources=client.V1ResourceRequirements(requests=pvc_data["requests"]),
            )

            pvc = client.V1PersistentVolumeClaim(
                metadata=client.V1ObjectMeta(
                    name=pvc_data["name"],
                    namespace=pvc_data["namespace"],
                    labels=pvc_data.get("labels", {}) or {},
                    annotations=pvc_data.get("annotations", {}) or {},
                ),
                spec=pvc_spec,
            )

            core_v1.create_namespaced_persistent_volume_claim(pvc_data["namespace"], pvc)
            return True

        except ApiException as e:
            logger.warning(
                "创建PVC失败: cluster=%s ns=%s pvc=%s error=%s",
                cluster.name,
                pvc_data.get("namespace"),
                pvc_data.get("name"),
                e,
            )
            return False
        except Exception as e:
            logger.exception(
                "创建PVC失败: cluster=%s ns=%s pvc=%s error=%s",
                cluster.name,
                pvc_data.get("namespace"),
                pvc_data.get("name"),
                e,
            )
            return False


def delete_pvc(cluster: Cluster, namespace: str, pvc_name: str) -> bool:
    """删除持久卷声明"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)
            core_v1.delete_namespaced_persistent_volume_claim(pvc_name, namespace)
            return True
        except ApiException as e:
            logger.warning("删除PVC失败: cluster=%s ns=%s pvc=%s error=%s", cluster.name, namespace, pvc_name, e)
            return False
        except Exception as e:
            logger.exception("删除PVC失败: cluster=%s ns=%s pvc=%s error=%s", cluster.name, namespace, pvc_name, e)
            return False


# ========== Volume文件操作（简化版本） ==========


def browse_volume_files(cluster: Cluster, pv_name: str, path: str) -> List[Dict[str, Any]]:
    """浏览卷内文件（简化的实现）

    注：真实文件浏览需要通过 Pod 挂载卷并执行命令/读取文件，本仓库先提供演示数据。
    """
    try:
        if path == "/":
            return [
                {"name": "example.txt", "type": "file", "size": 1024, "modified_time": "2024-01-01 12:00:00"},
                {"name": "data", "type": "directory", "size": None, "modified_time": "2024-01-01 12:00:00"},
            ]
        if path == "/data":
            return [
                {"name": "config.yaml", "type": "file", "size": 512, "modified_time": "2024-01-01 12:00:00"},
                {"name": "logs", "type": "directory", "size": None, "modified_time": "2024-01-01 12:00:00"},
            ]
        return []
    except Exception as e:
        logger.exception("浏览卷文件失败: %s", e)
        return []


def read_volume_file(cluster: Cluster, pv_name: str, file_path: str, max_lines: Optional[int] = None) -> Optional[str]:
    """读取卷内文件内容（简化的实现）"""
    try:
        if file_path == "/example.txt":
            content = "This is an example file content.\nLine 2\nLine 3\n"
        elif file_path == "/data/config.yaml":
            content = "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n"
        else:
            content = "File not found or cannot be read."

        if max_lines:
            lines = content.split("\n")
            content = "\n".join(lines[:max_lines])

        return content
    except Exception as e:
        logger.exception("读取卷文件失败: %s", e)
        return None

