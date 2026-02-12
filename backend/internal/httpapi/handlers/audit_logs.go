package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"gorm.io/gorm"
)

type AuditLogHandler struct {
	DB *gorm.DB
}

func NewAuditLogHandler(db *gorm.DB) *AuditLogHandler {
	return &AuditLogHandler{DB: db}
}

func (h *AuditLogHandler) List(w http.ResponseWriter, r *http.Request) {
	page := parseIntWithDefault(r.URL.Query().Get("page"), 1)
	if page < 1 {
		page = 1
	}
	pageSize := parseIntWithDefault(r.URL.Query().Get("page_size"), 50)
	if pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 200 {
		pageSize = 200
	}

	query := h.DB.Model(&models.AuditLog{})

	if v := strings.TrimSpace(r.URL.Query().Get("user_id")); v != "" {
		if userID, err := strconv.ParseUint(v, 10, 64); err == nil {
			query = query.Where("user_id = ?", userID)
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("cluster_id")); v != "" {
		if clusterID, err := strconv.ParseUint(v, 10, 64); err == nil {
			query = query.Where("cluster_id = ?", clusterID)
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("action")); v != "" {
		query = query.Where("action = ?", v)
	}
	if v := strings.TrimSpace(r.URL.Query().Get("resource_type")); v != "" {
		query = query.Where("resource_type = ?", v)
	}
	if v := strings.TrimSpace(r.URL.Query().Get("success")); v != "" {
		if parsed, err := strconv.ParseBool(v); err == nil {
			query = query.Where("success = ?", parsed)
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("start_date")); v != "" {
		if ts, err := parseTimeFlexible(v); err == nil {
			query = query.Where("created_at >= ?", ts)
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("end_date")); v != "" {
		if ts, err := parseTimeFlexible(v); err == nil {
			query = query.Where("created_at <= ?", ts)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	var logs []models.AuditLog
	if err := query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	userNames := h.loadUsernames(logs)
	clusterNames := h.loadClusterNames(logs)

	items := make([]map[string]interface{}, 0, len(logs))
	for _, logItem := range logs {
		item := map[string]interface{}{
			"id":            logItem.ID,
			"user_id":       logItem.UserID,
			"username":      userNames[logItem.UserID],
			"cluster_id":    logItem.ClusterID,
			"cluster_name":  clusterNames[logItem.ClusterID],
			"action":        logItem.Action,
			"resource_type": logItem.ResourceType,
			"resource_name": logItem.ResourceName,
			"success":       logItem.Success,
			"created_at":    logItem.CreatedAt,
		}
		if logItem.Details != nil {
			item["details"] = *logItem.Details
		}
		if logItem.IPAddress != nil {
			item["ip_address"] = *logItem.IPAddress
		}
		if logItem.UserAgent != nil {
			item["user_agent"] = *logItem.UserAgent
		}
		if logItem.ErrorMessage != nil {
			item["error_message"] = *logItem.ErrorMessage
		}
		items = append(items, item)
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"total": total,
		"logs":  items,
	})
}

func (h *AuditLogHandler) StatsSummary(w http.ResponseWriter, r *http.Request) {
	query := h.DB.Model(&models.AuditLog{})

	if v := strings.TrimSpace(r.URL.Query().Get("start_date")); v != "" {
		if ts, err := parseTimeFlexible(v); err == nil {
			query = query.Where("created_at >= ?", ts)
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("end_date")); v != "" {
		if ts, err := parseTimeFlexible(v); err == nil {
			query = query.Where("created_at <= ?", ts)
		}
	}

	var logs []models.AuditLog
	if err := query.Find(&logs).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	total := len(logs)
	success := 0
	actionStats := map[string]int{}
	resourceStats := map[string]int{}
	userStats := map[uint]int{}
	for _, item := range logs {
		if item.Success {
			success++
		}
		actionStats[item.Action]++
		resourceStats[item.ResourceType]++
		userStats[item.UserID]++
	}

	failed := total - success
	successRate := 0.0
	if total > 0 {
		successRate = float64(success) / float64(total) * 100
	}

	userNames := h.loadUsernames(logs)
	actions := make([]map[string]interface{}, 0, len(actionStats))
	for action, count := range actionStats {
		actions = append(actions, map[string]interface{}{"action": action, "count": count})
	}
	resources := make([]map[string]interface{}, 0, len(resourceStats))
	for resourceType, count := range resourceStats {
		resources = append(resources, map[string]interface{}{"resource_type": resourceType, "count": count})
	}
	users := make([]map[string]interface{}, 0, len(userStats))
	for userID, count := range userStats {
		users = append(users, map[string]interface{}{"username": userNames[userID], "count": count})
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"total_operations": total,
		"success_count":    success,
		"failed_count":     failed,
		"success_rate":     successRate,
		"action_stats":     actions,
		"resource_stats":   resources,
		"user_stats":       users,
	})
}

func (h *AuditLogHandler) loadUsernames(logs []models.AuditLog) map[uint]string {
	ids := make([]uint, 0)
	seen := map[uint]struct{}{}
	for _, item := range logs {
		if _, ok := seen[item.UserID]; ok {
			continue
		}
		seen[item.UserID] = struct{}{}
		ids = append(ids, item.UserID)
	}
	if len(ids) == 0 {
		return map[uint]string{}
	}
	var users []models.User
	_ = h.DB.Where("id IN ?", ids).Find(&users).Error
	result := map[uint]string{}
	for _, u := range users {
		result[u.ID] = u.Username
	}
	return result
}

func (h *AuditLogHandler) loadClusterNames(logs []models.AuditLog) map[uint]string {
	ids := make([]uint, 0)
	seen := map[uint]struct{}{}
	for _, item := range logs {
		if _, ok := seen[item.ClusterID]; ok {
			continue
		}
		seen[item.ClusterID] = struct{}{}
		ids = append(ids, item.ClusterID)
	}
	if len(ids) == 0 {
		return map[uint]string{}
	}
	var clusters []models.Cluster
	_ = h.DB.Where("id IN ?", ids).Find(&clusters).Error
	result := map[uint]string{}
	for _, c := range clusters {
		result[c.ID] = c.Name
	}
	return result
}

func parseTimeFlexible(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.ReplaceAll(raw, "Z", "+00:00")
	return time.Parse(time.RFC3339, raw)
}
