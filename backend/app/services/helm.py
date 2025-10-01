from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)


class HelmService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _bin(self) -> str:
        return self.settings.helm_binary

    async def _run(self, *args: str) -> tuple[int, str, str]:
        proc = await asyncio.create_subprocess_exec(
            self._bin(),
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out_b, err_b = await proc.communicate()
        out = out_b.decode("utf-8", errors="ignore") if out_b else ""
        err = err_b.decode("utf-8", errors="ignore") if err_b else ""
        return proc.returncode or 0, out, err

    async def list_releases(self, namespace: str | None = None) -> list[dict[str, Any]]:
        args = ["list", "-o", "json"]
        if namespace:
            args += ["-n", namespace]
        code, out, err = await self._run(*args)
        if code != 0:
            logger.warning("helm.list_releases_error", stderr=err)
            return []
        try:
            data = json.loads(out or "[]")
            if isinstance(data, list):
                return data
            return []
        except Exception:
            return []

    async def search_charts(self, query: str, source: str = "hub") -> list[dict[str, Any]]:
        args = ["search", source, query, "-o", "json"]
        code, out, err = await self._run(*args)
        if code != 0:
            logger.warning("helm.search_error", stderr=err)
            return []
        try:
            data = json.loads(out or "[]")
            if isinstance(data, list):
                return data
            return []
        except Exception:
            return []

    async def install(self, release: str, chart: str, namespace: str, values_yaml: str | None = None) -> tuple[bool, str | None]:
        import tempfile, os
        args = ["install", release, chart, "-n", namespace]
        path = None
        try:
            if values_yaml:
                fd, path = tempfile.mkstemp(prefix="canvas-helm-", suffix=".yaml")
                os.write(fd, values_yaml.encode("utf-8"))
                os.close(fd)
                args += ["-f", path]
            code, out, err = await self._run(*args)
            if code != 0:
                return False, err or out
            return True, None
        finally:
            if path:
                try:
                    os.remove(path)
                except Exception:
                    pass

    async def upgrade(self, release: str, chart: str, namespace: str, values_yaml: str | None = None) -> tuple[bool, str | None]:
        import tempfile, os
        args = ["upgrade", release, chart, "-n", namespace]
        path = None
        try:
            if values_yaml:
                fd, path = tempfile.mkstemp(prefix="canvas-helm-", suffix=".yaml")
                os.write(fd, values_yaml.encode("utf-8"))
                os.close(fd)
                args += ["-f", path]
            code, out, err = await self._run(*args)
            if code != 0:
                return False, err or out
            return True, None
        finally:
            if path:
                try:
                    os.remove(path)
                except Exception:
                    pass

    async def uninstall(self, release: str, namespace: str) -> tuple[bool, str | None]:
        args = ["uninstall", release, "-n", namespace]
        code, out, err = await self._run(*args)
        if code != 0:
            return False, err or out
        return True, None

