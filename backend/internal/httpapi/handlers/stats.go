package handlers

import (
	"net/http"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"gorm.io/gorm"
)

type StatsHandler struct {
	DB *gorm.DB
}

func NewStatsHandler(db *gorm.DB) *StatsHandler {
	return &StatsHandler{DB: db}
}

func (h *StatsHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	current, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	query := h.DB.Model(&models.Cluster{}).Where("is_active = ?", true)
	if current.Role == "viewer" {
		allowedIDs, err := viewerAllowedClusterIDs(h.DB, current.ID)
		if err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		}
		if len(allowedIDs) == 0 {
			response.Success(w, r, http.StatusOK, dashboardPayload(0))
			return
		}
		query = query.Where("id IN ?", allowedIDs)
	}

	var activeClusters int64
	if err := query.Count(&activeClusters).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	// K8s aggregate metrics are intentionally 0 in Phase 3.
	response.Success(w, r, http.StatusOK, dashboardPayload(int(activeClusters)))
}

func dashboardPayload(activeClusters int) map[string]interface{} {
	return map[string]interface{}{
		"total_clusters":   activeClusters,
		"active_clusters":  activeClusters,
		"total_nodes":      0,
		"total_namespaces": 0,
		"total_pods":       0,
		"running_pods":     0,
		"total_services":   0,
	}
}
