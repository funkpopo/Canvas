package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type RBACHandler struct {
	Resolver *K8sResolver
}

func NewRBACHandler(resolver *K8sResolver) *RBACHandler {
	return &RBACHandler{Resolver: resolver}
}

func (h *RBACHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	var roles []rbacv1.Role
	if namespace != "" {
		list, err := clientset.RbacV1().Roles(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		roles = list.Items
	} else {
		list, err := clientset.RbacV1().Roles(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
		if err != nil {
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		roles = list.Items
	}

	items := make([]map[string]interface{}, 0, len(roles))
	for _, role := range roles {
		items = append(items, mapRole(role))
	}
	sort.Slice(items, func(i, j int) bool {
		return fmt.Sprint(items[i]["name"]) < fmt.Sprint(items[j]["name"])
	})

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"roles":        items,
		"total":        len(items),
		"cluster_id":   cluster.ID,
		"cluster_name": cluster.Name,
	})
}

func (h *RBACHandler) GetRole(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	role, err := clientset.RbacV1().Roles(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapRole(*role))
}

func (h *RBACHandler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.RbacV1().Roles(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"message": fmt.Sprintf("Role %s/%s 删除成功", namespace, name)})
}

func (h *RBACHandler) ListRoleBindings(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	var bindings []rbacv1.RoleBinding
	if namespace != "" {
		list, err := clientset.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		bindings = list.Items
	} else {
		list, err := clientset.RbacV1().RoleBindings(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
		if err != nil {
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		bindings = list.Items
	}

	items := make([]map[string]interface{}, 0, len(bindings))
	for _, binding := range bindings {
		items = append(items, mapRoleBinding(binding))
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"role_bindings": items,
		"total":         len(items),
		"cluster_id":    cluster.ID,
		"cluster_name":  cluster.Name,
	})
}

func (h *RBACHandler) GetRoleBinding(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	binding, err := clientset.RbacV1().RoleBindings(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapRoleBinding(*binding))
}

func (h *RBACHandler) DeleteRoleBinding(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.RbacV1().RoleBindings(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"message": fmt.Sprintf("RoleBinding %s/%s 删除成功", namespace, name)})
}

func (h *RBACHandler) ListServiceAccounts(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	var serviceAccounts []corev1.ServiceAccount
	if namespace != "" {
		list, err := clientset.CoreV1().ServiceAccounts(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		serviceAccounts = list.Items
	} else {
		list, err := clientset.CoreV1().ServiceAccounts(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
		if err != nil {
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		serviceAccounts = list.Items
	}

	items := make([]map[string]interface{}, 0, len(serviceAccounts))
	for _, sa := range serviceAccounts {
		items = append(items, mapServiceAccount(sa))
	}
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"service_accounts": items,
		"total":            len(items),
		"cluster_id":       cluster.ID,
		"cluster_name":     cluster.Name,
	})
}

func (h *RBACHandler) GetServiceAccount(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	sa, err := clientset.CoreV1().ServiceAccounts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapServiceAccount(*sa))
}

func (h *RBACHandler) DeleteServiceAccount(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().ServiceAccounts(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"message": fmt.Sprintf("ServiceAccount %s/%s 删除成功", namespace, name)})
}
func (h *RBACHandler) ListClusterRoles(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	roles, err := clientset.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(roles.Items))
	for _, role := range roles.Items {
		items = append(items, mapClusterRole(role))
	}
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"cluster_roles": items,
		"total":         len(items),
		"cluster_id":    cluster.ID,
		"cluster_name":  cluster.Name,
	})
}

func (h *RBACHandler) ListClusterRoleBindings(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	bindings, err := clientset.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(bindings.Items))
	for _, binding := range bindings.Items {
		items = append(items, mapClusterRoleBinding(binding))
	}
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"cluster_role_bindings": items,
		"total":                 len(items),
		"cluster_id":            cluster.ID,
		"cluster_name":          cluster.Name,
	})
}

