package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type AlertHandler struct {
	DB *gorm.DB
}

func NewAlertHandler(db *gorm.DB) *AlertHandler {
	return &AlertHandler{DB: db}
}

type alertRuleCreateRequest struct {
	Name                 string                 `json:"name"`
	ClusterID            uint                   `json:"cluster_id"`
	RuleType             string                 `json:"rule_type"`
	Severity             string                 `json:"severity"`
	Enabled              *bool                  `json:"enabled"`
	ThresholdConfig      map[string]interface{} `json:"threshold_config"`
	NotificationChannels []string               `json:"notification_channels"`
}

type alertRuleUpdateRequest struct {
	Name                 *string                `json:"name"`
	Severity             *string                `json:"severity"`
	Enabled              *bool                  `json:"enabled"`
	ThresholdConfig      map[string]interface{} `json:"threshold_config"`
	NotificationChannels *[]string              `json:"notification_channels"`
}

func (h *AlertHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	var req alertRuleCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.RuleType = strings.TrimSpace(req.RuleType)
	req.Severity = strings.TrimSpace(req.Severity)
	if req.Severity == "" {
		req.Severity = "warning"
	}
	if req.Name == "" || req.RuleType == "" || req.ClusterID == 0 {
		response.Error(w, r, http.StatusBadRequest, "name, cluster_id and rule_type are required")
		return
	}
	if req.ThresholdConfig == nil {
		req.ThresholdConfig = map[string]interface{}{}
	}

	var cluster models.Cluster
	if err := h.DB.First(&cluster, req.ClusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "集群不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	thresholdJSON, err := json.Marshal(req.ThresholdConfig)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid threshold_config")
		return
	}
	if len(thresholdJSON) == 0 {
		thresholdJSON = []byte("{}")
	}

	var channelsJSON *string
	if req.NotificationChannels != nil {
		raw, err := json.Marshal(req.NotificationChannels)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "invalid notification_channels")
			return
		}
		text := string(raw)
		channelsJSON = &text
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	rule := models.AlertRule{
		Name:                 req.Name,
		ClusterID:            req.ClusterID,
		RuleType:             req.RuleType,
		Severity:             req.Severity,
		Enabled:              enabled,
		ThresholdConfig:      string(thresholdJSON),
		NotificationChannels: channelsJSON,
		CreatedBy:            currentUser.ID,
	}

	if err := h.DB.Create(&rule).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "创建告警规则失败")
		return
	}

	response.Success(w, r, http.StatusOK, mapAlertRule(rule, cluster.Name))
}

func (h *AlertHandler) ListRules(w http.ResponseWriter, r *http.Request) {
	query := h.DB.Model(&models.AlertRule{})

	clusterIDRaw := strings.TrimSpace(r.URL.Query().Get("cluster_id"))
	if clusterIDRaw != "" {
		clusterID, err := parsePathUintParam(clusterIDRaw)
		if err != nil || clusterID == 0 {
			response.Error(w, r, http.StatusBadRequest, "invalid cluster_id")
			return
		}
		query = query.Where("cluster_id = ?", clusterID)
	}

	enabledRaw := strings.TrimSpace(r.URL.Query().Get("enabled"))
	if enabledRaw != "" {
		enabled, err := strconv.ParseBool(enabledRaw)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "invalid enabled")
			return
		}
		query = query.Where("enabled = ?", enabled)
	}

	var rules []models.AlertRule
	if err := query.Order("id ASC").Find(&rules).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警规则列表失败")
		return
	}

	clusterNames := h.loadClusterNamesForRules(rules)
	items := make([]map[string]interface{}, 0, len(rules))
	for _, rule := range rules {
		items = append(items, mapAlertRule(rule, clusterNames[rule.ClusterID]))
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *AlertHandler) GetRule(w http.ResponseWriter, r *http.Request) {
	ruleID, err := parsePathUint(chi.URLParam(r, "ruleID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid rule id")
		return
	}

	var rule models.AlertRule
	if err := h.DB.First(&rule, ruleID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "告警规则不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	clusterName := h.getClusterName(rule.ClusterID)
	response.Success(w, r, http.StatusOK, mapAlertRule(rule, clusterName))
}

func (h *AlertHandler) UpdateRule(w http.ResponseWriter, r *http.Request) {
	ruleID, err := parsePathUint(chi.URLParam(r, "ruleID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid rule id")
		return
	}

	var req alertRuleUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	var rule models.AlertRule
	if err := h.DB.First(&rule, ruleID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "告警规则不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			response.Error(w, r, http.StatusBadRequest, "name cannot be empty")
			return
		}
		rule.Name = trimmed
	}

	if req.Severity != nil {
		trimmed := strings.TrimSpace(*req.Severity)
		if trimmed != "" {
			rule.Severity = trimmed
		}
	}

	if req.Enabled != nil {
		rule.Enabled = *req.Enabled
	}

	if req.ThresholdConfig != nil {
		thresholdJSON, err := json.Marshal(req.ThresholdConfig)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "invalid threshold_config")
			return
		}
		rule.ThresholdConfig = string(thresholdJSON)
	}

	if req.NotificationChannels != nil {
		raw, err := json.Marshal(*req.NotificationChannels)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "invalid notification_channels")
			return
		}
		text := string(raw)
		rule.NotificationChannels = &text
	}

	updatedAt := time.Now().UTC()
	rule.UpdatedAt = &updatedAt
	if err := h.DB.Save(&rule).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "更新告警规则失败")
		return
	}

	clusterName := h.getClusterName(rule.ClusterID)
	response.Success(w, r, http.StatusOK, mapAlertRule(rule, clusterName))
}

