"""
Kubernetes存储操作模块
提供StorageClass、PersistentVolume、PersistentVolumeClaim的操作功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
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

        sc_list = []
        for sc in scs.items:
            # 计算年龄
            age = calculate_age(sc.metadata.creation_timestamp)

            # 判断是否为默认存储类
            is_default = False
            if sc.metadata.annotations:
                is_default = sc.metadata.annotations.get("storageclass.kubernetes.io/is-default-class") == "true"

            sc_info = {
                "name": sc.metadata.name,
                "provisioner": sc.provisioner,
                "reclaim_policy": sc.reclaim_policy,
                "volume_binding_mode": sc.volume_binding_mode,
                "allow_volume_expansion": sc.allow_volume_expansion,
                "is_default": is_default,
                "age": age,
                "labels": dict(sc.metadata.labels) if sc.metadata.labels else {}
            }
            sc_list.append(sc_info)

            return sc_list

        except Exception as e:
            logger.exception("获取存储类列表失败: %s", e)
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
                labels=sc_data.get("labels", {}),
                annotations=sc_data.get("annotations", {})
            ),
            provisioner=sc_data["provisioner"],
            reclaim_policy=sc_data.get("reclaim_policy", "Delete"),
            volume_binding_mode=sc_data.get("volume_binding_mode", "Immediate"),
            allow_volume_expansion=sc_data.get("allow_volume_expansion", False),
            parameters=sc_data.get("parameters", {})
        )

            storage_v1.create_storage_class(sc)
            return True

        except Exception as e:
            logger.exception("创建存储类失败: %s", e)
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

        except Exception as e:
            logger.exception("删除存储类失败: %s", e)
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

        pv_list = []
        for pv in pvs.items:
            # 计算年龄
            age = calculate_age(pv.metadata.creation_timestamp)

            # 获取容量
            capacity = pv.spec.capacity.get("storage") if pv.spec.capacity else None

            # 获取绑定信息
            claim = None
            if pv.spec.claim_ref:
                claim = f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}"

            pv_info = {
                "name": pv.metadata.name,
                "capacity": capacity,
                "access_modes": pv.spec.access_modes if pv.spec.access_modes else [],
                "reclaim_policy": pv.spec.persistent_volume_reclaim_policy,
                "status": pv.status.phase if pv.status else "Unknown",
                "claim": claim,
                "storage_class": pv.spec.storage_class_name,
                "volume_mode": pv.spec.volume_mode,
                "age": age,
                "labels": dict(pv.metadata.labels) if pv.metadata.labels else {}
            }
            pv_list.append(pv_info)

            return pv_list

        except Exception as e:
            logger.exception("获取持久卷列表失败: %s", e)
            return []


def get_pv_details(cluster: Cluster, pv_name: str) -> Optional[Dict[str, Any]]:
    """获取持久卷详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pv = core_v1.read_persistent_volume(pv_name)

        # 计算年龄
        age = calculate_age(pv.metadata.creation_timestamp)
        creation_timestamp = str(pv.metadata.creation_timestamp) if pv.metadata.creation_timestamp else "Unknown"

        # 获取容量
        capacity = pv.spec.capacity.get("storage") if pv.spec.capacity else None

        # 获取绑定信息
        claim = None
        if pv.spec.claim_ref:
            claim = {
                "namespace": pv.spec.claim_ref.namespace,
                "name": pv.spec.claim_ref.name
            }

            return {
                "name": pv.metadata.name,
                "capacity": capacity,
                "access_modes": pv.spec.access_modes if pv.spec.access_modes else [],
                "reclaim_policy": pv.spec.persistent_volume_reclaim_policy,
                "status": pv.status.phase if pv.status else "Unknown",
                "claim": claim,
                "storage_class": pv.spec.storage_class_name,
                "volume_mode": pv.spec.volume_mode,
                "age": age,
                "creation_timestamp": creation_timestamp,
                "labels": dict(pv.metadata.labels) if pv.metadata.labels else {},
                "annotations": dict(pv.metadata.annotations) if pv.metadata.annotations else {},
                "cluster_name": cluster.name,
                "cluster_id": cluster.id,
            }

        except Exception as e:
            logger.exception("获取持久卷详情失败: %s", e)
            return None


