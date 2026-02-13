package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type WorkloadHandler struct {
	Resolver *K8sResolver
}

func NewWorkloadHandler(resolver *K8sResolver) *WorkloadHandler {
	return &WorkloadHandler{Resolver: resolver}
}

func (h *WorkloadHandler) resolveClusterClient(r *http.Request) (*models.Cluster, *kubernetes.Clientset, error) {
	clusterIDRaw := strings.TrimSpace(chi.URLParam(r, "clusterID"))
	clusterID, err := parsePathUintParam(clusterIDRaw)
	if err != nil || clusterID == 0 {
		return nil, nil, fmt.Errorf("invalid cluster id")
	}

	user, ok := middleware.CurrentUser(r)
	if !ok {
		return nil, nil, fmt.Errorf("authentication required")
	}

	cluster, err := h.Resolver.Service.GetClusterForUser(clusterID, user)
	if err != nil {
		return nil, nil, err
	}

	cfg, err := k8s.BuildConfig(cluster)
	if err != nil {
		return nil, nil, err
	}
	clientset, err := k8s.NewClientset(cfg)
	if err != nil {
		return nil, nil, err
	}

	return cluster, clientset, nil
}

func (h *WorkloadHandler) ListCronJobs(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	namespace = normalizeWorkloadNamespace(namespace)

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	items, err := clientset.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	result := make([]map[string]interface{}, 0, len(items.Items))
	for _, item := range items.Items {
		result = append(result, mapCronJob(item, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, result)
}

func (h *WorkloadHandler) GetCronJob(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	item, err := clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapCronJobDetails(*item, cluster.ID, cluster.Name))
}

func (h *WorkloadHandler) DeleteCronJob(w http.ResponseWriter, r *http.Request) {
	h.deleteWorkload(w, r, func(ctx context.Context, clientset *kubernetes.Clientset, namespace string, name string) error {
		return clientset.BatchV1().CronJobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	})
}

func (h *WorkloadHandler) ListDaemonSets(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	namespace = normalizeWorkloadNamespace(namespace)

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	items, err := clientset.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	result := make([]map[string]interface{}, 0, len(items.Items))
	for _, item := range items.Items {
		result = append(result, mapDaemonSet(item, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, result)
}

func (h *WorkloadHandler) GetDaemonSet(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	item, err := clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapDaemonSetDetails(*item, cluster.ID, cluster.Name))
}

func (h *WorkloadHandler) DeleteDaemonSet(w http.ResponseWriter, r *http.Request) {
	h.deleteWorkload(w, r, func(ctx context.Context, clientset *kubernetes.Clientset, namespace string, name string) error {
		return clientset.AppsV1().DaemonSets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	})
}

func (h *WorkloadHandler) ListStatefulSets(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	namespace = normalizeWorkloadNamespace(namespace)

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	items, err := clientset.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	result := make([]map[string]interface{}, 0, len(items.Items))
	for _, item := range items.Items {
		result = append(result, mapStatefulSet(item, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, result)
}

func (h *WorkloadHandler) GetStatefulSet(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	item, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapStatefulSetDetails(*item, cluster.ID, cluster.Name))
}

type statefulSetScaleRequest struct {
	Replicas int32 `json:"replicas"`
}

func (h *WorkloadHandler) ScaleStatefulSet(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	var req statefulSetScaleRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Replicas < 0 {
		response.Error(w, r, http.StatusBadRequest, "replicas must be >= 0")
		return
	}

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	item, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}
	item.Spec.Replicas = &req.Replicas

	updated, err := clientset.AppsV1().StatefulSets(namespace).Update(ctx, item, metav1.UpdateOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapStatefulSet(*updated, cluster.ID, cluster.Name))
}

func (h *WorkloadHandler) DeleteStatefulSet(w http.ResponseWriter, r *http.Request) {
	h.deleteWorkload(w, r, func(ctx context.Context, clientset *kubernetes.Clientset, namespace string, name string) error {
		return clientset.AppsV1().StatefulSets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	})
}

func (h *WorkloadHandler) ListHPAs(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	namespace = normalizeWorkloadNamespace(namespace)

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	items, err := clientset.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	result := make([]map[string]interface{}, 0, len(items.Items))
	for _, item := range items.Items {
		result = append(result, mapHPA(item, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, result)
}

func (h *WorkloadHandler) GetHPA(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	item, err := clientset.AutoscalingV2().HorizontalPodAutoscalers(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapHPADetails(*item, cluster.ID, cluster.Name))
}

func (h *WorkloadHandler) DeleteHPA(w http.ResponseWriter, r *http.Request) {
	h.deleteWorkload(w, r, func(ctx context.Context, clientset *kubernetes.Clientset, namespace string, name string) error {
		return clientset.AutoscalingV2().HorizontalPodAutoscalers(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	})
}

func (h *WorkloadHandler) ListIngresses(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	if namespace == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace is required")
		return
	}
	namespace = normalizeWorkloadNamespace(namespace)

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	items, err := clientset.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	result := make([]map[string]interface{}, 0, len(items.Items))
	for _, item := range items.Items {
		result = append(result, mapIngress(item, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, result)
}

func (h *WorkloadHandler) GetIngress(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	cluster, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	item, err := clientset.NetworkingV1().Ingresses(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, mapIngressDetails(*item, cluster.ID, cluster.Name))
}

func (h *WorkloadHandler) DeleteIngress(w http.ResponseWriter, r *http.Request) {
	h.deleteWorkload(w, r, func(ctx context.Context, clientset *kubernetes.Clientset, namespace string, name string) error {
		return clientset.NetworkingV1().Ingresses(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	})
}

func (h *WorkloadHandler) deleteWorkload(
	w http.ResponseWriter,
	r *http.Request,
	deleter func(context.Context, *kubernetes.Clientset, string, string) error,
) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if namespace == "" || name == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and name are required")
		return
	}

	_, clientset, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := deleter(ctx, clientset, namespace, name); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.NoContent(w)
}

func normalizeWorkloadNamespace(namespace string) string {
	switch strings.ToLower(strings.TrimSpace(namespace)) {
	case "*", "all", "__all__":
		return metav1.NamespaceAll
	default:
		return namespace
	}
}

func mapCronJob(item batchv1.CronJob, clusterID uint, clusterName string) map[string]interface{} {
	lastSchedule := interface{}(nil)
	if item.Status.LastScheduleTime != nil {
		lastSchedule = item.Status.LastScheduleTime.Time.UTC().Format(time.RFC3339)
	}
	return map[string]interface{}{
		"name":               item.Name,
		"namespace":          item.Namespace,
		"schedule":           item.Spec.Schedule,
		"suspend":            valueBool(item.Spec.Suspend),
		"active":             len(item.Status.Active),
		"last_schedule_time": lastSchedule,
		"age":                k8s.CalculateAgeFromTime(item.CreationTimestamp.Time),
		"labels":             mapStringStringClone(item.Labels),
		"cluster_id":         clusterID,
		"cluster_name":       clusterName,
	}
}

func mapCronJobDetails(item batchv1.CronJob, clusterID uint, clusterName string) map[string]interface{} {
	base := mapCronJob(item, clusterID, clusterName)
	activeJobs := make([]string, 0, len(item.Status.Active))
	for _, ref := range item.Status.Active {
		activeJobs = append(activeJobs, ref.Name)
	}
	sort.Strings(activeJobs)
	base["concurrency_policy"] = string(item.Spec.ConcurrencyPolicy)
	base["starting_deadline_seconds"] = item.Spec.StartingDeadlineSeconds
	base["successful_jobs_history_limit"] = item.Spec.SuccessfulJobsHistoryLimit
	base["failed_jobs_history_limit"] = item.Spec.FailedJobsHistoryLimit
	base["active_jobs"] = activeJobs
	base["creation_timestamp"] = item.CreationTimestamp.Time.UTC().Format(time.RFC3339)
	base["annotations"] = mapStringStringClone(item.Annotations)
	return base
}

func mapDaemonSet(item appsv1.DaemonSet, clusterID uint, clusterName string) map[string]interface{} {
	selector := map[string]string{}
	if item.Spec.Selector != nil {
		selector = mapStringStringClone(item.Spec.Selector.MatchLabels)
	}
	return map[string]interface{}{
		"name":         item.Name,
		"namespace":    item.Namespace,
		"desired":      item.Status.DesiredNumberScheduled,
		"current":      item.Status.CurrentNumberScheduled,
		"ready":        item.Status.NumberReady,
		"up_to_date":   item.Status.UpdatedNumberScheduled,
		"updated":      item.Status.UpdatedNumberScheduled,
		"available":    item.Status.NumberAvailable,
		"age":          k8s.CalculateAgeFromTime(item.CreationTimestamp.Time),
		"labels":       mapStringStringClone(item.Labels),
		"selector":     selector,
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapDaemonSetDetails(item appsv1.DaemonSet, clusterID uint, clusterName string) map[string]interface{} {
	base := mapDaemonSet(item, clusterID, clusterName)
	base["creation_timestamp"] = item.CreationTimestamp.Time.UTC().Format(time.RFC3339)
	base["annotations"] = mapStringStringClone(item.Annotations)
	return base
}

func mapStatefulSet(item appsv1.StatefulSet, clusterID uint, clusterName string) map[string]interface{} {
	replicas := int32(0)
	if item.Spec.Replicas != nil {
		replicas = *item.Spec.Replicas
	}
	selector := map[string]string{}
	if item.Spec.Selector != nil {
		selector = mapStringStringClone(item.Spec.Selector.MatchLabels)
	}
	return map[string]interface{}{
		"name":             item.Name,
		"namespace":        item.Namespace,
		"replicas":         replicas,
		"ready_replicas":   item.Status.ReadyReplicas,
		"current_replicas": item.Status.CurrentReplicas,
		"updated_replicas": item.Status.UpdatedReplicas,
		"age":              k8s.CalculateAgeFromTime(item.CreationTimestamp.Time),
		"labels":           mapStringStringClone(item.Labels),
		"selector":         selector,
		"cluster_id":       clusterID,
		"cluster_name":     clusterName,
	}
}

func mapStatefulSetDetails(item appsv1.StatefulSet, clusterID uint, clusterName string) map[string]interface{} {
	base := mapStatefulSet(item, clusterID, clusterName)
	base["service_name"] = item.Spec.ServiceName
	base["creation_timestamp"] = item.CreationTimestamp.Time.UTC().Format(time.RFC3339)
	base["annotations"] = mapStringStringClone(item.Annotations)
	return base
}

func mapHPA(item autoscalingv2.HorizontalPodAutoscaler, clusterID uint, clusterName string) map[string]interface{} {
	minReplicas := int32(1)
	if item.Spec.MinReplicas != nil {
		minReplicas = *item.Spec.MinReplicas
	}
	reference := map[string]interface{}{
		"kind": item.Spec.ScaleTargetRef.Kind,
		"name": item.Spec.ScaleTargetRef.Name,
	}
	targetRef := fmt.Sprintf("%s/%s", item.Spec.ScaleTargetRef.Kind, item.Spec.ScaleTargetRef.Name)
	return map[string]interface{}{
		"name":             item.Name,
		"namespace":        item.Namespace,
		"reference":        reference,
		"target_ref":       targetRef,
		"min_replicas":     minReplicas,
		"max_replicas":     item.Spec.MaxReplicas,
		"current_replicas": item.Status.CurrentReplicas,
		"desired_replicas": item.Status.DesiredReplicas,
		"metrics":          mapHPAMetrics(item),
		"age":              k8s.CalculateAgeFromTime(item.CreationTimestamp.Time),
		"labels":           mapStringStringClone(item.Labels),
		"cluster_id":       clusterID,
		"cluster_name":     clusterName,
	}
}

func mapHPADetails(item autoscalingv2.HorizontalPodAutoscaler, clusterID uint, clusterName string) map[string]interface{} {
	base := mapHPA(item, clusterID, clusterName)
	base["creation_timestamp"] = item.CreationTimestamp.Time.UTC().Format(time.RFC3339)
	base["annotations"] = mapStringStringClone(item.Annotations)
	return base
}

func mapHPAMetrics(item autoscalingv2.HorizontalPodAutoscaler) []map[string]interface{} {
	metrics := make([]map[string]interface{}, 0, len(item.Spec.Metrics))
	for _, metric := range item.Spec.Metrics {
		entry := map[string]interface{}{"type": string(metric.Type), "current": "-", "target": "-"}
		switch metric.Type {
		case autoscalingv2.ResourceMetricSourceType:
			if metric.Resource != nil {
				entry["type"] = fmt.Sprintf("Resource(%s)", metric.Resource.Name)
				if metric.Resource.Target.AverageUtilization != nil {
					entry["target"] = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
				} else if metric.Resource.Target.AverageValue != nil {
					entry["target"] = metric.Resource.Target.AverageValue.String()
				} else if metric.Resource.Target.Value != nil {
					entry["target"] = metric.Resource.Target.Value.String()
				}
			}
		case autoscalingv2.PodsMetricSourceType:
			if metric.Pods != nil {
				entry["type"] = fmt.Sprintf("Pods(%s)", metric.Pods.Metric.Name)
				entry["target"] = metric.Pods.Target.AverageValue.String()
			}
		case autoscalingv2.ObjectMetricSourceType:
			if metric.Object != nil {
				entry["type"] = fmt.Sprintf("Object(%s)", metric.Object.Metric.Name)
				if metric.Object.Target.Value != nil {
					entry["target"] = metric.Object.Target.Value.String()
				} else if metric.Object.Target.AverageValue != nil {
					entry["target"] = metric.Object.Target.AverageValue.String()
				}
			}
		}
		metrics = append(metrics, entry)
	}
	return metrics
}

func mapIngress(item networkingv1.Ingress, clusterID uint, clusterName string) map[string]interface{} {
	hosts := make([]string, 0, len(item.Spec.Rules))
	for _, rule := range item.Spec.Rules {
		host := strings.TrimSpace(rule.Host)
		if host != "" {
			hosts = append(hosts, host)
		}
	}
	addresses := make([]string, 0, len(item.Status.LoadBalancer.Ingress))
	for _, ingress := range item.Status.LoadBalancer.Ingress {
		if ingress.IP != "" {
			addresses = append(addresses, ingress.IP)
		} else if ingress.Hostname != "" {
			addresses = append(addresses, ingress.Hostname)
		}
	}
	className := ""
	if item.Spec.IngressClassName != nil {
		className = *item.Spec.IngressClassName
	}
	address := ""
	if len(addresses) > 0 {
		address = addresses[0]
	}

	rules := []map[string]interface{}{}
	_ = convertViaJSON(item.Spec.Rules, &rules)

	return map[string]interface{}{
		"name":         item.Name,
		"namespace":    item.Namespace,
		"class":        className,
		"hosts":        hosts,
		"address":      address,
		"addresses":    addresses,
		"ports":        "80",
		"labels":       mapStringStringClone(item.Labels),
		"rules":        rules,
		"age":          k8s.CalculateAgeFromTime(item.CreationTimestamp.Time),
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapIngressDetails(item networkingv1.Ingress, clusterID uint, clusterName string) map[string]interface{} {
	base := mapIngress(item, clusterID, clusterName)
	base["creation_timestamp"] = item.CreationTimestamp.Time.UTC().Format(time.RFC3339)
	base["annotations"] = mapStringStringClone(item.Annotations)
	tls := []map[string]interface{}{}
	_ = convertViaJSON(item.Spec.TLS, &tls)
	base["tls"] = tls
	base["ingress_class_name"] = base["class"]
	return base
}

func valueBool(v *bool) bool {
	if v == nil {
		return false
	}
	return *v
}
