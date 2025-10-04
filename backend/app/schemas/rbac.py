from __future__ import annotations

from pydantic import BaseModel


class SubjectEntry(BaseModel):
    kind: str
    name: str
    namespace: str | None = None


class RoleEntry(BaseModel):
    namespace: str | None = None
    name: str
    rules: int | None = None


class RoleBindingEntry(BaseModel):
    namespace: str | None = None
    name: str
    role_kind: str
    role_name: str
    subjects: list[SubjectEntry]


class ClusterRoleEntry(BaseModel):
    name: str
    rules: int | None = None


class ClusterRoleBindingEntry(BaseModel):
    name: str
    role_name: str
    subjects: list[SubjectEntry]


class RbacSummary(BaseModel):
    roles: list[RoleEntry]
    role_bindings: list[RoleBindingEntry]
    cluster_roles: list[ClusterRoleEntry]
    cluster_role_bindings: list[ClusterRoleBindingEntry]

