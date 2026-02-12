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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

type ConfigMapHandler struct {
	Resolver *K8sResolver
}

func NewConfigMapHandler(resolver *K8sResolver) *ConfigMapHandler {
	return &ConfigMapHandler{Resolver: resolver}
}

func (h *ConfigMapHandler) List(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, false)
}

func (h *ConfigMapHandler) ListPage(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, true)
}

func (h *ConfigMapHandler) listWithPageMode(w http.ResponseWriter, r *http.Request, paged bool) {
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

	var configMaps *corev1.ConfigMapList
	if namespace != "" {
		configMaps, err = clientset.CoreV1().ConfigMaps(namespace).List(ctx, opts)
	} else {
		configMaps, err = clientset.CoreV1().ConfigMaps(metav1.NamespaceAll).List(ctx, opts)
	}
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(configMaps.Items))
	for _, item := range configMaps.Items {
		items = append(items, mapConfigMap(item, cluster.ID, cluster.Name))
	}

	if paged {
		response.Success(w, r, http.StatusOK, map[string]interface{}{
			"items":          items,
			"continue_token": nullIfEmpty(configMaps.Continue),
		})
		return
	}

	response.Success(w, r, http.StatusOK, items)
}

func (h *ConfigMapHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "configmapName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and configmap name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	configMap, err := clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapConfigMap(*configMap, cluster.ID, cluster.Name))
}

type configMapCreateRequest struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Data        map[string]string `json:"data"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	YAMLContent string            `json:"yaml_content"`
	YAML        string            `json:"yaml"`
}

func (h *ConfigMapHandler) Create(w http.ResponseWriter, r *http.Request) {
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	configMap, err := decodeConfigMapPayload(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	created, err := clientset.CoreV1().ConfigMaps(configMap.Namespace).Create(ctx, configMap, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusCreated, mapConfigMap(*created, cluster.ID, cluster.Name))
}

func (h *ConfigMapHandler) CreateYAML(w http.ResponseWriter, r *http.Request) {
	h.Create(w, r)
}

type configMapUpdateRequest struct {
	Data        map[string]string `json:"data"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
}

func (h *ConfigMapHandler) Update(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "configmapName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and configmap name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req configMapUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	current, err := clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	if req.Data != nil {
		current.Data = mapStringStringClone(req.Data)
	}
	if req.Labels != nil {
		current.Labels = mapStringStringClone(req.Labels)
	}
	if req.Annotations != nil {
		current.Annotations = mapStringStringClone(req.Annotations)
	}

	updated, err := clientset.CoreV1().ConfigMaps(namespace).Update(ctx, current, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapConfigMap(*updated, cluster.ID, cluster.Name))
}

func (h *ConfigMapHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "configmapName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and configmap name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := clientset.CoreV1().ConfigMaps(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.NoContent(w)
}

func (h *ConfigMapHandler) GetYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "configmapName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and configmap name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	configMap, err := clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	content, err := yaml.Marshal(configMap)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to marshal configmap")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"yaml": string(content)})
}

func (h *ConfigMapHandler) UpdateYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "configmapName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and configmap name are required")
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

	obj := &corev1.ConfigMap{}
	if err := yaml.Unmarshal([]byte(content), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid configmap yaml")
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

	updated, err := clientset.CoreV1().ConfigMaps(namespace).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapConfigMap(*updated, cluster.ID, cluster.Name))
}

func decodeConfigMapPayload(r *http.Request) (*corev1.ConfigMap, error) {
	var req configMapCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		return nil, fmt.Errorf("invalid request body")
	}

	content := strings.TrimSpace(req.YAMLContent)
	if content == "" {
		content = strings.TrimSpace(req.YAML)
	}
	if content != "" {
		obj := &corev1.ConfigMap{}
		if err := yaml.Unmarshal([]byte(content), obj); err != nil {
			return nil, fmt.Errorf("invalid configmap yaml")
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

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:        name,
			Namespace:   namespace,
			Labels:      mapStringStringClone(req.Labels),
			Annotations: mapStringStringClone(req.Annotations),
		},
		Data: mapStringStringClone(req.Data),
	}
	return obj, nil
}

func mapConfigMap(configMap corev1.ConfigMap, clusterID uint, clusterName string) map[string]interface{} {
	data := mapStringStringClone(configMap.Data)
	if data == nil {
		data = map[string]string{}
	}

	labels := mapStringStringClone(configMap.Labels)
	if labels == nil {
		labels = map[string]string{}
	}

	annotations := mapStringStringClone(configMap.Annotations)
	if annotations == nil {
		annotations = map[string]string{}
	}

	return map[string]interface{}{
		"id":           fmt.Sprintf("%s/%s", configMap.Namespace, configMap.Name),
		"name":         configMap.Name,
		"namespace":    configMap.Namespace,
		"data":         data,
		"labels":       labels,
		"annotations":  annotations,
		"age":          k8s.CalculateAgeFromTime(configMap.CreationTimestamp.Time),
		"cluster_name": clusterName,
		"cluster_id":   clusterID,
	}
}
