from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    role: Optional[str] = "user"


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="密码至少6位")
    role: str = Field(default="user", pattern="^(admin|user|viewer)$")


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[str] = Field(None, pattern="^(admin|user|viewer)$")
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6, description="密码至少6位")


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    total: int
    users: List[UserResponse]


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, description="新密码至少6位")


class User(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class ClusterBase(BaseModel):
    name: str
    endpoint: str
    auth_type: str  # 'kubeconfig' or 'token'
    is_active: Optional[bool] = True


class ClusterCreate(ClusterBase):
    kubeconfig_content: Optional[str] = None
    token: Optional[str] = None
    ca_cert: Optional[str] = None


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    endpoint: Optional[str] = None
    auth_type: Optional[str] = None
    kubeconfig_content: Optional[str] = None
    token: Optional[str] = None
    ca_cert: Optional[str] = None
    is_active: Optional[bool] = None


class ClusterResponse(ClusterBase):
    id: int
    kubeconfig_content: Optional[str] = None
    token: Optional[str] = None
    ca_cert: Optional[str] = None

    class Config:
        from_attributes = True


# Audit Log Schemas
class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    username: Optional[str] = None
    cluster_id: int
    cluster_name: Optional[str] = None
    action: str
    resource_type: str
    resource_name: str
    details: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    total: int
    logs: List[AuditLogResponse]


class AuditLogFilter(BaseModel):
    user_id: Optional[int] = None
    cluster_id: Optional[int] = None
    action: Optional[str] = None
    resource_type: Optional[str] = None
    success: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)