func (h *AlertHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	ruleID, err := parsePathUint(chi.URLParam(r, "ruleID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid rule id")
		return
	}

	var rule models.AlertRule
	if err := h.DB.First(&rule, ruleID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "告警规则不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if err := h.DB.Delete(&rule).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "删除告警规则失败")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"message": "告警规则已删除"})
}

func (h *AlertHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	query := h.DB.Model(&models.AlertEvent{})

	clusterIDRaw := strings.TrimSpace(r.URL.Query().Get("cluster_id"))
	if clusterIDRaw != "" {
		clusterID, err := parsePathUintParam(clusterIDRaw)
		if err != nil || clusterID == 0 {
			response.Error(w, r, http.StatusBadRequest, "invalid cluster_id")
			return
		}
		query = query.Where("cluster_id = ?", clusterID)
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" {
		query = query.Where("status = ?", status)
	}
	severity := strings.TrimSpace(r.URL.Query().Get("severity"))
	if severity != "" {
		query = query.Where("severity = ?", severity)
	}

	limit := parseIntWithDefault(strings.TrimSpace(r.URL.Query().Get("limit")), 100)
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	var events []models.AlertEvent
	if err := query.Order("last_triggered_at DESC").Limit(limit).Find(&events).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警事件列表失败")
		return
	}

	ruleNames := h.loadRuleNamesForEvents(events)
	clusterNames := h.loadClusterNamesForEvents(events)

	items := make([]map[string]interface{}, 0, len(events))
	for _, event := range events {
		items = append(items, mapAlertEvent(event, ruleNames[event.RuleID], clusterNames[event.ClusterID]))
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *AlertHandler) ResolveEvent(w http.ResponseWriter, r *http.Request) {
	eventID, err := parsePathUint(chi.URLParam(r, "eventID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid event id")
		return
	}

	var event models.AlertEvent
	if err := h.DB.First(&event, eventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "告警事件不存在")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	now := time.Now().UTC()
	event.Status = "resolved"
	event.ResolvedAt = &now
	if err := h.DB.Save(&event).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "更新告警事件失败")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"message": "告警事件已标记为已解决"})
}

func (h *AlertHandler) Stats(w http.ResponseWriter, r *http.Request) {
	query := h.DB.Model(&models.AlertEvent{})

	clusterIDRaw := strings.TrimSpace(r.URL.Query().Get("cluster_id"))
	if clusterIDRaw != "" {
		clusterID, err := parsePathUintParam(clusterIDRaw)
		if err != nil || clusterID == 0 {
			response.Error(w, r, http.StatusBadRequest, "invalid cluster_id")
			return
		}
		query = query.Where("cluster_id = ?", clusterID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警统计失败")
		return
	}

	firingQuery := query.Session(&gorm.Session{}).Where("status = ?", "firing")
	resolvedQuery := query.Session(&gorm.Session{}).Where("status = ?", "resolved")

	var firing int64
	var resolved int64
	if err := firingQuery.Count(&firing).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警统计失败")
		return
	}
	if err := resolvedQuery.Count(&resolved).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警统计失败")
		return
	}

	var critical int64
	var warning int64
	var info int64
	if err := query.Session(&gorm.Session{}).Where("severity = ? AND status = ?", "critical", "firing").Count(&critical).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警统计失败")
		return
	}
	if err := query.Session(&gorm.Session{}).Where("severity = ? AND status = ?", "warning", "firing").Count(&warning).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警统计失败")
		return
	}
	if err := query.Session(&gorm.Session{}).Where("severity = ? AND status = ?", "info", "firing").Count(&info).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "获取告警统计失败")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"total":    total,
		"firing":   firing,
		"resolved": resolved,
		"by_severity": map[string]interface{}{
			"critical": critical,
			"warning":  warning,
			"info":     info,
		},
	})
}

