package handlers

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

type SecretHandler struct {
	Resolver *K8sResolver
}

func NewSecretHandler(resolver *K8sResolver) *SecretHandler {
	return &SecretHandler{Resolver: resolver}
}

func (h *SecretHandler) List(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, false)
}

func (h *SecretHandler) ListPage(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, true)
}

func (h *SecretHandler) listWithPageMode(w http.ResponseWriter, r *http.Request, paged bool) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	limit := int64(parseIntWithDefault(r.URL.Query().Get("limit"), 100))
	if limit <= 0 {
		limit = 100
	}
	continueToken := strings.TrimSpace(r.URL.Query().Get("continue_token"))
	labelSelector := strings.TrimSpace(r.URL.Query().Get("label_selector"))
	fieldSelector := strings.TrimSpace(r.URL.Query().Get("field_selector"))

	opts := metav1.ListOptions{LabelSelector: labelSelector, FieldSelector: fieldSelector}
	if paged {
		opts.Limit = limit
		opts.Continue = continueToken
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var secrets *corev1.SecretList
	if namespace != "" {
		secrets, err = clientset.CoreV1().Secrets(namespace).List(ctx, opts)
	} else {
		secrets, err = clientset.CoreV1().Secrets(metav1.NamespaceAll).List(ctx, opts)
	}
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(secrets.Items))
	for _, secret := range secrets.Items {
		items = append(items, mapSecretSummary(secret, cluster.ID, cluster.Name))
	}

	if paged {
		response.Success(w, r, http.StatusOK, map[string]interface{}{
			"items":          items,
			"continue_token": nullIfEmpty(secrets.Continue),
		})
		return
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *SecretHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "secretName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and secret name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	secret, err := clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapSecretDetails(*secret, cluster.ID, cluster.Name))
}

type secretCreateRequest struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Type        string            `json:"type"`
	Data        map[string]string `json:"data"`
	StringData  map[string]string `json:"string_data"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	YAMLContent string            `json:"yaml_content"`
	YAML        string            `json:"yaml"`
}

func (h *SecretHandler) Create(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	secret, err := decodeSecretPayload(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	created, err := clientset.CoreV1().Secrets(secret.Namespace).Create(ctx, secret, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusCreated, mapSecretSummary(*created, cluster.ID, cluster.Name))
}

func (h *SecretHandler) CreateYAML(w http.ResponseWriter, r *http.Request) {
	h.Create(w, r)
}

type secretUpdateRequest struct {
	Type        *string           `json:"type"`
	Data        map[string]string `json:"data"`
	StringData  map[string]string `json:"string_data"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
}

func (h *SecretHandler) Update(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "secretName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and secret name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req secretUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	current, err := clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	if req.Type != nil {
		current.Type = corev1.SecretType(strings.TrimSpace(*req.Type))
	}
	if req.Data != nil {
		current.Data = encodeSecretData(req.Data)
	}
	if req.StringData != nil {
		if current.StringData == nil {
			current.StringData = map[string]string{}
		}
		for key, value := range req.StringData {
			current.StringData[key] = value
		}
	}
	if req.Labels != nil {
		current.Labels = mapStringStringClone(req.Labels)
	}
	if req.Annotations != nil {
		current.Annotations = mapStringStringClone(req.Annotations)
	}

	updated, err := clientset.CoreV1().Secrets(namespace).Update(ctx, current, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapSecretSummary(*updated, cluster.ID, cluster.Name))
}

func (h *SecretHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "secretName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and secret name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := clientset.CoreV1().Secrets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.NoContent(w)
}

func (h *SecretHandler) GetYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "secretName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and secret name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	secret, err := clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	content, err := yaml.Marshal(secret)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to marshal secret")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"yaml": string(content)})
}

func (h *SecretHandler) UpdateYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "secretName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and secret name are required")
		return
	}

	var req yamlUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	content := strings.TrimSpace(req.YAMLContent)
	if content == "" {
		content = strings.TrimSpace(req.YAML)
	}
	if content == "" {
		response.Error(w, r, http.StatusBadRequest, "yaml content is required")
		return
	}

	obj := &corev1.Secret{}
	if err := yaml.Unmarshal([]byte(content), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid secret yaml")
		return
	}
	obj.Namespace = namespace
	obj.Name = name

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	updated, err := clientset.CoreV1().Secrets(namespace).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapSecretSummary(*updated, cluster.ID, cluster.Name))
}

func decodeSecretPayload(r *http.Request) (*corev1.Secret, error) {
	var req secretCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		return nil, fmt.Errorf("invalid request body")
	}

	content := strings.TrimSpace(req.YAMLContent)
	if content == "" {
		content = strings.TrimSpace(req.YAML)
	}
	if content != "" {
		obj := &corev1.Secret{}
		if err := yaml.Unmarshal([]byte(content), obj); err != nil {
			return nil, fmt.Errorf("invalid secret yaml")
		}
		if strings.TrimSpace(obj.Namespace) == "" {
			return nil, fmt.Errorf("metadata.namespace is required")
		}
		if strings.TrimSpace(obj.Name) == "" {
			return nil, fmt.Errorf("metadata.name is required")
		}
		return obj, nil
	}

	name := strings.TrimSpace(req.Name)
	namespace := strings.TrimSpace(req.Namespace)
	if name == "" || namespace == "" {
		return nil, fmt.Errorf("name and namespace are required")
	}

	secretType := strings.TrimSpace(req.Type)
	if secretType == "" {
		secretType = string(corev1.SecretTypeOpaque)
	}

	obj := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:        name,
			Namespace:   namespace,
			Labels:      mapStringStringClone(req.Labels),
			Annotations: mapStringStringClone(req.Annotations),
		},
		Type:       corev1.SecretType(secretType),
		Data:       encodeSecretData(req.Data),
		StringData: mapStringStringClone(req.StringData),
	}
	return obj, nil
}

func encodeSecretData(input map[string]string) map[string][]byte {
	if len(input) == 0 {
		return map[string][]byte{}
	}
	out := make(map[string][]byte, len(input))
	for key, value := range input {
		if decoded, err := base64.StdEncoding.DecodeString(value); err == nil {
			out[key] = decoded
			continue
		}
		out[key] = []byte(value)
	}
	return out
}

func mapSecretSummary(secret corev1.Secret, clusterID uint, clusterName string) map[string]interface{} {
	keys := make([]string, 0, len(secret.Data))
	for key := range secret.Data {
		keys = append(keys, key)
	}
	labels := mapStringStringClone(secret.Labels)
	annotations := mapStringStringClone(secret.Annotations)

	return map[string]interface{}{
		"name":         secret.Name,
		"namespace":    secret.Namespace,
		"type":         string(secret.Type),
		"data_keys":    keys,
		"labels":       labels,
		"annotations":  annotations,
		"age":          k8s.CalculateAgeFromTime(secret.CreationTimestamp.Time),
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapSecretDetails(secret corev1.Secret, clusterID uint, clusterName string) map[string]interface{} {
	payload := mapSecretSummary(secret, clusterID, clusterName)
	decoded := map[string]string{}
	for key, value := range secret.Data {
		decoded[key] = string(value)
	}
	payload["data"] = decoded
	return payload
}
