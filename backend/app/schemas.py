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
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None  # 秒数


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    username: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class UserRegister(BaseModel):
    """用户自助注册（不允许指定role）"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: Optional[EmailStr] = None
    password: str = Field(..., min_length=6, description="密码至少6位")


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


# ========== 权限管理 Schemas ==========

class ClusterPermissionBase(BaseModel):
    cluster_id: int
    permission_level: str = Field(pattern="^(read|manage)$", description="权限等级：read（只读）或 manage（管理）")


class NamespacePermissionBase(BaseModel):
    cluster_id: int
    namespace: str
    permission_level: str = Field(pattern="^(read|manage)$", description="权限等级：read（只读）或 manage（管理）")


class ClusterPermissionResponse(ClusterPermissionBase):
    id: int
    user_id: int
    cluster_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NamespacePermissionResponse(NamespacePermissionBase):
    id: int
    user_id: int
    cluster_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserPermissionsResponse(BaseModel):
    user_id: int
    username: str
    role: str
    cluster_permissions: List[ClusterPermissionResponse]
    namespace_permissions: List[NamespacePermissionResponse]


class PermissionGrantRequest(BaseModel):
    permission_level: str = Field(pattern="^(read|manage)$", description="权限等级：read（只读）或 manage（管理）")


class ClusterPermissionGrantRequest(PermissionGrantRequest):
    cluster_id: int


class NamespacePermissionGrantRequest(PermissionGrantRequest):
    cluster_id: int
    namespace: str


class PermissionUpdateRequest(BaseModel):
    permission_level: str = Field(pattern="^(read|manage)$", description="权限等级：read（只读）或 manage（管理）")


# ========== 会话管理 Schemas ==========

class UserSessionResponse(BaseModel):
    id: int
    session_id: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_info: Optional[str] = None
    is_active: bool
    last_activity: datetime
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True


class UserSessionListResponse(BaseModel):
    total: int
    sessions: List[UserSessionResponse]


class SessionRevokeRequest(BaseModel):
    session_ids: List[str] = Field(..., description="要撤销的会话ID列表")


# ========== API密钥 Schemas ==========

class APIKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="API密钥名称")
    scopes: Optional[List[str]] = Field(default=None, description="权限范围")
    expires_at: Optional[datetime] = Field(default=None, description="过期时间")


class APIKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    scopes: Optional[str] = None
    is_active: bool
    last_used: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class APIKeyCreateResponse(BaseModel):
    """创建API密钥后的响应，包含完整密钥（仅显示一次）"""
    id: int
    name: str
    api_key: str  # 完整密钥，仅在创建时返回
    key_prefix: str
    scopes: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime


class APIKeyListResponse(BaseModel):
    total: int
    keys: List[APIKeyResponse]


# ========== RBAC权限 Schemas ==========

class PermissionBase(BaseModel):
    name: str
    resource: str
    action: str
    description: Optional[str] = None


class PermissionCreate(PermissionBase):
    pass


class PermissionResponse(PermissionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RoleBase(BaseModel):
    name: str
    display_name: str
    description: Optional[str] = None


class RoleCreate(RoleBase):
    permission_ids: Optional[List[int]] = Field(default=[], description="权限ID列表")


class RoleUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None


class RoleResponse(RoleBase):
    id: int
    is_system: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoleWithPermissionsResponse(RoleResponse):
    permissions: List[PermissionResponse]


class RoleListResponse(BaseModel):
    total: int
    roles: List[RoleResponse]


class UserRoleAssignment(BaseModel):
    role_ids: List[int] = Field(..., description="要分配的角色ID列表")