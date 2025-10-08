from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Access token TTL in seconds")


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    email: str | None = None
    roles: list[str] = []
    tenant_id: int | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class CreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    email: str | None = None
    roles: list[str] = Field(default_factory=list)
    tenant_slug: str | None = None


class ApiKeyCreateRequest(BaseModel):
    name: str
    scopes: list[str] = Field(default_factory=list)
    expires_days: int | None = None


class ApiKeyCreated(BaseModel):
    id: int
    key: str  # full token returned once
    name: str
    created_at: datetime


class ApiKeyInfo(BaseModel):
    id: int
    name: str
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    email: str | None = None
    tenant_slug: str | None = None


class RoleInfo(BaseModel):
    id: int
    name: str


class UpdateUserRequest(BaseModel):
    is_active: bool | None = None
    roles: list[str] | None = None


class SessionInfo(BaseModel):
    id: int
    jti: str
    created_at: datetime
    expires_at: datetime
    revoked: bool

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminSetPasswordRequest(BaseModel):
    new_password: str
