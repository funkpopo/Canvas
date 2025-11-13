from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from passlib.context import CryptContext
from .database import Base

pwd_context = CryptContext(schemes=["scrypt", "bcrypt"], deprecated="auto")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    role = Column(String, default="user", nullable=False)  # admin, user, viewer
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def verify_password(self, plain_password: str) -> bool:
        return pwd_context.verify(plain_password, self.hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)


class RefreshToken(Base):
    """刷新令牌表"""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_revoked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User")

    __table_args__ = (
        Index("idx_user_token", "user_id", "token"),
        Index("idx_expires_at", "expires_at"),
    )


class UserSession(Base):
    """用户会话表"""
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(String, unique=True, index=True, nullable=False)
    refresh_token_id = Column(Integer, ForeignKey("refresh_tokens.id"), nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    device_info = Column(Text, nullable=True)  # JSON格式存储设备信息
    is_active = Column(Boolean, default=True)
    last_activity = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    user = relationship("User")
    refresh_token = relationship("RefreshToken")

    __table_args__ = (
        Index("idx_user_session", "user_id", "session_id"),
        Index("idx_active_sessions", "user_id", "is_active"),
    )


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    endpoint = Column(String, nullable=False)
    auth_type = Column(String, nullable=False)  # 'kubeconfig' or 'token'
    kubeconfig_content = Column(Text, nullable=True)  # For kubeconfig auth
    token = Column(String, nullable=True)  # For token auth
    ca_cert = Column(Text, nullable=True)  # CA certificate content
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    action = Column(String, nullable=False)  # 'volume_browse', 'volume_read', 'pod_exec', etc.
    resource_type = Column(String, nullable=False)  # 'persistentvolume', 'pod', etc.
    resource_name = Column(String, nullable=False)
    details = Column(Text, nullable=True)  # JSON string with additional details
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")
    cluster = relationship("Cluster")

    __table_args__ = (
        Index("idx_audit_user_created", "user_id", "created_at"),
        Index("idx_audit_cluster_created", "cluster_id", "created_at"),
        Index("idx_audit_resource", "resource_type", "resource_name"),
    )


class JobTemplate(Base):
    __tablename__ = "job_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True, index=True)  # 分类，如：数据处理、备份、测试等
    yaml_content = Column(Text, nullable=False)  # Job的YAML配置
    is_public = Column(Boolean, default=True)  # 是否公开模板
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    creator = relationship("User")


class JobHistory(Base):
    __tablename__ = "job_history"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    namespace = Column(String, nullable=False)
    job_name = Column(String, nullable=False)
    template_id = Column(Integer, ForeignKey("job_templates.id"), nullable=True)  # 如果是从模板创建的
    status = Column(String, nullable=False)  # Pending, Running, Succeeded, Failed
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration = Column(Integer, nullable=True)  # 执行时长（秒）
    succeeded_pods = Column(Integer, default=0)
    failed_pods = Column(Integer, default=0)
    total_pods = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    cluster = relationship("Cluster")
    template = relationship("JobTemplate")
    creator = relationship("User")

    __table_args__ = (
        Index("idx_jobhistory_cluster_status", "cluster_id", "status"),
        Index("idx_jobhistory_created", "created_at"),
    )


class APIKey(Base):
    """API密钥表（用于程序调用）"""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)  # API密钥名称，方便识别
    key_hash = Column(String, unique=True, index=True, nullable=False)  # 密钥哈希值
    key_prefix = Column(String, nullable=False)  # 密钥前缀，用于显示
    scopes = Column(Text, nullable=True)  # JSON格式存储权限范围
    is_active = Column(Boolean, default=True)
    last_used = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")

    __table_args__ = (
        Index("idx_user_keys", "user_id", "is_active"),
    )


class Permission(Base):
    """权限表（用于RBAC）"""
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)  # 权限名称，如：cluster.read, pod.create
    resource = Column(String, nullable=False)  # 资源类型，如：cluster, pod, deployment
    action = Column(String, nullable=False)  # 操作类型，如：read, create, update, delete
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Role(Base):
    """角色表（扩展RBAC）"""
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False)  # 系统内置角色不可删除
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RolePermission(Base):
    """角色权限关联表"""
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    permission_id = Column(Integer, ForeignKey("permissions.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    role = relationship("Role")
    permission = relationship("Permission")

    __table_args__ = (
        Index("idx_role_permission", "role_id", "permission_id", unique=True),
    )


class UserRole(Base):
    """用户角色关联表"""
    __tablename__ = "user_roles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")
    role = relationship("Role")

    __table_args__ = (
        Index("idx_user_role", "user_id", "role_id", unique=True),
    )


class UserClusterPermission(Base):
    """用户集群权限"""
    __tablename__ = "user_cluster_permissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    permission_level = Column(String, nullable=False)  # 'read' or 'manage'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")
    cluster = relationship("Cluster")

    __table_args__ = (
        {"schema": None},  # 确保没有schema前缀
    )


class UserNamespacePermission(Base):
    """用户命名空间权限"""
    __tablename__ = "user_namespace_permissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    namespace = Column(String, nullable=False)
    permission_level = Column(String, nullable=False)  # 'read' or 'manage'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")
    cluster = relationship("Cluster")

    __table_args__ = (
        {"schema": None},  # 确保没有schema前缀
    )


class AlertRule(Base):
    """告警规则表"""
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    rule_type = Column(String, nullable=False)  # resource_usage, pod_restart, node_unavailable
    severity = Column(String, nullable=False, default="warning")  # info, warning, critical
    enabled = Column(Boolean, default=True)
    threshold_config = Column(Text, nullable=False)  # JSON格式存储阈值配置
    notification_channels = Column(Text, nullable=True)  # JSON格式存储通知渠道
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    cluster = relationship("Cluster")
    creator = relationship("User")

    __table_args__ = (
        Index("idx_cluster_enabled", "cluster_id", "enabled"),
    )


class AlertEvent(Base):
    """告警事件表"""
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id"), nullable=False)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    resource_type = Column(String, nullable=False)  # node, pod, namespace
    resource_name = Column(String, nullable=False)
    namespace = Column(String, nullable=True)
    severity = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    details = Column(Text, nullable=True)  # JSON格式存储详细信息
    status = Column(String, nullable=False, default="firing")  # firing, resolved
    first_triggered_at = Column(DateTime(timezone=True), server_default=func.now())
    last_triggered_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    notification_sent = Column(Boolean, default=False)

    # Relationships
    rule = relationship("AlertRule")
    cluster = relationship("Cluster")

    __table_args__ = (
        Index("idx_status_cluster", "status", "cluster_id"),
        Index("idx_rule_status", "rule_id", "status"),
    )