func mapPolicyRules(rules []rbacv1.PolicyRule) []map[string]interface{} {
	items := make([]map[string]interface{}, 0, len(rules))
	for _, rule := range rules {
		items = append(items, map[string]interface{}{
			"api_groups":     rule.APIGroups,
			"resources":      rule.Resources,
			"verbs":          rule.Verbs,
			"resource_names": rule.ResourceNames,
		})
	}
	return items
}

func mapSubjects(subjects []rbacv1.Subject) []map[string]interface{} {
	items := make([]map[string]interface{}, 0, len(subjects))
	for _, subject := range subjects {
		entry := map[string]interface{}{
			"kind":      subject.Kind,
			"name":      subject.Name,
			"namespace": nullIfEmpty(subject.Namespace),
			"api_group": nullIfEmpty(subject.APIGroup),
		}
		items = append(items, entry)
	}
	return items
}

func mapRole(role rbacv1.Role) map[string]interface{} {
	return map[string]interface{}{
		"name":               role.Name,
		"namespace":          role.Namespace,
		"labels":             mapStringStringClone(role.Labels),
		"annotations":        mapStringStringClone(role.Annotations),
		"rules":              mapPolicyRules(role.Rules),
		"creation_timestamp": role.CreationTimestamp.Time.UTC().Format(time.RFC3339),
	}
}

func mapRoleBinding(binding rbacv1.RoleBinding) map[string]interface{} {
	return map[string]interface{}{
		"name":        binding.Name,
		"namespace":   binding.Namespace,
		"labels":      mapStringStringClone(binding.Labels),
		"annotations": mapStringStringClone(binding.Annotations),
		"role_ref": map[string]interface{}{
			"api_group": binding.RoleRef.APIGroup,
			"kind":      binding.RoleRef.Kind,
			"name":      binding.RoleRef.Name,
		},
		"subjects":           mapSubjects(binding.Subjects),
		"creation_timestamp": binding.CreationTimestamp.Time.UTC().Format(time.RFC3339),
	}
}

func mapServiceAccount(sa corev1.ServiceAccount) map[string]interface{} {
	secrets := make([]map[string]interface{}, 0, len(sa.Secrets))
	for _, secret := range sa.Secrets {
		secrets = append(secrets, map[string]interface{}{"name": secret.Name})
	}
	imagePullSecrets := make([]map[string]interface{}, 0, len(sa.ImagePullSecrets))
	for _, secret := range sa.ImagePullSecrets {
		imagePullSecrets = append(imagePullSecrets, map[string]interface{}{"name": secret.Name})
	}

	return map[string]interface{}{
		"name":               sa.Name,
		"namespace":          sa.Namespace,
		"labels":             mapStringStringClone(sa.Labels),
		"annotations":        mapStringStringClone(sa.Annotations),
		"secrets":            secrets,
		"image_pull_secrets": imagePullSecrets,
		"creation_timestamp": sa.CreationTimestamp.Time.UTC().Format(time.RFC3339),
	}
}

func mapClusterRole(role rbacv1.ClusterRole) map[string]interface{} {
	return map[string]interface{}{
		"name":               role.Name,
		"labels":             mapStringStringClone(role.Labels),
		"annotations":        mapStringStringClone(role.Annotations),
		"rules":              mapPolicyRules(role.Rules),
		"creation_timestamp": role.CreationTimestamp.Time.UTC().Format(time.RFC3339),
	}
}

func mapClusterRoleBinding(binding rbacv1.ClusterRoleBinding) map[string]interface{} {
	return map[string]interface{}{
		"name":        binding.Name,
		"labels":      mapStringStringClone(binding.Labels),
		"annotations": mapStringStringClone(binding.Annotations),
		"role_ref": map[string]interface{}{
			"api_group": binding.RoleRef.APIGroup,
			"kind":      binding.RoleRef.Kind,
			"name":      binding.RoleRef.Name,
		},
		"subjects":           mapSubjects(binding.Subjects),
		"creation_timestamp": binding.CreationTimestamp.Time.UTC().Format(time.RFC3339),
	}
}
