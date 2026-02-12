package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type NamespaceHandler struct {
	Resolver *K8sResolver
}

func NewNamespaceHandler(resolver *K8sResolver) *NamespaceHandler {
	return &NamespaceHandler{Resolver: resolver}
}

func (h *NamespaceHandler) List(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	nsList, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		items = append(items, formatNamespace(ns, cluster.ID, cluster.Name))
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *NamespaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	ns, err := clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, formatNamespace(*ns, cluster.ID, cluster.Name))
}

type createNamespaceRequest struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels"`
}

func (h *NamespaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createNamespaceRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		response.Error(w, r, http.StatusBadRequest, "name is required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:   req.Name,
			Labels: req.Labels,
		},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	created, err := clientset.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, formatNamespace(*created, cluster.ID, cluster.Name))
}

func (h *NamespaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().Namespaces().Delete(ctx, namespace, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.NoContent(w)
}

func (h *NamespaceHandler) Resources(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	pods, _ := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	deps, _ := clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	svcs, _ := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	cms, _ := clientset.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	secrets, _ := clientset.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	pvcs, _ := clientset.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"pods":        len(pods.Items),
		"deployments": len(deps.Items),
		"services":    len(svcs.Items),
		"configmaps":  len(cms.Items),
		"secrets":     len(secrets.Items),
		"pvcs":        len(pvcs.Items),
	})
}

func (h *NamespaceHandler) Deployments(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	deps, err := clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(deps.Items))
	for _, dep := range deps.Items {
		items = append(items, mapDeploymentSummary(dep))
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *NamespaceHandler) Services(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	svcs, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(svcs.Items))
	for _, svc := range svcs.Items {
		items = append(items, mapServiceSummary(svc))
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *NamespaceHandler) CRDs(w http.ResponseWriter, r *http.Request) {
	// The previous Python backend returned namespace scoped CRD resources.
	// Keep endpoint compatibility with an empty list for now.
	response.Success(w, r, http.StatusOK, []map[string]interface{}{})
}

func formatNamespace(ns corev1.Namespace, clusterID uint, clusterName string) map[string]interface{} {
	return map[string]interface{}{
		"name":         ns.Name,
		"status":       string(ns.Status.Phase),
		"age":          k8s.CalculateAgeFromTime(ns.CreationTimestamp.Time),
		"labels":       ns.Labels,
		"annotations":  ns.Annotations,
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapDeploymentSummary(dep appsv1.Deployment) map[string]interface{} {
	replicas := int32(0)
	if dep.Spec.Replicas != nil {
		replicas = *dep.Spec.Replicas
	}
	return map[string]interface{}{
		"name":               dep.Name,
		"namespace":          dep.Namespace,
		"replicas":           replicas,
		"ready_replicas":     dep.Status.ReadyReplicas,
		"available_replicas": dep.Status.AvailableReplicas,
		"labels":             dep.Labels,
	}
}

func mapServiceSummary(svc corev1.Service) map[string]interface{} {
	ports := make([]map[string]interface{}, 0, len(svc.Spec.Ports))
	for _, p := range svc.Spec.Ports {
		ports = append(ports, map[string]interface{}{
			"name":        p.Name,
			"port":        p.Port,
			"target_port": p.TargetPort.String(),
			"protocol":    string(p.Protocol),
		})
	}
	return map[string]interface{}{
		"name":       svc.Name,
		"namespace":  svc.Namespace,
		"type":       string(svc.Spec.Type),
		"cluster_ip": svc.Spec.ClusterIP,
		"ports":      ports,
		"selector":   svc.Spec.Selector,
		"labels":     svc.Labels,
	}
}
