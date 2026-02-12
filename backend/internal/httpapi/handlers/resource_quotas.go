package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ResourceQuotaHandler struct {
	Resolver *K8sResolver
}

func NewResourceQuotaHandler(resolver *K8sResolver) *ResourceQuotaHandler {
	return &ResourceQuotaHandler{Resolver: resolver}
}

func (h *ResourceQuotaHandler) List(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
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

	list, err := clientset.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(list.Items))
	for _, quota := range list.Items {
		items = append(items, mapResourceQuotaSummary(quota, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *ResourceQuotaHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "quotaName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and quota name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	quota, err := clientset.CoreV1().ResourceQuotas(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapResourceQuotaDetails(*quota, cluster.ID, cluster.Name))
}

type resourceQuotaCreateRequest struct {
	Name          string                   `json:"name"`
	Namespace     string                   `json:"namespace"`
	Hard          map[string]string        `json:"hard"`
	Scopes        []string                 `json:"scopes"`
	ScopeSelector []map[string]interface{} `json:"scope_selector"`
	Labels        map[string]string        `json:"labels"`
	Annotations   map[string]string        `json:"annotations"`
}

func (h *ResourceQuotaHandler) Create(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req resourceQuotaCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	namespace := strings.TrimSpace(req.Namespace)
	if name == "" || namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "name and namespace are required")
		return
	}

	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:        name,
			Namespace:   namespace,
			Labels:      mapStringStringClone(req.Labels),
			Annotations: mapStringStringClone(req.Annotations),
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard:          parseResourceList(req.Hard),
			Scopes:        parseResourceQuotaScopes(req.Scopes),
			ScopeSelector: parseScopeSelector(req.ScopeSelector),
		},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	created, err := clientset.CoreV1().ResourceQuotas(namespace).Create(ctx, quota, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusCreated, mapResourceQuotaSummary(*created, cluster.ID, cluster.Name))
}

type resourceQuotaUpdateRequest struct {
	Hard          map[string]string        `json:"hard"`
	Scopes        []string                 `json:"scopes"`
	ScopeSelector []map[string]interface{} `json:"scope_selector"`
	Labels        map[string]string        `json:"labels"`
	Annotations   map[string]string        `json:"annotations"`
}

func (h *ResourceQuotaHandler) Update(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "quotaName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and quota name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req resourceQuotaUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	current, err := clientset.CoreV1().ResourceQuotas(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	if req.Hard != nil {
		current.Spec.Hard = parseResourceList(req.Hard)
	}
	if req.Scopes != nil {
		current.Spec.Scopes = parseResourceQuotaScopes(req.Scopes)
	}
	if req.ScopeSelector != nil {
		current.Spec.ScopeSelector = parseScopeSelector(req.ScopeSelector)
	}
	if req.Labels != nil {
		current.Labels = mapStringStringClone(req.Labels)
	}
	if req.Annotations != nil {
		current.Annotations = mapStringStringClone(req.Annotations)
	}

	updated, err := clientset.CoreV1().ResourceQuotas(namespace).Update(ctx, current, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapResourceQuotaSummary(*updated, cluster.ID, cluster.Name))
}

func (h *ResourceQuotaHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "quotaName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and quota name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := clientset.CoreV1().ResourceQuotas(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.NoContent(w)
}

func mapResourceQuotaSummary(quota corev1.ResourceQuota, clusterID uint, clusterName string) map[string]interface{} {
	return map[string]interface{}{
		"name":         quota.Name,
		"namespace":    quota.Namespace,
		"hard":         quantityMapToStringMap(quota.Status.Hard),
		"used":         quantityMapToStringMap(quota.Status.Used),
		"labels":       mapStringStringClone(quota.Labels),
		"annotations":  mapStringStringClone(quota.Annotations),
		"age":          k8s.CalculateAgeFromTime(quota.CreationTimestamp.Time),
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapResourceQuotaDetails(quota corev1.ResourceQuota, clusterID uint, clusterName string) map[string]interface{} {
	base := mapResourceQuotaSummary(quota, clusterID, clusterName)
	scopes := make([]string, 0, len(quota.Spec.Scopes))
	for _, scope := range quota.Spec.Scopes {
		scopes = append(scopes, string(scope))
	}
	base["scopes"] = scopes
	if quota.Spec.ScopeSelector == nil || len(quota.Spec.ScopeSelector.MatchExpressions) == 0 {
		base["scope_selector"] = []map[string]interface{}{}
		return base
	}

	expressions := make([]map[string]interface{}, 0, len(quota.Spec.ScopeSelector.MatchExpressions))
	for _, expr := range quota.Spec.ScopeSelector.MatchExpressions {
		expressions = append(expressions, map[string]interface{}{
			"scope_name": string(expr.ScopeName),
			"operator":   string(expr.Operator),
			"values":     expr.Values,
		})
	}
	base["scope_selector"] = expressions
	return base
}

func parseResourceList(input map[string]string) corev1.ResourceList {
	resources := corev1.ResourceList{}
	for key, value := range input {
		name := corev1.ResourceName(strings.TrimSpace(key))
		if name == "" {
			continue
		}
		quantity, err := resource.ParseQuantity(strings.TrimSpace(value))
		if err != nil {
			continue
		}
		resources[name] = quantity
	}
	return resources
}

func parseResourceQuotaScopes(scopes []string) []corev1.ResourceQuotaScope {
	if len(scopes) == 0 {
		return nil
	}
	items := make([]corev1.ResourceQuotaScope, 0, len(scopes))
	for _, scope := range scopes {
		trimmed := strings.TrimSpace(scope)
		if trimmed == "" {
			continue
		}
		items = append(items, corev1.ResourceQuotaScope(trimmed))
	}
	if len(items) == 0 {
		return nil
	}
	return items
}

func parseScopeSelector(expressions []map[string]interface{}) *corev1.ScopeSelector {
	if len(expressions) == 0 {
		return nil
	}
	items := make([]corev1.ScopedResourceSelectorRequirement, 0, len(expressions))
	for _, expr := range expressions {
		scopeName := strings.TrimSpace(fmt.Sprint(expr["scope_name"]))
		operator := strings.TrimSpace(fmt.Sprint(expr["operator"]))
		if scopeName == "" || operator == "" {
			continue
		}

		values := []string{}
		rawValues, ok := expr["values"]
		if ok {
			switch cast := rawValues.(type) {
			case []interface{}:
				for _, value := range cast {
					trimmed := strings.TrimSpace(fmt.Sprint(value))
					if trimmed != "" {
						values = append(values, trimmed)
					}
				}
			case []string:
				for _, value := range cast {
					trimmed := strings.TrimSpace(value)
					if trimmed != "" {
						values = append(values, trimmed)
					}
				}
			}
		}

		items = append(items, corev1.ScopedResourceSelectorRequirement{
			ScopeName: corev1.ResourceQuotaScope(scopeName),
			Operator:  corev1.ScopeSelectorOperator(operator),
			Values:    values,
		})
	}

	if len(items) == 0 {
		return nil
	}
	return &corev1.ScopeSelector{MatchExpressions: items}
}
