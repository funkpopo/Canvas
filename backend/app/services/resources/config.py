from __future__ import annotations

import asyncio
from typing import Any

import structlog
import yaml
from kubernetes import client
from kubernetes.client import ApiClient

from app.services.kube_client import KubernetesService


logger = structlog.get_logger(__name__)


class ConfigMapService:
    def __init__(self, kube: KubernetesService) -> None:
        self._kube = kube

    async def list_configmaps(self, namespace: str | None = None) -> list[dict[str, object]]:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _collect() -> list[dict[str, object]]:
                items = (
                    core_v1.list_namespaced_config_map(namespace=namespace, limit=1000).items
                    if namespace
                    else core_v1.list_config_map_for_all_namespaces(limit=1000).items
                )
                results: list[dict[str, object]] = []
                for cm in items:
                    md = getattr(cm, "metadata", None)
                    ns = getattr(md, "namespace", None) or "default"
                    nm = getattr(md, "name", None) or ""
                    results.append({
                        "namespace": str(ns),
                        "name": str(nm),
                        "created_at": getattr(md, "creation_timestamp", None),
                    })
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:
            logger.warning("config.list_configmaps_error", error=str(exc))
            return []

    async def get_configmap_yaml(self, namespace: str, name: str) -> str | None:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _do() -> str:
                obj = core_v1.read_namespaced_config_map(name=name, namespace=namespace)
                api_client = self._kube._api_client or ApiClient()
                data: dict[str, Any] = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("config.get_configmap_yaml_error", error=str(exc))
            return None

    async def apply_configmap_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "ConfigMap":
                    raise RuntimeError("YAML kind must be ConfigMap")
                core_v1.patch_namespaced_config_map(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("config.apply_configmap_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_configmap(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _do() -> None:
                core_v1.delete_namespaced_config_map(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("config.delete_configmap_error", error=str(exc))
            return False, str(exc)


class SecretService:
    def __init__(self, kube: KubernetesService) -> None:
        self._kube = kube

    async def list_secrets(self, namespace: str | None = None) -> list[dict[str, object]]:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _collect() -> list[dict[str, object]]:
                items = (
                    core_v1.list_namespaced_secret(namespace=namespace, limit=1000).items
                    if namespace
                    else core_v1.list_secret_for_all_namespaces(limit=1000).items
                )
                results: list[dict[str, object]] = []
                for sec in items:
                    md = getattr(sec, "metadata", None)
                    ns = getattr(md, "namespace", None) or "default"
                    nm = getattr(md, "name", None) or ""
                    sec_type = getattr(sec, "type", None)
                    results.append({
                        "namespace": str(ns),
                        "name": str(nm),
                        "type": sec_type,
                        "created_at": getattr(md, "creation_timestamp", None),
                    })
                return results

            return await asyncio.to_thread(_collect)
        except Exception as exc:
            logger.warning("config.list_secrets_error", error=str(exc))
            return []

    async def get_secret_yaml(self, namespace: str, name: str) -> str | None:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _do() -> str:
                obj = core_v1.read_namespaced_secret(name=name, namespace=namespace)
                api_client = self._kube._api_client or ApiClient()
                data: dict[str, Any] = api_client.sanitize_for_serialization(obj)
                md = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(md, dict) and "managedFields" in md:
                    md.pop("managedFields", None)
                return yaml.safe_dump(data, sort_keys=False)

            return await asyncio.to_thread(_do)
        except Exception as exc:
            logger.warning("config.get_secret_yaml_error", error=str(exc))
            return None

    async def apply_secret_yaml(self, namespace: str, name: str, yaml_text: str) -> tuple[bool, str | None]:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _do() -> None:
                body = yaml.safe_load(yaml_text) or {}
                if not isinstance(body, dict) or str(body.get("kind")) != "Secret":
                    raise RuntimeError("YAML kind must be Secret")
                core_v1.patch_namespaced_secret(name=name, namespace=namespace, body=body)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("config.apply_secret_yaml_error", error=str(exc))
            return False, str(exc)

    async def delete_secret(self, namespace: str, name: str) -> tuple[bool, str | None]:
        await self._kube._rate_limiter.acquire()
        try:
            core_v1, _ = await self._kube._ensure_clients()

            def _do() -> None:
                core_v1.delete_namespaced_secret(name=name, namespace=namespace)

            await asyncio.to_thread(_do)
            return True, None
        except Exception as exc:
            logger.warning("config.delete_secret_error", error=str(exc))
            return False, str(exc)