def create_pv(cluster: Cluster, pv_data: Dict[str, Any]) -> bool:
    """创建持久卷"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

        pv_spec = client.V1PersistentVolumeSpec(
            capacity={"storage": pv_data["capacity"]},
            access_modes=pv_data.get("access_modes", ["ReadWriteOnce"]),
            persistent_volume_reclaim_policy=pv_data.get("reclaim_policy", "Retain"),
            storage_class_name=pv_data.get("storage_class"),
            volume_mode=pv_data.get("volume_mode", "Filesystem")
        )

        pv = client.V1PersistentVolume(
            metadata=client.V1ObjectMeta(
                name=pv_data["name"],
                labels=pv_data.get("labels", {})
            ),
            spec=pv_spec
        )

            core_v1.create_persistent_volume(pv)
            return True

        except Exception as e:
            logger.exception("创建持久卷失败: %s", e)
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

        except Exception as e:
            logger.exception("删除持久卷失败: %s", e)
            return False


# ========== PersistentVolumeClaim 操作 ==========

def get_persistent_volume_claims(cluster: Cluster) -> List[Dict[str, Any]]:
    """获取所有持久卷声明"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvcs = core_v1.list_persistent_volume_claim_for_all_namespaces()

        pvc_list = []
        for pvc in pvcs.items:
            # 计算年龄
            age = calculate_age(pvc.metadata.creation_timestamp)

            # 获取状态
            status = pvc.status.phase if pvc.status else "Unknown"

            # 获取卷名
            volume = pvc.spec.volume_name

            # 获取容量
            capacity = None
            if pvc.status.capacity and 'storage' in pvc.status.capacity:
                capacity = pvc.status.capacity['storage']

            # 获取访问模式
            access_modes = pvc.spec.access_modes if pvc.spec.access_modes else []

            # 获取存储类
            storage_class = pvc.spec.storage_class_name

            # 获取卷模式
            volume_mode = pvc.spec.volume_mode if pvc.spec.volume_mode else "Filesystem"

            pvc_info = {
                "name": pvc.metadata.name,
                "namespace": pvc.metadata.namespace,
                "status": status,
                "volume": volume,
                "capacity": capacity,
                "access_modes": access_modes,
                "storage_class": storage_class,
                "volume_mode": volume_mode,
                "age": age
            }
            pvc_list.append(pvc_info)

            return pvc_list

        except Exception as e:
            logger.exception("获取持久卷声明列表失败: %s", e)
            return []


