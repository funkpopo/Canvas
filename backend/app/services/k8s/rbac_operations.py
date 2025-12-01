"""
Kubernetes RBAC操作模块
提供Role、RoleBinding、ServiceAccount的操作功能
"""

from typing import Dict, Any, Optional, List

from kubernetes import client
from kubernetes.client.rest import ApiException

from ...models import Cluster
from ...core.logging import get_logger
from .client_pool import create_k8s_client, get_client_pool


logger = get_logger(__name__)
_client_pool = get_client_pool()


# ========== Role 操作 ==========

def get_roles(cluster: Cluster, namespace: str = None):
    """获取Roles列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)

        if namespace:
            roles_list = rbac_v1.list_namespaced_role(namespace)
        else:
            roles_list = rbac_v1.list_role_for_all_namespaces()

        roles = []
        for role in roles_list.items:
            roles.append({
                "name": role.metadata.name,
                "namespace": role.metadata.namespace,
                "labels": role.metadata.labels or {},
                "annotations": role.metadata.annotations or {},
                "rules": [
                    {
                        "api_groups": rule.api_groups or [],
                        "resources": rule.resources or [],
                        "verbs": rule.verbs or [],
                        "resource_names": rule.resource_names or []
                    }
                    for rule in role.rules
                ],
                "creation_timestamp": role.metadata.creation_timestamp.isoformat() if role.metadata.creation_timestamp else None
            })

        return roles
    except ApiException as e:
        logger.warning("获取Roles失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_role(cluster: Cluster, namespace: str, name: str):
    """获取单个Role详情"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        role = rbac_v1.read_namespaced_role(name, namespace)

        return {
            "name": role.metadata.name,
            "namespace": role.metadata.namespace,
            "labels": role.metadata.labels or {},
            "annotations": role.metadata.annotations or {},
            "rules": [
                {
                    "api_groups": rule.api_groups or [],
                    "resources": rule.resources or [],
                    "verbs": rule.verbs or [],
                    "resource_names": rule.resource_names or []
                }
                for rule in role.rules
            ],
            "creation_timestamp": role.metadata.creation_timestamp.isoformat() if role.metadata.creation_timestamp else None
        }
    except ApiException as e:
        logger.warning("获取Role失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def delete_role(cluster: Cluster, namespace: str, name: str):
    """删除Role"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return False

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        rbac_v1.delete_namespaced_role(name, namespace)
        return True
    except ApiException as e:
        logger.warning("删除Role失败: %s", e)
        return False
    finally:
        _client_pool.return_client(cluster, api_client)


# ========== RoleBinding 操作 ==========

def get_role_bindings(cluster: Cluster, namespace: str = None):
    """获取RoleBindings列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)

        if namespace:
            bindings_list = rbac_v1.list_namespaced_role_binding(namespace)
        else:
            bindings_list = rbac_v1.list_role_binding_for_all_namespaces()

        bindings = []
        for binding in bindings_list.items:
            bindings.append({
                "name": binding.metadata.name,
                "namespace": binding.metadata.namespace,
                "labels": binding.metadata.labels or {},
                "annotations": binding.metadata.annotations or {},
                "role_ref": {
                    "api_group": binding.role_ref.api_group,
                    "kind": binding.role_ref.kind,
                    "name": binding.role_ref.name
                },
                "subjects": [
                    {
                        "kind": subject.kind,
                        "name": subject.name,
                        "namespace": subject.namespace if hasattr(subject, 'namespace') else None,
                        "api_group": subject.api_group if hasattr(subject, 'api_group') else None
                    }
                    for subject in (binding.subjects or [])
                ],
                "creation_timestamp": binding.metadata.creation_timestamp.isoformat() if binding.metadata.creation_timestamp else None
            })

        return bindings
    except ApiException as e:
        logger.warning("获取RoleBindings失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_role_binding(cluster: Cluster, namespace: str, name: str):
    """获取单个RoleBinding详情"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        binding = rbac_v1.read_namespaced_role_binding(name, namespace)

        return {
            "name": binding.metadata.name,
            "namespace": binding.metadata.namespace,
            "labels": binding.metadata.labels or {},
            "annotations": binding.metadata.annotations or {},
            "role_ref": {
                "api_group": binding.role_ref.api_group,
                "kind": binding.role_ref.kind,
                "name": binding.role_ref.name
            },
            "subjects": [
                {
                    "kind": subject.kind,
                    "name": subject.name,
                    "namespace": subject.namespace if hasattr(subject, 'namespace') else None,
                    "api_group": subject.api_group if hasattr(subject, 'api_group') else None
                }
                for subject in (binding.subjects or [])
            ],
            "creation_timestamp": binding.metadata.creation_timestamp.isoformat() if binding.metadata.creation_timestamp else None
        }
    except ApiException as e:
        logger.warning("获取RoleBinding失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def delete_role_binding(cluster: Cluster, namespace: str, name: str):
    """删除RoleBinding"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return False

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        rbac_v1.delete_namespaced_role_binding(name, namespace)
        return True
    except ApiException as e:
        logger.warning("删除RoleBinding失败: %s", e)
        return False
    finally:
        _client_pool.return_client(cluster, api_client)


# ========== ServiceAccount 操作 ==========

def get_service_accounts(cluster: Cluster, namespace: str = None):
    """获取ServiceAccounts列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        core_v1 = client.CoreV1Api(api_client)

        if namespace:
            sa_list = core_v1.list_namespaced_service_account(namespace)
        else:
            sa_list = core_v1.list_service_account_for_all_namespaces()

        service_accounts = []
        for sa in sa_list.items:
            service_accounts.append({
                "name": sa.metadata.name,
                "namespace": sa.metadata.namespace,
                "labels": sa.metadata.labels or {},
                "annotations": sa.metadata.annotations or {},
                "secrets": [secret.name for secret in (sa.secrets or [])],
                "creation_timestamp": sa.metadata.creation_timestamp.isoformat() if sa.metadata.creation_timestamp else None
            })

        return service_accounts
    except ApiException as e:
        logger.warning("获取ServiceAccounts失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_service_account(cluster: Cluster, namespace: str, name: str):
    """获取单个ServiceAccount详情"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        core_v1 = client.CoreV1Api(api_client)
        sa = core_v1.read_namespaced_service_account(name, namespace)

        return {
            "name": sa.metadata.name,
            "namespace": sa.metadata.namespace,
            "labels": sa.metadata.labels or {},
            "annotations": sa.metadata.annotations or {},
            "secrets": [secret.name for secret in (sa.secrets or [])],
            "image_pull_secrets": [secret.name for secret in (sa.image_pull_secrets or [])],
            "creation_timestamp": sa.metadata.creation_timestamp.isoformat() if sa.metadata.creation_timestamp else None
        }
    except ApiException as e:
        logger.warning("获取ServiceAccount失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def delete_service_account(cluster: Cluster, namespace: str, name: str):
    """删除ServiceAccount"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return False

    try:
        core_v1 = client.CoreV1Api(api_client)
        core_v1.delete_namespaced_service_account(name, namespace)
        return True
    except ApiException as e:
        logger.warning("删除ServiceAccount失败: %s", e)
        return False
    finally:
        _client_pool.return_client(cluster, api_client)


# ========== ClusterRole 和 ClusterRoleBinding 操作 ==========

def get_cluster_roles(cluster: Cluster):
    """获取ClusterRoles列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        roles_list = rbac_v1.list_cluster_role()

        roles = []
        for role in roles_list.items:
            roles.append({
                "name": role.metadata.name,
                "labels": role.metadata.labels or {},
                "annotations": role.metadata.annotations or {},
                "rules": [
                    {
                        "api_groups": rule.api_groups or [],
                        "resources": rule.resources or [],
                        "verbs": rule.verbs or [],
                        "resource_names": rule.resource_names or []
                    }
                    for rule in (role.rules or [])
                ],
                "creation_timestamp": role.metadata.creation_timestamp.isoformat() if role.metadata.creation_timestamp else None
            })

        return roles
    except ApiException as e:
        logger.warning("获取ClusterRoles失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)


def get_cluster_role_bindings(cluster: Cluster):
    """获取ClusterRoleBindings列表"""
    api_client = _client_pool.get_client(cluster)
    if not api_client:
        return None

    try:
        rbac_v1 = client.RbacAuthorizationV1Api(api_client)
        bindings_list = rbac_v1.list_cluster_role_binding()

        bindings = []
        for binding in bindings_list.items:
            bindings.append({
                "name": binding.metadata.name,
                "labels": binding.metadata.labels or {},
                "annotations": binding.metadata.annotations or {},
                "role_ref": {
                    "api_group": binding.role_ref.api_group,
                    "kind": binding.role_ref.kind,
                    "name": binding.role_ref.name
                },
                "subjects": [
                    {
                        "kind": subject.kind,
                        "name": subject.name,
                        "namespace": subject.namespace if hasattr(subject, 'namespace') else None,
                        "api_group": subject.api_group if hasattr(subject, 'api_group') else None
                    }
                    for subject in (binding.subjects or [])
                ],
                "creation_timestamp": binding.metadata.creation_timestamp.isoformat() if binding.metadata.creation_timestamp else None
            })

        return bindings
    except ApiException as e:
        logger.warning("获取ClusterRoleBindings失败: %s", e)
        return None
    finally:
        _client_pool.return_client(cluster, api_client)
