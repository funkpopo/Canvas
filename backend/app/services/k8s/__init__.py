"""
Kubernetes服务模块
提供所有Kubernetes资源操作的统一入口

该模块将原有的 k8s_client.py 拆分为多个子模块，按功能分类：
- client_pool: 连接池管理
- utils: 工具函数
- base_operations: 集群/节点基础操作
- namespace_operations: 命名空间操作
- pod_operations: Pod操作
- deployment_ops: Deployment操作
- service_operations: Service操作
- config_operations: ConfigMap和Secret操作
- storage_operations: 存储操作（StorageClass、PV、PVC）
- job_operations: Job操作
- workload_operations: 其他工作负载（StatefulSet、DaemonSet、CronJob）
- network_operations: 网络操作（NetworkPolicy、Ingress）
- quota_operations: 配额操作（ResourceQuota、LimitRange）
- rbac_operations: RBAC操作（Role、RoleBinding、ServiceAccount）
- policy_operations: 策略操作（HPA、PDB）
- monitoring_operations: 监控操作（Metrics）
- resource_watcher: 资源监听器
"""

# ========== 工具函数 ==========
from .utils import (
    calculate_age,
    parse_cpu,
    parse_memory,
    format_labels_selector,
    safe_dict,
    safe_list,
    format_timestamp,
)

# ========== 连接池管理 ==========
from .client_pool import (
    KubernetesClientPool,
    KubernetesClientContext,
    KubernetesOneOffClientContext,
    create_k8s_client,
    create_one_off_k8s_client,
    close_one_off_k8s_client,
    return_k8s_client,
    test_cluster_connection,
    get_client_pool,
    _client_pool,
)

# 兼容别名
get_k8s_client = create_k8s_client

# ========== 集群/节点基础操作 ==========
from .base_operations import (
    get_cluster_stats,
    get_nodes_info,
    get_node_details,
    get_cluster_events,
)

# ========== 命名空间操作 ==========
from .namespace_operations import (
    get_namespaces_info,
    get_mock_namespaces,
    create_namespace,
    delete_namespace,
    get_namespace_resources,
    get_namespace_crds,
)

# ========== Pod操作 ==========
from .pod_operations import (
    get_pods_info,
    get_pods_page,
    get_pod_details,
    get_pod_logs,
    restart_pod,
    delete_pod,
    batch_delete_pods,
    batch_restart_pods,
)

# ========== Deployment操作 ==========
from .deployment_ops import (
    get_namespace_deployments,
    get_deployments_page,
    get_deployment_details,
    get_deployment_pods,
    scale_deployment,
    restart_deployment,
    delete_deployment,
    get_deployment_services,
    update_deployment,
    get_deployment_yaml,
    update_deployment_yaml,
)

# ========== Service操作 ==========
from .service_operations import (
    get_namespace_services,
    get_services_page,
    get_service_details,
    create_service,
    update_service,
    delete_service,
    get_service_yaml,
    update_service_yaml,
)

# ========== ConfigMap和Secret操作 ==========
from .config_operations import (
    # ConfigMap
    get_namespace_configmaps,
    get_configmaps_page,
    get_configmap_details,
    create_configmap,
    update_configmap,
    delete_configmap,
    get_configmap_yaml,
    create_configmap_from_yaml,
    update_configmap_yaml,
    # Secret
    get_namespace_secrets,
    get_secrets_page,
    get_secret_details,
    create_secret,
    update_secret,
    delete_secret,
    get_secret_yaml,
    create_secret_yaml,
    update_secret_yaml,
)

# ========== 存储操作 ==========
from .storage_operations import (
    # StorageClass
    get_storage_classes,
    create_storage_class,
    delete_storage_class,
    # PersistentVolume
    get_persistent_volumes,
    get_pv_details,
    create_pv,
    delete_pv,
    # PersistentVolumeClaim
    get_persistent_volume_claims,
    get_namespace_pvcs,
    get_pvc_details,
    create_pvc,
    delete_pvc,
    # Volume文件操作
    browse_volume_files,
    read_volume_file,
)

# ========== Job操作 ==========
from .job_operations import (
    get_namespace_jobs,
    get_job_details,
    create_job,
    delete_job,
    restart_job,
    get_job_pods,
    get_job_yaml,
    update_job_yaml,
    monitor_job_status_changes,
)

# ========== 其他工作负载操作 ==========
from .workload_operations import (
    # StatefulSet
    get_namespace_statefulsets,
    get_statefulset_details,
    scale_statefulset,
    delete_statefulset,
    # DaemonSet
    get_namespace_daemonsets,
    get_daemonset_details,
    delete_daemonset,
    # CronJob
    get_namespace_cronjobs,
    get_cronjob_details,
    delete_cronjob,
)

# ========== 网络操作 ==========
from .network_operations import (
    # NetworkPolicy
    get_namespace_network_policies,
    get_network_policy_details,
    create_network_policy,
    update_network_policy,
    delete_network_policy,
    # Ingress
    get_namespace_ingresses,
    get_ingress_details,
    delete_ingress,
)

# ========== 配额操作 ==========
from .quota_operations import (
    # ResourceQuota
    get_namespace_resource_quotas,
    get_resource_quota_details,
    create_resource_quota,
    update_resource_quota,
    delete_resource_quota,
    # LimitRange
    get_namespace_limit_ranges,
    get_limit_range_details,
    delete_limit_range,
)