def get_namespace_pvcs(cluster: Cluster, namespace: str) -> List[Dict[str, Any]]:
    """获取命名空间中的持久卷声明"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return []

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvcs = core_v1.list_namespaced_persistent_volume_claim(namespace)

            pvc_list = []
            for pvc in pvcs.items:
                # 计算年龄
                age = calculate_age(pvc.metadata.creation_timestamp)

                # 获取状态
                status = pvc.status.phase if pvc.status else "Unknown"

                # 获取卷名
                volume = pvc.spec.volume_name

                # 获取容量
                capacity = None
                if pvc.status.capacity and "storage" in pvc.status.capacity:
                    capacity = pvc.status.capacity["storage"]

                # 获取访问模式
                access_modes = pvc.spec.access_modes if pvc.spec.access_modes else []

                # 获取存储类
                storage_class = pvc.spec.storage_class_name

                # 获取卷模式
                volume_mode = pvc.spec.volume_mode if pvc.spec.volume_mode else "Filesystem"

                pvc_info = {
                    "name": pvc.metadata.name,
                    "namespace": namespace,
                    "status": status,
                    "volume": volume,
                    "capacity": capacity,
                    "access_modes": access_modes,
                    "storage_class": storage_class,
                    "volume_mode": volume_mode,
                    "age": age,
                }
                pvc_list.append(pvc_info)

            return pvc_list

        except Exception as e:
            logger.exception("获取命名空间PVC失败: %s", e)
            return []


def get_pvc_details(cluster: Cluster, namespace: str, pvc_name: str) -> Optional[Dict[str, Any]]:
    """获取PVC详情"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return None

        try:
            core_v1 = client.CoreV1Api(client_instance)
            pvc = core_v1.read_namespaced_persistent_volume_claim(pvc_name, namespace)

        # 获取状态
        status = pvc.status.phase if pvc.status else "Unknown"

        # 获取卷名
        volume = pvc.spec.volume_name

        # 获取容量
        capacity = None
        if pvc.status.capacity and 'storage' in pvc.status.capacity:
            capacity = pvc.status.capacity['storage']

        # 获取访问模式
        access_modes = pvc.spec.access_modes if pvc.spec.access_modes else []

        # 获取存储类
        storage_class = pvc.spec.storage_class_name

        # 获取卷模式
        volume_mode = pvc.spec.volume_mode if pvc.spec.volume_mode else "Filesystem"

        # 计算年龄
        age = calculate_age(pvc.metadata.creation_timestamp)

            return {
                "name": pvc.metadata.name,
                "namespace": namespace,
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

        except Exception as e:
            logger.exception("获取PVC详情失败: %s", e)
            return None


def create_pvc(cluster: Cluster, pvc_data: dict) -> bool:
    """创建持久卷声明"""
    with KubernetesClientContext(cluster) as client_instance:
        if not client_instance:
            return False

        try:
            core_v1 = client.CoreV1Api(client_instance)

        # 构建PVC对象
        pvc_spec = client.V1PersistentVolumeClaimSpec(
            access_modes=pvc_data['access_modes'],
            storage_class_name=pvc_data.get('storage_class_name'),
            volume_mode=pvc_data.get('volume_mode', 'Filesystem'),
            resources=client.V1ResourceRequirements(requests=pvc_data['requests'])
        )

        pvc = client.V1PersistentVolumeClaim(
            metadata=client.V1ObjectMeta(name=pvc_data['name']),
            spec=pvc_spec
        )

            core_v1.create_namespaced_persistent_volume_claim(pvc_data['namespace'], pvc)
            return True

        except Exception as e:
            logger.exception("创建PVC失败: %s", e)
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

        except Exception as e:
            logger.exception("删除PVC失败: %s", e)
            return False


# ========== Volume文件操作（简化版本） ==========

def browse_volume_files(cluster: Cluster, pv_name: str, path: str) -> List[Dict[str, Any]]:
    """浏览卷内文件（简化的实现）"""
    # 这是一个简化的实现，实际的文件浏览需要通过Pod访问卷
    try:
        # 模拟的文件系统浏览
        if path == "/":
            return [
                {"name": "example.txt", "type": "file", "size": 1024, "modified_time": "2024-01-01 12:00:00"},
                {"name": "data", "type": "directory", "size": None, "modified_time": "2024-01-01 12:00:00"}
            ]
        elif path == "/data":
            return [
                {"name": "config.yaml", "type": "file", "size": 512, "modified_time": "2024-01-01 12:00:00"},
                {"name": "logs", "type": "directory", "size": None, "modified_time": "2024-01-01 12:00:00"}
            ]
        else:
            return []

    except Exception as e:
        logger.exception("浏览卷文件失败: %s", e)
        return []


def read_volume_file(cluster: Cluster, pv_name: str, file_path: str, max_lines: Optional[int] = None) -> Optional[str]:
    """读取卷内文件内容（简化的实现）"""
    # 这是一个简化的实现，实际的文件读取需要通过Pod访问卷
    try:
        # 模拟文件内容
        if file_path == "/example.txt":
            content = "This is an example file content.\nLine 2\nLine 3\n"
        elif file_path == "/data/config.yaml":
            content = "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n"
        else:
            content = "File not found or cannot be read."

        if max_lines:
            lines = content.split('\n')
            content = '\n'.join(lines[:max_lines])

        return content

    except Exception as e:
        logger.exception("读取卷文件失败: %s", e)
        return None
