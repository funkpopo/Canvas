from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
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