# ========== RBAC操作 ==========
from .rbac_operations import (
    # Role
    get_roles,
    get_role,
    delete_role,
    # RoleBinding
    get_role_bindings,
    get_role_binding,
    delete_role_binding,
    # ServiceAccount
    get_service_accounts,
    get_service_account,
    delete_service_account,
    # ClusterRole
    get_cluster_roles,
    get_cluster_role_bindings,
)

# ========== 策略操作 ==========
from .policy_operations import (
    # HPA
    get_namespace_hpas,
    get_hpa_details,
    delete_hpa,
    # PDB
    get_namespace_pdbs,
    get_pdb_details,
    delete_pdb,
)

# ========== 监控操作 ==========
from .monitoring_operations import (
    check_metrics_server_available,
    get_cluster_metrics,
    get_node_metrics,
    get_pod_metrics,
    get_namespace_metrics,
    install_metrics_server,
)

# ========== 资源监听器 ==========
from .resource_watcher import (
    KubernetesResourceWatcher,
    KubernetesWatcherManager,
    watcher_manager,
    start_watcher_async,
)


# 导出所有公共接口
__all__ = [
    # 工具函数
    'calculate_age',
    'parse_cpu',
    'parse_memory',
    'format_labels_selector',
    'safe_dict',
    'safe_list',
    'format_timestamp',

    # 连接池管理
    'KubernetesClientPool',
    'KubernetesClientContext',
    'KubernetesOneOffClientContext',
    'create_k8s_client',
    'create_one_off_k8s_client',
    'close_one_off_k8s_client',
    'return_k8s_client',
    'test_cluster_connection',
    'get_client_pool',
    '_client_pool',
    'get_k8s_client',

    # 集群/节点基础操作
    'get_cluster_stats',
    'get_nodes_info',
    'get_node_details',
    'get_cluster_events',

    # 命名空间操作
    'get_namespaces_info',
    'get_mock_namespaces',
    'create_namespace',
    'delete_namespace',
    'get_namespace_resources',
    'get_namespace_crds',

    # Pod操作
    'get_pods_info',
    'get_pod_details',
    'get_pod_logs',
    'restart_pod',
    'delete_pod',
    'batch_delete_pods',
    'batch_restart_pods',

    # Deployment操作
    'get_namespace_deployments',
    'get_deployments_page',
    'get_deployment_details',
    'get_deployment_pods',
    'scale_deployment',
    'restart_deployment',
    'delete_deployment',
    'get_deployment_services',
    'update_deployment',
    'get_deployment_yaml',
    'update_deployment_yaml',

    # Service操作
    'get_namespace_services',
    'get_services_page',
    'get_service_details',
    'create_service',
    'update_service',
    'delete_service',
    'get_service_yaml',
    'update_service_yaml',

    # ConfigMap操作
    'get_namespace_configmaps',
    'get_configmaps_page',
    'get_configmap_details',
    'create_configmap',
    'update_configmap',
    'delete_configmap',
    'get_configmap_yaml',
    'create_configmap_from_yaml',
    'update_configmap_yaml',

    # Secret操作
    'get_namespace_secrets',
    'get_secrets_page',
    'get_secret_details',
    'create_secret',
    'update_secret',
    'delete_secret',
    'get_secret_yaml',
    'create_secret_yaml',
    'update_secret_yaml',

    # 存储操作
    'get_storage_classes',
    'create_storage_class',
    'delete_storage_class',
    'get_persistent_volumes',
    'get_pv_details',
    'create_pv',
    'delete_pv',
    'get_persistent_volume_claims',
    'get_namespace_pvcs',
    'get_pvc_details',
    'create_pvc',
    'delete_pvc',
    'browse_volume_files',
    'read_volume_file',

    # Job操作
    'get_namespace_jobs',
    'get_job_details',
    'create_job',
    'delete_job',
    'restart_job',
    'get_job_pods',
    'get_job_yaml',
    'update_job_yaml',
    'monitor_job_status_changes',

    # 工作负载操作
    'get_namespace_statefulsets',
    'get_statefulset_details',
    'scale_statefulset',
    'delete_statefulset',
    'get_namespace_daemonsets',
    'get_daemonset_details',
    'delete_daemonset',
    'get_namespace_cronjobs',
    'get_cronjob_details',
    'delete_cronjob',

    # 网络操作
    'get_namespace_network_policies',
    'get_network_policy_details',
    'create_network_policy',
    'update_network_policy',
    'delete_network_policy',
    'get_namespace_ingresses',
    'get_ingress_details',
    'delete_ingress',

    # 配额操作
    'get_namespace_resource_quotas',
    'get_resource_quota_details',
    'create_resource_quota',
    'update_resource_quota',
    'delete_resource_quota',
    'get_namespace_limit_ranges',
    'get_limit_range_details',
    'delete_limit_range',

    # RBAC操作
    'get_roles',
    'get_role',
    'delete_role',
    'get_role_bindings',
    'get_role_binding',
    'delete_role_binding',
    'get_service_accounts',
    'get_service_account',
    'delete_service_account',
    'get_cluster_roles',
    'get_cluster_role_bindings',

    # 策略操作
    'get_namespace_hpas',
    'get_hpa_details',
    'delete_hpa',
    'get_namespace_pdbs',
    'get_pdb_details',
    'delete_pdb',

    # 监控操作
    'check_metrics_server_available',
    'get_cluster_metrics',
    'get_node_metrics',
    'get_pod_metrics',
    'get_namespace_metrics',
    'install_metrics_server',

    # 资源监听器
    'KubernetesResourceWatcher',
    'KubernetesWatcherManager',
    'watcher_manager',
    'start_watcher_async',
]
