package handlers

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type ClusterHandler struct {
	DB *gorm.DB
}

func NewClusterHandler(db *gorm.DB) *ClusterHandler {
	return &ClusterHandler{DB: db}
}

type clusterCreateRequest struct {
	Name              string  `json:"name"`
	Endpoint          string  `json:"endpoint"`
	AuthType          string  `json:"auth_type"`
	KubeconfigContent *string `json:"kubeconfig_content"`
	Token             *string `json:"token"`
	CACert            *string `json:"ca_cert"`
	IsActive          *bool   `json:"is_active"`
}

type clusterUpdateRequest struct {
	Name              *string `json:"name"`
	Endpoint          *string `json:"endpoint"`
	AuthType          *string `json:"auth_type"`
	KubeconfigContent *string `json:"kubeconfig_content"`
	Token             *string `json:"token"`
	CACert            *string `json:"ca_cert"`
	IsActive          *bool   `json:"is_active"`
}

func (h *ClusterHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req clusterCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Endpoint = strings.TrimSpace(req.Endpoint)
	req.AuthType = strings.TrimSpace(req.AuthType)
	if req.Name == "" || req.Endpoint == "" || req.AuthType == "" {
		response.Error(w, r, http.StatusBadRequest, "name, endpoint and auth_type are required")
		return
	}
	if req.AuthType != "kubeconfig" && req.AuthType != "token" {
		response.Error(w, r, http.StatusBadRequest, "auth_type must be kubeconfig or token")
		return
	}

	if exists, err := clusterNameExists(h.DB, req.Name, 0); err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	} else if exists {
		response.Error(w, r, http.StatusBadRequest, "cluster name already exists")
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	cluster := models.Cluster{
		Name:              req.Name,
		Endpoint:          req.Endpoint,
		AuthType:          req.AuthType,
		KubeconfigContent: req.KubeconfigContent,
		Token:             req.Token,
		CACert:            req.CACert,
		IsActive:          isActive,
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&cluster).Error; err != nil {
			return err
		}
		if cluster.IsActive {
			if err := tx.Model(&models.Cluster{}).Where("id <> ?", cluster.ID).Update("is_active", false).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to create cluster")
		return
	}

	if err := h.DB.First(&cluster, cluster.ID).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to load cluster")
		return
	}

	response.Success(w, r, http.StatusOK, cluster)
}

func (h *ClusterHandler) List(w http.ResponseWriter, r *http.Request) {
	skip := parseIntWithDefault(r.URL.Query().Get("skip"), 0)
	limit := parseIntWithDefault(r.URL.Query().Get("limit"), 100)
	if skip < 0 {
		skip = 0
	}
	if limit < 1 {
		limit = 100
	}

	current, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}

	query := h.DB.Model(&models.Cluster{})
	if current.Role == "viewer" {
		allowedIDs, err := viewerAllowedClusterIDs(h.DB, current.ID)
		if err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		}
		if len(allowedIDs) == 0 {
			response.Success(w, r, http.StatusOK, []models.Cluster{})
			return
		}
		query = query.Where("id IN ?", allowedIDs)
	}

	var clusters []models.Cluster
	if err := query.Offset(skip).Limit(limit).Find(&clusters).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	response.Success(w, r, http.StatusOK, clusters)
}

func (h *ClusterHandler) Get(w http.ResponseWriter, r *http.Request) {
	clusterID, err := parsePathUint(chi.URLParam(r, "clusterID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid cluster id")
		return
	}

	current, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}
	if current.Role == "viewer" {
		allowedIDs, err := viewerAllowedClusterIDs(h.DB, current.ID)
		if err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		}
		if !containsUint(allowedIDs, clusterID) {
			response.Error(w, r, http.StatusForbidden, "cluster read permission is required")
			return
		}
	}

	var cluster models.Cluster
	if err := h.DB.First(&cluster, clusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "cluster not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	response.Success(w, r, http.StatusOK, cluster)
}

