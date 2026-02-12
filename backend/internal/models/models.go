package models

import "time"

// User maps to the existing users table.
type User struct {
	ID             uint       `gorm:"primaryKey;column:id" json:"id"`
	Username       string     `gorm:"column:username;uniqueIndex;not null" json:"username"`
	HashedPassword string     `gorm:"column:hashed_password;not null" json:"-"`
	Email          *string    `gorm:"column:email;uniqueIndex" json:"email,omitempty"`
	Role           string     `gorm:"column:role;not null" json:"role"`
	IsActive       bool       `gorm:"column:is_active;not null" json:"is_active"`
	LastLogin      *time.Time `gorm:"column:last_login" json:"last_login,omitempty"`
	CreatedAt      time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt      *time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at,omitempty"`
	IsDeleted      bool       `gorm:"column:is_deleted;default:false;index" json:"-"`
	DeletedAt      *time.Time `gorm:"column:deleted_at" json:"-"`
	DeletedBy      *uint      `gorm:"column:deleted_by" json:"-"`
}

func (User) TableName() string {
	return "users"
}

// RefreshToken maps to refresh_tokens table.
type RefreshToken struct {
	ID        uint       `gorm:"primaryKey;column:id"`
	UserID    uint       `gorm:"column:user_id;index;not null"`
	Token     string     `gorm:"column:token;uniqueIndex;not null"`
	ExpiresAt time.Time  `gorm:"column:expires_at;index;not null"`
	IsRevoked bool       `gorm:"column:is_revoked;default:false"`
	CreatedAt time.Time  `gorm:"column:created_at;autoCreateTime"`
	RevokedAt *time.Time `gorm:"column:revoked_at"`
}

func (RefreshToken) TableName() string {
	return "refresh_tokens"
}

// Cluster maps to clusters table.
type Cluster struct {
	ID                uint       `gorm:"primaryKey;column:id" json:"id"`
	Name              string     `gorm:"column:name;uniqueIndex;not null" json:"name"`
	Endpoint          string     `gorm:"column:endpoint;not null" json:"endpoint"`
	AuthType          string     `gorm:"column:auth_type;not null" json:"auth_type"`
	KubeconfigContent *string    `gorm:"column:kubeconfig_content" json:"kubeconfig_content,omitempty"`
	Token             *string    `gorm:"column:token" json:"token,omitempty"`
	CACert            *string    `gorm:"column:ca_cert" json:"ca_cert,omitempty"`
	IsActive          bool       `gorm:"column:is_active;default:true" json:"is_active"`
	CreatedAt         time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt         *time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at,omitempty"`
	IsDeleted         bool       `gorm:"column:is_deleted;default:false;index" json:"-"`
	DeletedAt         *time.Time `gorm:"column:deleted_at" json:"-"`
	DeletedBy         *uint      `gorm:"column:deleted_by" json:"-"`
}

func (Cluster) TableName() string {
	return "clusters"
}

