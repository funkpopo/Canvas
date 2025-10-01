from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration sourced from environment variables."""

    model_config = SettingsConfigDict(env_file=(".env",), env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    kube_context: str | None = None
    kube_config_path: str | None = Field(default=None, alias="KUBE_CONFIG_PATH")
    service_account_token_path: str | None = None
    cache_ttl_seconds: int = 30
    rate_limit_requests_per_minute: int = 120
    # Streaming and long-connection safety limits
    stream_max_concurrent_logs: int = 10
    stream_max_concurrent_exec: int = 4
    log_stream_max_seconds: int = 600
    exec_session_max_seconds: int = 1800
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    database_url: str = "sqlite+aiosqlite:///./canvas.db"
    # Optional Fernet key for encrypting sensitive fields (ClusterConfig)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    fernet_key: str | None = None

    @computed_field
    @property
    def is_debug(self) -> bool:
        return self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
