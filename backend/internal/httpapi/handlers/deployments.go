package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"github.com/go-chi/chi/v5"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

type DeploymentHandler struct {
	Resolver *K8sResolver
}

func NewDeploymentHandler(resolver *K8sResolver) *DeploymentHandler {
	return &DeploymentHandler{Resolver: resolver}
}

func (h *DeploymentHandler) List(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, false)
}

func (h *DeploymentHandler) ListPage(w http.ResponseWriter, r *http.Request) {
	h.listWithPageMode(w, r, true)
}

func (h *DeploymentHandler) listWithPageMode(w http.ResponseWriter, r *http.Request, paged bool) {
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

	opts := metav1.ListOptions{LabelSelector: labelSelector}
	if paged {
		opts.Limit = limit
		opts.Continue = continueToken
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var deps *appsv1.DeploymentList
	if namespace != "" {
		deps, err = clientset.AppsV1().Deployments(namespace).List(ctx, opts)
	} else {
		deps, err = clientset.AppsV1().Deployments("").List(ctx, opts)
	}
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(deps.Items))
	for _, dep := range deps.Items {
		items = append(items, mapDeployment(dep, cluster.ID, cluster.Name))
	}

	if paged {
		response.Success(w, r, http.StatusOK, map[string]interface{}{
			"items":          items,
			"continue_token": nullIfEmpty(deps.Continue),
		})
		return
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *DeploymentHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapDeploymentDetails(*dep, cluster.ID, cluster.Name))
}

func (h *DeploymentHandler) Pods(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	selector := metav1.FormatLabelSelector(dep.Spec.Selector)
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(pods.Items))
	for _, pod := range pods.Items {
		items = append(items, mapPodSummary(pod, cluster.ID, cluster.Name))
	}
	response.Success(w, r, http.StatusOK, items)
}

type deploymentCreateRequest struct {
	YAMLContent string `json:"yaml_content"`
	YAML        string `json:"yaml"`
}

func (h *DeploymentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req deploymentCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	content := strings.TrimSpace(req.YAMLContent)
	if content == "" {
		content = strings.TrimSpace(req.YAML)
	}
	if content == "" {
		response.Error(w, r, http.StatusBadRequest, "yaml_content is required")
		return
	}

	obj := &appsv1.Deployment{}
	if err := yaml.Unmarshal([]byte(content), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid deployment yaml: "+err.Error())
		return
	}
	if strings.TrimSpace(obj.Name) == "" {
		response.Error(w, r, http.StatusBadRequest, "metadata.name is required")
		return
	}
	if strings.TrimSpace(obj.Namespace) == "" {
		response.Error(w, r, http.StatusBadRequest, "metadata.namespace is required")
		return
	}

	obj.ResourceVersion = ""
	obj.UID = ""
	obj.CreationTimestamp = metav1.Time{}
	obj.ManagedFields = nil
	obj.Generation = 0
	obj.SelfLink = ""
	obj.Status = appsv1.DeploymentStatus{}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	created, err := clientset.AppsV1().Deployments(obj.Namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusCreated, mapDeployment(*created, cluster.ID, cluster.Name))
}

type scaleRequest struct {
	Replicas int32 `json:"replicas"`
}

func (h *DeploymentHandler) Scale(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}
	var req scaleRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Replicas < 0 {
		response.Error(w, r, http.StatusBadRequest, "replicas must be >= 0")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	dep.Spec.Replicas = &req.Replicas
	updated, err := clientset.AppsV1().Deployments(namespace).Update(ctx, dep, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapDeployment(*updated, cluster.ID, cluster.Name))
}

func (h *DeploymentHandler) Restart(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	if dep.Spec.Template.Annotations == nil {
		dep.Spec.Template.Annotations = map[string]string{}
	}
	dep.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().UTC().Format(time.RFC3339)
	if _, err := clientset.AppsV1().Deployments(namespace).Update(ctx, dep, metav1.UpdateOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"message": "deployment restarted"})
}

func (h *DeploymentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}
	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.NoContent(w)
}

type deploymentPatchRequest map[string]interface{}

func (h *DeploymentHandler) Update(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}
	var req deploymentPatchRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	if replicasVal, ok := req["replicas"]; ok {
		rep, ok := toInt32(replicasVal)
		if ok {
			dep.Spec.Replicas = &rep
		}
	}
	if labelsVal, ok := req["labels"]; ok {
		if labels, ok := labelsVal.(map[string]interface{}); ok {
			if dep.Labels == nil {
				dep.Labels = map[string]string{}
			}
			for k, v := range labels {
				dep.Labels[k] = fmt.Sprint(v)
			}
		}
	}

	updated, err := clientset.AppsV1().Deployments(namespace).Update(ctx, dep, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapDeployment(*updated, cluster.ID, cluster.Name))
}

func (h *DeploymentHandler) GetYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}
	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	out, err := yaml.Marshal(dep)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to marshal deployment")
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"yaml": string(out)})
}

type yamlUpdateRequest struct {
	YAMLContent string `json:"yaml_content"`
	YAML        string `json:"yaml"`
}

func (h *DeploymentHandler) UpdateYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
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

	obj := &appsv1.Deployment{}
	if err := yaml.Unmarshal([]byte(content), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid deployment yaml")
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
	updated, err := clientset.AppsV1().Deployments(namespace).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapDeployment(*updated, cluster.ID, cluster.Name))
}