type AuditLog struct {
	ID           uint       `gorm:"primaryKey;column:id"`
	UserID       uint       `gorm:"column:user_id;index;not null"`
	ClusterID    uint       `gorm:"column:cluster_id;index;not null"`
	Action       string     `gorm:"column:action;not null"`
	ResourceType string     `gorm:"column:resource_type;not null"`
	ResourceName string     `gorm:"column:resource_name;not null"`
	Details      *string    `gorm:"column:details"`
	IPAddress    *string    `gorm:"column:ip_address"`
	UserAgent    *string    `gorm:"column:user_agent"`
	Success      bool       `gorm:"column:success;default:true"`
	ErrorMessage *string    `gorm:"column:error_message"`
	CreatedAt    time.Time  `gorm:"column:created_at;autoCreateTime"`
	IsArchived   bool       `gorm:"column:is_archived;default:false;index"`
	ArchivedAt   *time.Time `gorm:"column:archived_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

type UserClusterPermission struct {
	ID              uint       `gorm:"primaryKey;column:id"`
	UserID          uint       `gorm:"column:user_id;index;not null"`
	ClusterID       uint       `gorm:"column:cluster_id;index;not null"`
	PermissionLevel string     `gorm:"column:permission_level;not null"`
	CreatedAt       time.Time  `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       *time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (UserClusterPermission) TableName() string {
	return "user_cluster_permissions"
}

type UserNamespacePermission struct {
	ID              uint       `gorm:"primaryKey;column:id"`
	UserID          uint       `gorm:"column:user_id;index;not null"`
	ClusterID       uint       `gorm:"column:cluster_id;index;not null"`
	Namespace       string     `gorm:"column:namespace;not null"`
	PermissionLevel string     `gorm:"column:permission_level;not null"`
	CreatedAt       time.Time  `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       *time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (UserNamespacePermission) TableName() string {
	return "user_namespace_permissions"
}

type JobTemplate struct {
	ID          uint       `gorm:"primaryKey;column:id" json:"id"`
	Name        string     `gorm:"column:name;not null;index" json:"name"`
	Description *string    `gorm:"column:description" json:"description,omitempty"`
	Category    *string    `gorm:"column:category;index" json:"category,omitempty"`
	YAMLContent string     `gorm:"column:yaml_content;not null" json:"yaml_content"`
	IsPublic    bool       `gorm:"column:is_public;default:true" json:"is_public"`
	CreatedBy   uint       `gorm:"column:created_by;not null;index" json:"created_by"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at,omitempty"`
	IsDeleted   bool       `gorm:"column:is_deleted;default:false;index" json:"-"`
	DeletedAt   *time.Time `gorm:"column:deleted_at" json:"-"`
	DeletedBy   *uint      `gorm:"column:deleted_by" json:"-"`
}

func (JobTemplate) TableName() string {
	return "job_templates"
}

type JobHistory struct {
	ID            uint       `gorm:"primaryKey;column:id" json:"id"`
	ClusterID     uint       `gorm:"column:cluster_id;not null;index" json:"cluster_id"`
	Namespace     string     `gorm:"column:namespace;not null" json:"namespace"`
	JobName       string     `gorm:"column:job_name;not null" json:"job_name"`
	TemplateID    *uint      `gorm:"column:template_id;index" json:"template_id,omitempty"`
	Status        string     `gorm:"column:status;not null;index" json:"status"`
	StartTime     *time.Time `gorm:"column:start_time" json:"start_time,omitempty"`
	EndTime       *time.Time `gorm:"column:end_time" json:"end_time,omitempty"`
	Duration      *int       `gorm:"column:duration" json:"duration,omitempty"`
	SucceededPods int        `gorm:"column:succeeded_pods;default:0" json:"succeeded_pods"`
	FailedPods    int        `gorm:"column:failed_pods;default:0" json:"failed_pods"`
	TotalPods     int        `gorm:"column:total_pods;default:0" json:"total_pods"`
	ErrorMessage  *string    `gorm:"column:error_message" json:"error_message,omitempty"`
	CreatedBy     uint       `gorm:"column:created_by;not null;index" json:"created_by"`
	CreatedAt     time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt     *time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at,omitempty"`
}

func (JobHistory) TableName() string {
	return "job_history"
}

type AlertRule struct {
	ID                   uint       `gorm:"primaryKey;column:id" json:"id"`
	Name                 string     `gorm:"column:name;not null" json:"name"`
	ClusterID            uint       `gorm:"column:cluster_id;not null;index" json:"cluster_id"`
	RuleType             string     `gorm:"column:rule_type;not null" json:"rule_type"`
	Severity             string     `gorm:"column:severity;not null;default:warning" json:"severity"`
	Enabled              bool       `gorm:"column:enabled;default:true" json:"enabled"`
	ThresholdConfig      string     `gorm:"column:threshold_config;not null" json:"threshold_config"`
	NotificationChannels *string    `gorm:"column:notification_channels" json:"notification_channels,omitempty"`
	CreatedBy            uint       `gorm:"column:created_by;not null;index" json:"created_by"`
	CreatedAt            time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt            *time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at,omitempty"`
	IsDeleted            bool       `gorm:"column:is_deleted;default:false;index" json:"-"`
	DeletedAt            *time.Time `gorm:"column:deleted_at" json:"-"`
	DeletedBy            *uint      `gorm:"column:deleted_by" json:"-"`
}

func (AlertRule) TableName() string {
	return "alert_rules"
}

type AlertEvent struct {
	ID               uint       `gorm:"primaryKey;column:id" json:"id"`
	RuleID           uint       `gorm:"column:rule_id;not null;index" json:"rule_id"`
	ClusterID        uint       `gorm:"column:cluster_id;not null;index" json:"cluster_id"`
	ResourceType     string     `gorm:"column:resource_type;not null" json:"resource_type"`
	ResourceName     string     `gorm:"column:resource_name;not null" json:"resource_name"`
	Namespace        *string    `gorm:"column:namespace" json:"namespace,omitempty"`
	Severity         string     `gorm:"column:severity;not null" json:"severity"`
	Message          string     `gorm:"column:message;not null" json:"message"`
	Details          *string    `gorm:"column:details" json:"details,omitempty"`
	Status           string     `gorm:"column:status;not null;default:firing;index" json:"status"`
	FirstTriggeredAt time.Time  `gorm:"column:first_triggered_at;autoCreateTime" json:"first_triggered_at"`
	LastTriggeredAt  time.Time  `gorm:"column:last_triggered_at;autoCreateTime" json:"last_triggered_at"`
	ResolvedAt       *time.Time `gorm:"column:resolved_at" json:"resolved_at,omitempty"`
	NotificationSent bool       `gorm:"column:notification_sent;default:false" json:"notification_sent"`
}

func (AlertEvent) TableName() string {
	return "alert_events"
}