func (h *AlertHandler) loadClusterNamesForRules(rules []models.AlertRule) map[uint]string {
	ids := make([]uint, 0)
	seen := map[uint]struct{}{}
	for _, rule := range rules {
		if _, ok := seen[rule.ClusterID]; ok {
			continue
		}
		seen[rule.ClusterID] = struct{}{}
		ids = append(ids, rule.ClusterID)
	}
	return h.loadClusterNames(ids)
}

func (h *AlertHandler) loadClusterNamesForEvents(events []models.AlertEvent) map[uint]string {
	ids := make([]uint, 0)
	seen := map[uint]struct{}{}
	for _, event := range events {
		if _, ok := seen[event.ClusterID]; ok {
			continue
		}
		seen[event.ClusterID] = struct{}{}
		ids = append(ids, event.ClusterID)
	}
	return h.loadClusterNames(ids)
}

func (h *AlertHandler) loadClusterNames(ids []uint) map[uint]string {
	if len(ids) == 0 {
		return map[uint]string{}
	}
	var clusters []models.Cluster
	if err := h.DB.Where("id IN ?", ids).Find(&clusters).Error; err != nil {
		return map[uint]string{}
	}
	items := make(map[uint]string, len(clusters))
	for _, cluster := range clusters {
		items[cluster.ID] = cluster.Name
	}
	return items
}

func (h *AlertHandler) loadRuleNamesForEvents(events []models.AlertEvent) map[uint]string {
	ids := make([]uint, 0)
	seen := map[uint]struct{}{}
	for _, event := range events {
		if _, ok := seen[event.RuleID]; ok {
			continue
		}
		seen[event.RuleID] = struct{}{}
		ids = append(ids, event.RuleID)
	}

	if len(ids) == 0 {
		return map[uint]string{}
	}

	var rules []models.AlertRule
	if err := h.DB.Where("id IN ?", ids).Find(&rules).Error; err != nil {
		return map[uint]string{}
	}

	items := make(map[uint]string, len(rules))
	for _, rule := range rules {
		items[rule.ID] = rule.Name
	}
	return items
}

func (h *AlertHandler) getClusterName(clusterID uint) string {
	var cluster models.Cluster
	if err := h.DB.Select("name").First(&cluster, clusterID).Error; err != nil {
		return "Unknown"
	}
	if strings.TrimSpace(cluster.Name) == "" {
		return "Unknown"
	}
	return cluster.Name
}

func mapAlertRule(rule models.AlertRule, clusterName string) map[string]interface{} {
	threshold := map[string]interface{}{}
	if strings.TrimSpace(rule.ThresholdConfig) != "" {
		_ = json.Unmarshal([]byte(rule.ThresholdConfig), &threshold)
	}

	var channels []string
	if rule.NotificationChannels != nil && strings.TrimSpace(*rule.NotificationChannels) != "" {
		_ = json.Unmarshal([]byte(*rule.NotificationChannels), &channels)
	}

	updatedAt := rule.CreatedAt
	if rule.UpdatedAt != nil {
		updatedAt = *rule.UpdatedAt
	}

	return map[string]interface{}{
		"id":                    rule.ID,
		"name":                  rule.Name,
		"cluster_id":            rule.ClusterID,
		"cluster_name":          clusterName,
		"rule_type":             rule.RuleType,
		"severity":              rule.Severity,
		"enabled":               rule.Enabled,
		"threshold_config":      threshold,
		"notification_channels": channels,
		"created_by":            rule.CreatedBy,
		"created_at":            formatTimeRFC3339(rule.CreatedAt),
		"updated_at":            formatTimeRFC3339(updatedAt),
	}
}

func mapAlertEvent(event models.AlertEvent, ruleName string, clusterName string) map[string]interface{} {
	details := map[string]interface{}{}
	if event.Details != nil && strings.TrimSpace(*event.Details) != "" {
		_ = json.Unmarshal([]byte(*event.Details), &details)
	}

	var namespace interface{}
	if event.Namespace != nil && strings.TrimSpace(*event.Namespace) != "" {
		namespace = *event.Namespace
	}

	resolvedAt := interface{}(nil)
	if event.ResolvedAt != nil {
		resolvedAt = formatTimeRFC3339(*event.ResolvedAt)
	}

	return map[string]interface{}{
		"id":                 event.ID,
		"rule_id":            event.RuleID,
		"rule_name":          ruleName,
		"cluster_id":         event.ClusterID,
		"cluster_name":       clusterName,
		"resource_type":      event.ResourceType,
		"resource_name":      event.ResourceName,
		"namespace":          namespace,
		"severity":           event.Severity,
		"message":            event.Message,
		"details":            details,
		"status":             event.Status,
		"first_triggered_at": formatTimeRFC3339(event.FirstTriggeredAt),
		"last_triggered_at":  formatTimeRFC3339(event.LastTriggeredAt),
		"resolved_at":        resolvedAt,
		"notification_sent":  event.NotificationSent,
	}
}
