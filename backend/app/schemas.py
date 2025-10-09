from pydantic import BaseModel
from typing import Optional


class UserBase(BaseModel):
    username: str


class UserCreate(UserBase):
    password: str


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