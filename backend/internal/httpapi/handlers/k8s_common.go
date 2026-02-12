package handlers

import (
	"fmt"
	"net/http"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/k8s"
	"canvas/backend/internal/models"
	"k8s.io/client-go/kubernetes"
)

type K8sResolver struct {
	Service *k8s.Service
}

func NewK8sResolver(service *k8s.Service) *K8sResolver {
	return &K8sResolver{Service: service}
}

func (r *K8sResolver) ResolveClient(req *http.Request) (*models.User, *models.Cluster, *kubernetes.Clientset, error) {
	user, ok := middleware.CurrentUser(req)
	if !ok {
		return nil, nil, nil, fmt.Errorf("authentication required")
	}

	cluster, cfg, err := r.Service.ResolveClusterFromRequest(req, user)
	if err != nil {
		return nil, nil, nil, err
	}
	clientset, err := k8s.NewClientset(cfg)
	if err != nil {
		return nil, nil, nil, err
	}

	return user, cluster, clientset, nil
}
