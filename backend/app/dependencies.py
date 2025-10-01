from functools import lru_cache

from app.config import get_settings
from app.db import get_session_factory
from app.services.cluster_config import ClusterConfigService
from app.services.kube_client import KubernetesService
from app.services.resources.config import ConfigMapService, SecretService


@lru_cache(maxsize=1)
def get_cluster_config_service() -> ClusterConfigService:
    return ClusterConfigService(get_session_factory())


@lru_cache(maxsize=1)
def _get_kubernetes_service() -> KubernetesService:
    return KubernetesService(get_settings(), get_cluster_config_service())


def get_kubernetes_service() -> KubernetesService:
    return _get_kubernetes_service()


def provide_cluster_config_service() -> ClusterConfigService:
    return get_cluster_config_service()


# Sub-services (gradual split by domain)
@lru_cache(maxsize=1)
def get_configmap_service() -> ConfigMapService:
    return ConfigMapService(get_kubernetes_service())


@lru_cache(maxsize=1)
def get_secret_service() -> SecretService:
    return SecretService(get_kubernetes_service())
