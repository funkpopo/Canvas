package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type NetworkPolicyHandler struct {
	Resolver *K8sResolver
}

func NewNetworkPolicyHandler(resolver *K8sResolver) *NetworkPolicyHandler {
	return &NetworkPolicyHandler{Resolver: resolver}
}

func (h *NetworkPolicyHandler) List(w http.ResponseWriter, r *http.Request) {
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

	list, err := clientset.NetworkingV1().NetworkPolicies(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(list.Items))
	for _, policy := range list.Items {
		items = append(items, mapNetworkPolicySummary(policy, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *NetworkPolicyHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "policyName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and policy name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	policy, err := clientset.NetworkingV1().NetworkPolicies(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapNetworkPolicyDetails(*policy, cluster.ID, cluster.Name))
}

type networkPolicyCreateRequest struct {
	Name        string                   `json:"name"`
	Namespace   string                   `json:"namespace"`
	PodSelector map[string]string        `json:"pod_selector"`
	PolicyTypes []string                 `json:"policy_types"`
	Ingress     []map[string]interface{} `json:"ingress"`
	Egress      []map[string]interface{} `json:"egress"`
	Labels      map[string]string        `json:"labels"`
	Annotations map[string]string        `json:"annotations"`
}

func (h *NetworkPolicyHandler) Create(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req networkPolicyCreateRequest
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

	policy, err := buildNetworkPolicyFromRequest(name, namespace, req)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	created, err := clientset.NetworkingV1().NetworkPolicies(namespace).Create(ctx, policy, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusCreated, mapNetworkPolicySummary(*created, cluster.ID, cluster.Name))
}

type networkPolicyUpdateRequest struct {
	PodSelector map[string]string        `json:"pod_selector"`
	PolicyTypes []string                 `json:"policy_types"`
	Ingress     []map[string]interface{} `json:"ingress"`
	Egress      []map[string]interface{} `json:"egress"`
	Labels      map[string]string        `json:"labels"`
	Annotations map[string]string        `json:"annotations"`
}

func (h *NetworkPolicyHandler) Update(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "policyName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and policy name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req networkPolicyUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	current, err := clientset.NetworkingV1().NetworkPolicies(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	if req.PodSelector != nil {
		current.Spec.PodSelector.MatchLabels = mapStringStringClone(req.PodSelector)
	}
	if req.PolicyTypes != nil {
		current.Spec.PolicyTypes = parseNetworkPolicyTypes(req.PolicyTypes)
	}
	if req.Ingress != nil {
		ingress, err := parseNetworkPolicyIngress(req.Ingress)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, err.Error())
			return
		}
		current.Spec.Ingress = ingress
	}
	if req.Egress != nil {
		egress, err := parseNetworkPolicyEgress(req.Egress)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, err.Error())
			return
		}
		current.Spec.Egress = egress
	}
	if req.Labels != nil {
		current.Labels = mapStringStringClone(req.Labels)
	}
	if req.Annotations != nil {
		current.Annotations = mapStringStringClone(req.Annotations)
	}

	updated, err := clientset.NetworkingV1().NetworkPolicies(namespace).Update(ctx, current, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapNetworkPolicySummary(*updated, cluster.ID, cluster.Name))
}

func (h *NetworkPolicyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "policyName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and policy name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := clientset.NetworkingV1().NetworkPolicies(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.NoContent(w)
}

func buildNetworkPolicyFromRequest(name string, namespace string, req networkPolicyCreateRequest) (*networkingv1.NetworkPolicy, error) {
	ingress, err := parseNetworkPolicyIngress(req.Ingress)
	if err != nil {
		return nil, err
	}
	egress, err := parseNetworkPolicyEgress(req.Egress)
	if err != nil {
		return nil, err
	}

	policy := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:        name,
			Namespace:   namespace,
			Labels:      mapStringStringClone(req.Labels),
			Annotations: mapStringStringClone(req.Annotations),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: mapStringStringClone(req.PodSelector)},
			PolicyTypes: parseNetworkPolicyTypes(req.PolicyTypes),
			Ingress:     ingress,
			Egress:      egress,
		},
	}
	return policy, nil
}

func parseNetworkPolicyTypes(input []string) []networkingv1.PolicyType {
	if len(input) == 0 {
		return nil
	}
	items := make([]networkingv1.PolicyType, 0, len(input))
	for _, item := range input {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		items = append(items, networkingv1.PolicyType(trimmed))
	}
	if len(items) == 0 {
		return nil
	}
	return items
}

func parseNetworkPolicyIngress(input []map[string]interface{}) ([]networkingv1.NetworkPolicyIngressRule, error) {
	if len(input) == 0 {
		return nil, nil
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("invalid ingress rules")
	}
	items := []networkingv1.NetworkPolicyIngressRule{}
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, fmt.Errorf("invalid ingress rules")
	}
	return items, nil
}

func parseNetworkPolicyEgress(input []map[string]interface{}) ([]networkingv1.NetworkPolicyEgressRule, error) {
	if len(input) == 0 {
		return nil, nil
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("invalid egress rules")
	}
	items := []networkingv1.NetworkPolicyEgressRule{}
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, fmt.Errorf("invalid egress rules")
	}
	return items, nil
}

func mapNetworkPolicySummary(policy networkingv1.NetworkPolicy, clusterID uint, clusterName string) map[string]interface{} {
	policyTypes := make([]string, 0, len(policy.Spec.PolicyTypes))
	for _, policyType := range policy.Spec.PolicyTypes {
		policyTypes = append(policyTypes, string(policyType))
	}
	return map[string]interface{}{
		"name":         policy.Name,
		"namespace":    policy.Namespace,
		"pod_selector": mapStringStringClone(policy.Spec.PodSelector.MatchLabels),
		"policy_types": policyTypes,
		"labels":       mapStringStringClone(policy.Labels),
		"annotations":  mapStringStringClone(policy.Annotations),
		"age":          k8s.CalculateAgeFromTime(policy.CreationTimestamp.Time),
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapNetworkPolicyDetails(policy networkingv1.NetworkPolicy, clusterID uint, clusterName string) map[string]interface{} {
	payload := mapNetworkPolicySummary(policy, clusterID, clusterName)
	ingress := []map[string]interface{}{}
	egress := []map[string]interface{}{}
	_ = convertViaJSON(policy.Spec.Ingress, &ingress)
	_ = convertViaJSON(policy.Spec.Egress, &egress)
	payload["ingress"] = ingress
	payload["egress"] = egress
	return payload
}