func (h *ClusterHandler) Update(w http.ResponseWriter, r *http.Request) {
	clusterID, err := parsePathUint(chi.URLParam(r, "clusterID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid cluster id")
		return
	}

	var req clusterUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	var cluster models.Cluster
	if err := h.DB.First(&cluster, clusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "cluster not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			response.Error(w, r, http.StatusBadRequest, "name cannot be empty")
			return
		}
		if name != cluster.Name {
			exists, err := clusterNameExists(h.DB, name, cluster.ID)
			if err != nil {
				response.Error(w, r, http.StatusInternalServerError, "database error")
				return
			}
			if exists {
				response.Error(w, r, http.StatusBadRequest, "cluster name already exists")
				return
			}
			cluster.Name = name
		}
	}
	if req.Endpoint != nil {
		endpoint := strings.TrimSpace(*req.Endpoint)
		if endpoint == "" {
			response.Error(w, r, http.StatusBadRequest, "endpoint cannot be empty")
			return
		}
		cluster.Endpoint = endpoint
	}
	if req.AuthType != nil {
		authType := strings.TrimSpace(*req.AuthType)
		if authType != "kubeconfig" && authType != "token" {
			response.Error(w, r, http.StatusBadRequest, "auth_type must be kubeconfig or token")
			return
		}
		cluster.AuthType = authType
	}
	if req.KubeconfigContent != nil {
		cluster.KubeconfigContent = req.KubeconfigContent
	}
	if req.Token != nil {
		cluster.Token = req.Token
	}
	if req.CACert != nil {
		cluster.CACert = req.CACert
	}
	if req.IsActive != nil {
		cluster.IsActive = *req.IsActive
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&cluster).Error; err != nil {
			return err
		}
		if req.IsActive != nil && *req.IsActive {
			if err := tx.Model(&models.Cluster{}).Where("id <> ?", cluster.ID).Update("is_active", false).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update cluster")
		return
	}

	if err := h.DB.First(&cluster, cluster.ID).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to load cluster")
		return
	}

	response.Success(w, r, http.StatusOK, cluster)
}

func (h *ClusterHandler) Delete(w http.ResponseWriter, r *http.Request) {
	clusterID, err := parsePathUint(chi.URLParam(r, "clusterID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid cluster id")
		return
	}

	if err := h.DB.Delete(&models.Cluster{}, clusterID).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to delete cluster")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"message": "cluster deleted"})
}

func (h *ClusterHandler) Activate(w http.ResponseWriter, r *http.Request) {
	clusterID, err := parsePathUint(chi.URLParam(r, "clusterID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid cluster id")
		return
	}

	var cluster models.Cluster
	if err := h.DB.First(&cluster, clusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "cluster not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Cluster{}).Where("id <> ?", clusterID).Update("is_active", false).Error; err != nil {
			return err
		}
		cluster.IsActive = true
		return tx.Save(&cluster).Error
	})
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to activate cluster")
		return
	}

	response.Success(w, r, http.StatusOK, cluster)
}

func (h *ClusterHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	clusterID, err := parsePathUint(chi.URLParam(r, "clusterID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid cluster id")
		return
	}

	current, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}
	if current.Role == "viewer" {
		allowedIDs, err := viewerAllowedClusterIDs(h.DB, current.ID)
		if err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		}
		if !containsUint(allowedIDs, clusterID) {
			response.Error(w, r, http.StatusForbidden, "cluster read permission is required")
			return
		}
	}

	var cluster models.Cluster
	if err := h.DB.First(&cluster, clusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "cluster not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	reachable, detail := probeEndpoint(cluster.Endpoint)
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"cluster_id": cluster.ID,
		"reachable":  reachable,
		"message":    detail,
	})
}

func probeEndpoint(endpoint string) (bool, string) {
	parsed, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil || parsed.Host == "" {
		return false, "invalid endpoint URL"
	}

	host := parsed.Host
	if !strings.Contains(host, ":") {
		switch parsed.Scheme {
		case "http":
			host += ":80"
		default:
			host += ":443"
		}
	}

	conn, err := net.DialTimeout("tcp", host, 3*time.Second)
	if err != nil {
		return false, fmt.Sprintf("connection failed: %v", err)
	}
	_ = conn.Close()
	return true, "connection established"
}

func clusterNameExists(db *gorm.DB, name string, excludeID uint) (bool, error) {
	query := db.Model(&models.Cluster{}).Where("name = ?", name)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	var count int64
	err := query.Count(&count).Error
	return count > 0, err
}

func viewerAllowedClusterIDs(db *gorm.DB, userID uint) ([]uint, error) {
	idsMap := make(map[uint]struct{})

	var clusterPerms []models.UserClusterPermission
	if err := db.Where("user_id = ?", userID).Find(&clusterPerms).Error; err != nil {
		return nil, err
	}
	for _, perm := range clusterPerms {
		idsMap[perm.ClusterID] = struct{}{}
	}

	var nsPerms []models.UserNamespacePermission
	if err := db.Where("user_id = ?", userID).Find(&nsPerms).Error; err != nil {
		return nil, err
	}
	for _, perm := range nsPerms {
		idsMap[perm.ClusterID] = struct{}{}
	}

	ids := make([]uint, 0, len(idsMap))
	for id := range idsMap {
		ids = append(ids, id)
	}
	return ids, nil
}

func containsUint(items []uint, target uint) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