func (h *DeploymentHandler) Services(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and deployment name are required")
		return
	}
	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	svcs, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0)
	for _, svc := range svcs.Items {
		if serviceTargetsDeployment(svc, dep) {
			mapped := mapService(svc, cluster.ID, cluster.Name)
			items = append(items, mapped)
		}
	}
	response.Success(w, r, http.StatusOK, items)
}

func (h *DeploymentHandler) GetServiceYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	serviceName := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || serviceName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	svc, err := clientset.CoreV1().Services(namespace).Get(ctx, serviceName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	out, err := yaml.Marshal(svc)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to marshal service")
		return
	}
	response.Success(w, r, http.StatusOK, map[string]string{"yaml": string(out)})
}

func (h *DeploymentHandler) UpdateServiceYAML(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	serviceName := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || serviceName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	var req yamlUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	content := strings.TrimSpace(req.YAML)
	if content == "" {
		content = strings.TrimSpace(req.YAMLContent)
	}
	if content == "" {
		response.Error(w, r, http.StatusBadRequest, "yaml content is required")
		return
	}
	obj := &corev1.Service{}
	if err := yaml.Unmarshal([]byte(content), obj); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid service yaml")
		return
	}
	obj.Namespace = namespace
	obj.Name = serviceName

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	updated, err := clientset.CoreV1().Services(namespace).Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.Success(w, r, http.StatusOK, mapService(*updated, cluster.ID, cluster.Name))
}

func (h *DeploymentHandler) DeleteService(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	serviceName := strings.TrimSpace(chi.URLParam(r, "serviceName"))
	if namespace == "" || serviceName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and service name are required")
		return
	}
	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().Services(namespace).Delete(ctx, serviceName, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.NoContent(w)
}

func mapDeployment(dep appsv1.Deployment, clusterID uint, clusterName string) map[string]interface{} {
	replicas := int32(0)
	if dep.Spec.Replicas != nil {
		replicas = *dep.Spec.Replicas
	}
	selector := map[string]string{}
	if dep.Spec.Selector != nil && dep.Spec.Selector.MatchLabels != nil {
		selector = dep.Spec.Selector.MatchLabels
	}
	strategy := string(dep.Spec.Strategy.Type)
	if strategy == "" {
		strategy = "RollingUpdate"
	}
	return map[string]interface{}{
		"name":                 dep.Name,
		"namespace":            dep.Namespace,
		"replicas":             replicas,
		"ready_replicas":       dep.Status.ReadyReplicas,
		"available_replicas":   dep.Status.AvailableReplicas,
		"unavailable_replicas": dep.Status.UnavailableReplicas,
		"age":                  k8s.CalculateAgeFromTime(dep.CreationTimestamp.Time),
		"labels":               dep.Labels,
		"selector":             selector,
		"strategy":             strategy,
		"cluster_id":           clusterID,
		"cluster_name":         clusterName,
	}
}

func mapDeploymentDetails(dep appsv1.Deployment, clusterID uint, clusterName string) map[string]interface{} {
	base := mapDeployment(dep, clusterID, clusterName)

	containers := make([]map[string]interface{}, 0, len(dep.Spec.Template.Spec.Containers))
	for _, c := range dep.Spec.Template.Spec.Containers {
		ports := make([]map[string]interface{}, 0, len(c.Ports))
		for _, p := range c.Ports {
			ports = append(ports, map[string]interface{}{"containerPort": p.ContainerPort, "protocol": string(p.Protocol)})
		}
		env := make([]map[string]interface{}, 0, len(c.Env))
		for _, e := range c.Env {
			item := map[string]interface{}{"name": e.Name, "value": e.Value}
			if e.ValueFrom != nil {
				item["valueFrom"] = e.ValueFrom
			}
			env = append(env, item)
		}
		resources := map[string]interface{}{}
		if c.Resources.Requests != nil {
			resources["requests"] = quantityMapToStringMap(c.Resources.Requests)
		}
		if c.Resources.Limits != nil {
			resources["limits"] = quantityMapToStringMap(c.Resources.Limits)
		}
		containers = append(containers, map[string]interface{}{
			"name":      c.Name,
			"image":     c.Image,
			"ports":     ports,
			"resources": resources,
			"env":       env,
		})
	}

	conditions := make([]map[string]interface{}, 0, len(dep.Status.Conditions))
	for _, c := range dep.Status.Conditions {
		conditions = append(conditions, map[string]interface{}{
			"type":               c.Type,
			"status":             c.Status,
			"reason":             c.Reason,
			"message":            c.Message,
			"lastUpdateTime":     c.LastUpdateTime,
			"lastTransitionTime": c.LastTransitionTime,
		})
	}
	base["containers"] = containers
	base["conditions"] = conditions
	return base
}

func serviceTargetsDeployment(service corev1.Service, deployment *appsv1.Deployment) bool {
	if deployment == nil || service.Spec.Selector == nil {
		return false
	}
	labels := deployment.Spec.Template.Labels
	for k, v := range service.Spec.Selector {
		if labels[k] != v {
			return false
		}
	}
	return len(service.Spec.Selector) > 0
}

func toInt32(v interface{}) (int32, bool) {
	switch n := v.(type) {
	case float64:
		return int32(n), true
	case int:
		return int32(n), true
	case int32:
		return n, true
	case int64:
		return int32(n), true
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(n))
		if err != nil {
			return 0, false
		}
		return int32(parsed), true
	default:
		return 0, false
	}
}
