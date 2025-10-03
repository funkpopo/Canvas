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
    # Auth/JWT settings
    jwt_secret: str = Field(default="changeme-in-prod", description="Secret key for signing JWTs")
    jwt_algorithm: str = Field(default="HS256", description="JWT signing algorithm")
    access_token_exp_minutes: int = Field(default=60, description="Access token expiration in minutes")
    refresh_token_exp_days: int = Field(default=30, description="Refresh token expiration in days")
    # Optional Fernet key for encrypting sensitive fields (ClusterConfig)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    fernet_key: str | None = None
    # PVC browser pod configuration
    pvc_browser_image: str = Field(default="busybox:1.36", description="Image for the ephemeral PVC browser pod")
    pvc_browser_container_name: str = Field(default="sh", description="Container name for the PVC browser pod")
    # Optional Helm integration (server-side). Disabled by default.
    helm_enabled: bool = Field(default=False, description="Enable server-side Helm CLI integration")
    helm_binary: str = Field(default="helm", description="Path to Helm binary")

    @computed_field
    @property
    def is_debug(self) -> bool:
        return self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
