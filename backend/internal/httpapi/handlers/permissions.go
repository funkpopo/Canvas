package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type PermissionHandler struct {
	DB *gorm.DB
}

func NewPermissionHandler(db *gorm.DB) *PermissionHandler {
	return &PermissionHandler{DB: db}
}

type permissionLevelRequest struct {
	PermissionLevel string `json:"permission_level"`
}

type clusterPermissionGrantRequest struct {
	ClusterID       uint   `json:"cluster_id"`
	PermissionLevel string `json:"permission_level"`
}

type namespacePermissionGrantRequest struct {
	ClusterID       uint   `json:"cluster_id"`
	Namespace       string `json:"namespace"`
	PermissionLevel string `json:"permission_level"`
}

func (h *PermissionHandler) GetUserPermissions(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	var user models.User
	if err := h.DB.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "user not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	var clusterPerms []models.UserClusterPermission
	if err := h.DB.Where("user_id = ?", userID).Order("id ASC").Find(&clusterPerms).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	clusterResp := make([]map[string]interface{}, 0, len(clusterPerms))
	for _, perm := range clusterPerms {
		clusterResp = append(clusterResp, h.formatClusterPermission(perm))
	}

	var nsPerms []models.UserNamespacePermission
	if err := h.DB.Where("user_id = ?", userID).Order("id ASC").Find(&nsPerms).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	nsResp := make([]map[string]interface{}, 0, len(nsPerms))
	for _, perm := range nsPerms {
		nsResp = append(nsResp, h.formatNamespacePermission(perm))
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"user_id":               user.ID,
		"username":              user.Username,
		"role":                  user.Role,
		"cluster_permissions":   clusterResp,
		"namespace_permissions": nsResp,
	})
}

func (h *PermissionHandler) GrantClusterPermission(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	var req clusterPermissionGrantRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if !isValidPermissionLevel(req.PermissionLevel) {
		response.Error(w, r, http.StatusBadRequest, "permission_level must be read or manage")
		return
	}

	if err := ensureUserAndClusterExists(h.DB, userID, req.ClusterID); err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	var existing int64
	if err := h.DB.Model(&models.UserClusterPermission{}).Where("user_id = ? AND cluster_id = ?", userID, req.ClusterID).Count(&existing).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	if existing > 0 {
		response.Error(w, r, http.StatusBadRequest, "permission already exists")
		return
	}

	perm := models.UserClusterPermission{UserID: userID, ClusterID: req.ClusterID, PermissionLevel: req.PermissionLevel}
	if err := h.DB.Create(&perm).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to create permission")
		return
	}
	response.Success(w, r, http.StatusCreated, h.formatClusterPermission(perm))
}

func (h *PermissionHandler) GrantNamespacePermission(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	var req namespacePermissionGrantRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Namespace = strings.TrimSpace(req.Namespace)
	if req.Namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	if !isValidPermissionLevel(req.PermissionLevel) {
		response.Error(w, r, http.StatusBadRequest, "permission_level must be read or manage")
		return
	}

	if err := ensureUserAndClusterExists(h.DB, userID, req.ClusterID); err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	var existing int64
	if err := h.DB.Model(&models.UserNamespacePermission{}).
		Where("user_id = ? AND cluster_id = ? AND namespace = ?", userID, req.ClusterID, req.Namespace).
		Count(&existing).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	if existing > 0 {
		response.Error(w, r, http.StatusBadRequest, "permission already exists")
		return
	}

	perm := models.UserNamespacePermission{
		UserID:          userID,
		ClusterID:       req.ClusterID,
		Namespace:       req.Namespace,
		PermissionLevel: req.PermissionLevel,
	}
	if err := h.DB.Create(&perm).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to create permission")
		return
	}
	response.Success(w, r, http.StatusCreated, h.formatNamespacePermission(perm))
}

