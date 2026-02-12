package k8s

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/models"
	"gorm.io/gorm"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ResolveClusterFromRequest(r *http.Request, user *models.User) (*models.Cluster, *rest.Config, error) {
	clusterIDRaw := strings.TrimSpace(r.URL.Query().Get("cluster_id"))
	if clusterIDRaw != "" {
		clusterID, err := strconv.ParseUint(clusterIDRaw, 10, 64)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid cluster_id")
		}
		cluster, err := s.GetClusterForUser(uint(clusterID), user)
		if err != nil {
			return nil, nil, err
		}
		cfg, err := BuildConfig(cluster)
		if err != nil {
			return nil, nil, err
		}
		return cluster, cfg, nil
	}

	cluster, err := s.findDefaultClusterForUser(user)
	if err != nil {
		return nil, nil, err
	}
	cfg, err := BuildConfig(cluster)
	if err != nil {
		return nil, nil, err
	}
	return cluster, cfg, nil
}

func (s *Service) GetClusterForUser(clusterID uint, user *models.User) (*models.Cluster, error) {
	var cluster models.Cluster
	if err := s.DB.First(&cluster, clusterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("cluster not found")
		}
		return nil, err
	}

	if user == nil {
		return nil, fmt.Errorf("authentication required")
	}

	if user.Role == "admin" || user.Role == "user" {
		return &cluster, nil
	}

	allowed, err := s.viewerHasClusterAccess(user.ID, clusterID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, fmt.Errorf("cluster read permission is required")
	}
	return &cluster, nil
}

func (s *Service) findDefaultClusterForUser(user *models.User) (*models.Cluster, error) {
	var cluster models.Cluster

	query := s.DB.Model(&models.Cluster{}).Where("is_active = ?", true)
	if user != nil && user.Role == "viewer" {
		allowedIDs, err := s.viewerAllowedClusterIDs(user.ID)
		if err != nil {
			return nil, err
		}
		if len(allowedIDs) == 0 {
			return nil, fmt.Errorf("no cluster permissions")
		}
		query = query.Where("id IN ?", allowedIDs)
	}

	if err := query.Order("id ASC").First(&cluster).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("no active cluster")
		}
		return nil, err
	}
	return &cluster, nil
}

func (s *Service) viewerHasClusterAccess(userID uint, clusterID uint) (bool, error) {
	var count int64
	if err := s.DB.Model(&models.UserClusterPermission{}).
		Where("user_id = ? AND cluster_id = ?", userID, clusterID).
		Count(&count).Error; err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	if err := s.DB.Model(&models.UserNamespacePermission{}).
		Where("user_id = ? AND cluster_id = ?", userID, clusterID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) viewerAllowedClusterIDs(userID uint) ([]uint, error) {
	idSet := map[uint]struct{}{}

	var clusterPerms []models.UserClusterPermission
	if err := s.DB.Where("user_id = ?", userID).Find(&clusterPerms).Error; err != nil {
		return nil, err
	}
	for _, perm := range clusterPerms {
		idSet[perm.ClusterID] = struct{}{}
	}

	var namespacePerms []models.UserNamespacePermission
	if err := s.DB.Where("user_id = ?", userID).Find(&namespacePerms).Error; err != nil {
		return nil, err
	}
	for _, perm := range namespacePerms {
		idSet[perm.ClusterID] = struct{}{}
	}

	ids := make([]uint, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	return ids, nil
}

func BuildConfig(cluster *models.Cluster) (*rest.Config, error) {
	if cluster == nil {
		return nil, fmt.Errorf("cluster is nil")
	}

	authType := strings.ToLower(strings.TrimSpace(cluster.AuthType))
	switch authType {
	case "kubeconfig":
		if cluster.KubeconfigContent == nil || strings.TrimSpace(*cluster.KubeconfigContent) == "" {
			return nil, fmt.Errorf("kubeconfig content is empty")
		}
		cfg, err := clientcmd.RESTConfigFromKubeConfig([]byte(*cluster.KubeconfigContent))
		if err != nil {
			return nil, err
		}
		cfg.Timeout = 30 * time.Second
		return cfg, nil
	case "token":
		if cluster.Token == nil || strings.TrimSpace(*cluster.Token) == "" {
			return nil, fmt.Errorf("token is empty")
		}
		cfg := &rest.Config{
			Host:        strings.TrimSpace(cluster.Endpoint),
			BearerToken: strings.TrimSpace(*cluster.Token),
			TLSClientConfig: rest.TLSClientConfig{
				Insecure: false,
			},
			Timeout: 30 * time.Second,
		}
		if cluster.CACert != nil && strings.TrimSpace(*cluster.CACert) != "" {
			ca := strings.TrimSpace(*cluster.CACert)
			decoded, err := base64.StdEncoding.DecodeString(ca)
			if err == nil {
				cfg.TLSClientConfig.CAData = decoded
			} else {
				cfg.TLSClientConfig.CAData = []byte(ca)
			}
		}
		return cfg, nil
	default:
		return nil, fmt.Errorf("unsupported auth_type: %s", cluster.AuthType)
	}
}
