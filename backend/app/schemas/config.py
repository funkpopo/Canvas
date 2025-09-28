from datetime import datetime

from pydantic import AnyHttpUrl, BaseModel, Field, SecretStr, model_validator


class ClusterConfigPayload(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    api_server: AnyHttpUrl | None = None
    namespace: str | None = Field(default=None, max_length=128)
    context: str | None = Field(default=None, max_length=128)
    kubeconfig: str | None = None
    token: SecretStr | None = None
    certificate_authority_data: str | None = None
    insecure_skip_tls_verify: bool = False

    @model_validator(mode="after")
    def validate_source(self) -> "ClusterConfigPayload":
        if not self.kubeconfig and not self.api_server:
            raise ValueError("kubeconfig or api_server must be provided")
        return self


class ClusterConfigResponse(BaseModel):
    id: int
    name: str
    api_server: AnyHttpUrl | None = None
    namespace: str | None = None
    context: str | None = None
    kubeconfig_present: bool
    token_present: bool
    certificate_authority_data_present: bool
    insecure_skip_tls_verify: bool
    created_at: datetime
    updated_at: datetime


class ClusterConfigDetail(ClusterConfigResponse):
    kubeconfig: str | None = None
    token: str | None = None
    certificate_authority_data: str | None = None