func (h *PermissionHandler) UpdateClusterPermission(w http.ResponseWriter, r *http.Request) {
	permissionID, err := parsePathUint(chi.URLParam(r, "permissionID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid permission id")
		return
	}
	var req permissionLevelRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if !isValidPermissionLevel(req.PermissionLevel) {
		response.Error(w, r, http.StatusBadRequest, "permission_level must be read or manage")
		return
	}

	var perm models.UserClusterPermission
	if err := h.DB.First(&perm, permissionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "permission not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	perm.PermissionLevel = req.PermissionLevel
	if err := h.DB.Save(&perm).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update permission")
		return
	}
	response.Success(w, r, http.StatusOK, h.formatClusterPermission(perm))
}

func (h *PermissionHandler) UpdateNamespacePermission(w http.ResponseWriter, r *http.Request) {
	permissionID, err := parsePathUint(chi.URLParam(r, "permissionID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid permission id")
		return
	}
	var req permissionLevelRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if !isValidPermissionLevel(req.PermissionLevel) {
		response.Error(w, r, http.StatusBadRequest, "permission_level must be read or manage")
		return
	}

	var perm models.UserNamespacePermission
	if err := h.DB.First(&perm, permissionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "permission not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	perm.PermissionLevel = req.PermissionLevel
	if err := h.DB.Save(&perm).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update permission")
		return
	}
	response.Success(w, r, http.StatusOK, h.formatNamespacePermission(perm))
}

func (h *PermissionHandler) RevokeClusterPermission(w http.ResponseWriter, r *http.Request) {
	permissionID, err := parsePathUint(chi.URLParam(r, "permissionID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid permission id")
		return
	}
	if err := h.DB.Delete(&models.UserClusterPermission{}, permissionID).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to revoke permission")
		return
	}
	response.NoContent(w)
}

func (h *PermissionHandler) RevokeNamespacePermission(w http.ResponseWriter, r *http.Request) {
	permissionID, err := parsePathUint(chi.URLParam(r, "permissionID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid permission id")
		return
	}
	if err := h.DB.Delete(&models.UserNamespacePermission{}, permissionID).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to revoke permission")
		return
	}
	response.NoContent(w)
}

func (h *PermissionHandler) formatClusterPermission(perm models.UserClusterPermission) map[string]interface{} {
	clusterName := ""
	var cluster models.Cluster
	if err := h.DB.First(&cluster, perm.ClusterID).Error; err == nil {
		clusterName = cluster.Name
	}
	payload := map[string]interface{}{
		"id":               perm.ID,
		"user_id":          perm.UserID,
		"cluster_id":       perm.ClusterID,
		"permission_level": perm.PermissionLevel,
		"cluster_name":     clusterName,
		"created_at":       perm.CreatedAt,
	}
	if perm.UpdatedAt != nil {
		payload["updated_at"] = perm.UpdatedAt
	}
	return payload
}

func (h *PermissionHandler) formatNamespacePermission(perm models.UserNamespacePermission) map[string]interface{} {
	clusterName := ""
	var cluster models.Cluster
	if err := h.DB.First(&cluster, perm.ClusterID).Error; err == nil {
		clusterName = cluster.Name
	}
	payload := map[string]interface{}{
		"id":               perm.ID,
		"user_id":          perm.UserID,
		"cluster_id":       perm.ClusterID,
		"namespace":        perm.Namespace,
		"permission_level": perm.PermissionLevel,
		"cluster_name":     clusterName,
		"created_at":       perm.CreatedAt,
	}
	if perm.UpdatedAt != nil {
		payload["updated_at"] = perm.UpdatedAt
	}
	return payload
}

func ensureUserAndClusterExists(db *gorm.DB, userID uint, clusterID uint) error {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("user not found")
		}
		return err
	}

	var cluster models.Cluster
	if err := db.First(&cluster, clusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("cluster not found")
		}
		return err
	}
	return nil
}

func isValidPermissionLevel(level string) bool {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "read", "manage":
		return true
	default:
		return false
	}
}

func mustParseUint(raw string) uint {
	v, _ := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	return uint(v)
}

func requireAdminUser(w http.ResponseWriter, r *http.Request) (*models.User, bool) {
	user, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return nil, false
	}
	if user.Role != "admin" {
		response.Error(w, r, http.StatusForbidden, "admin role required")
		return nil, false
	}
	return user, true
}
