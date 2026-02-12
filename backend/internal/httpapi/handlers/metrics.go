package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	aggregatorv1 "k8s.io/kube-aggregator/pkg/apis/apiregistration/v1"
	aggregatorclientset "k8s.io/kube-aggregator/pkg/client/clientset_generated/clientset"
)

type MetricsHandler struct {
	Resolver *K8sResolver
}

func NewMetricsHandler(resolver *K8sResolver) *MetricsHandler {
	return &MetricsHandler{Resolver: resolver}
}

type metricsClientBundle struct {
	Config    *rest.Config
	Clientset *kubernetes.Clientset
}

func (h *MetricsHandler) resolveClusterClient(r *http.Request) (*models.Cluster, *metricsClientBundle, error) {
	clusterIDRaw := strings.TrimSpace(chi.URLParam(r, "clusterID"))
	clusterID, err := strconv.ParseUint(clusterIDRaw, 10, 64)
	if err != nil || clusterID == 0 {
		return nil, nil, fmt.Errorf("invalid cluster id")
	}

	user, ok := middleware.CurrentUser(r)
	if !ok {
		return nil, nil, fmt.Errorf("authentication required")
	}

	cluster, err := h.Resolver.Service.GetClusterForUser(uint(clusterID), user)
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

	return cluster, &metricsClientBundle{Config: cfg, Clientset: clientset}, nil
}

func (h *MetricsHandler) CheckHealth(w http.ResponseWriter, r *http.Request) {
	cluster, bundle, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	available := checkMetricsAvailable(r.Context(), bundle.Clientset)
	status := "unavailable"
	message := "metrics-server is not available"
	if available {
		status = "healthy"
		message = "metrics-server is available"
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"status":                   status,
		"message":                  message,
		"metrics_server_installed": available,
		"available":                available,
		"cluster_id":               cluster.ID,
		"cluster_name":             cluster.Name,
	})
}

func (h *MetricsHandler) ClusterMetrics(w http.ResponseWriter, r *http.Request) {
	cluster, bundle, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	nodeMetrics, err := getNodeMetricsRaw(r.Context(), bundle.Clientset)
	if err != nil {
		response.Error(w, r, http.StatusServiceUnavailable, "无法获取集群指标，请确保metrics-server已部署")
		return
	}

	totalCPU := 0.0
	totalMemoryMi := int64(0)
	for _, item := range nodeMetrics {
		totalCPU += item.CPUCores
		totalMemoryMi += item.MemoryMi
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	nodes, err := bundle.Clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	pods, err := bundle.Clientset.CoreV1().Pods(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"cluster_id":   cluster.ID,
		"cluster_name": cluster.Name,
		"cpu_usage":    fmt.Sprintf("%.2f", totalCPU),
		"memory_usage": fmt.Sprintf("%dMi", totalMemoryMi),
		"pod_count":    len(pods.Items),
		"node_count":   len(nodes.Items),
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *MetricsHandler) NodeMetrics(w http.ResponseWriter, r *http.Request) {
	_, bundle, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	metrics, err := getNodeMetricsRaw(r.Context(), bundle.Clientset)
	if err != nil {
		response.Error(w, r, http.StatusServiceUnavailable, "无法获取节点指标，请确保metrics-server已部署")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	nodes, err := bundle.Clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	capacityCPU := map[string]float64{}
	capacityMemoryMi := map[string]int64{}
	for _, node := range nodes.Items {
		cpuQty := node.Status.Capacity[corev1.ResourceCPU]
		memQty := node.Status.Capacity[corev1.ResourceMemory]
		capacityCPU[node.Name] = cpuQty.AsApproximateFloat64()
		capacityMemoryMi[node.Name] = memQty.Value() / (1024 * 1024)
	}

	items := make([]map[string]interface{}, 0, len(metrics))
	for _, metric := range metrics {
		cpuCap := capacityCPU[metric.Name]
		memCap := capacityMemoryMi[metric.Name]
		cpuPercent := 0.0
		memPercent := 0.0
		if cpuCap > 0 {
			cpuPercent = metric.CPUCores / cpuCap * 100
		}
		if memCap > 0 {
			memPercent = float64(metric.MemoryMi) / float64(memCap) * 100
		}

		items = append(items, map[string]interface{}{
			"name":              metric.Name,
			"cpu_usage":         fmt.Sprintf("%.2f", metric.CPUCores),
			"memory_usage":      fmt.Sprintf("%dMi", metric.MemoryMi),
			"cpu_percentage":    round2(cpuPercent),
			"memory_percentage": round2(memPercent),
			"timestamp":         metric.Timestamp,
		})
	}

	response.Success(w, r, http.StatusOK, items)
}

type installMetricsServerRequest struct {
	Image       string `json:"image"`
	InsecureTLS bool   `json:"insecure_tls"`
}

func (h *MetricsHandler) InstallMetricsServer(w http.ResponseWriter, r *http.Request) {
	cluster, bundle, err := h.resolveClusterClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	var req installMetricsServerRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Image) == "" {
		req.Image = "registry.k8s.io/metrics-server/metrics-server:v0.7.0"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	if err := ensureMetricsServerResources(ctx, bundle, req.Image, req.InsecureTLS); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"success":      true,
		"message":      "metrics-server安装成功",
		"cluster_id":   cluster.ID,
		"cluster_name": cluster.Name,
	})
}

func ensureMetricsServerResources(ctx context.Context, bundle *metricsClientBundle, image string, insecureTLS bool) error {
	coreAPI := bundle.Clientset.CoreV1()
	appsAPI := bundle.Clientset.AppsV1()
	rbacAPI := bundle.Clientset.RbacV1()

	serviceAccount := &corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "metrics-server", Namespace: "kube-system"}}
	if _, err := coreAPI.ServiceAccounts("kube-system").Create(ctx, serviceAccount, metav1.CreateOptions{}); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}

	clusterRole := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: "system:metrics-server"},
		Rules: []rbacv1.PolicyRule{
			{APIGroups: []string{""}, Resources: []string{"nodes/metrics"}, Verbs: []string{"get"}},
			{APIGroups: []string{""}, Resources: []string{"pods", "nodes"}, Verbs: []string{"get", "list", "watch"}},
		},
	}
	if _, err := rbacAPI.ClusterRoles().Create(ctx, clusterRole, metav1.CreateOptions{}); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}

	clusterRoleBinding := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "metrics-server:system:auth-delegator"},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: "system:metrics-server"},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: "metrics-server", Namespace: "kube-system"}},
	}
	if _, err := rbacAPI.ClusterRoleBindings().Create(ctx, clusterRoleBinding, metav1.CreateOptions{}); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}

	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "metrics-server", Namespace: "kube-system", Labels: map[string]string{"k8s-app": "metrics-server"}},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"k8s-app": "metrics-server"},
			Ports:    []corev1.ServicePort{{Name: "https", Port: 443, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt(4443)}},
		},
	}
	if _, err := coreAPI.Services("kube-system").Create(ctx, service, metav1.CreateOptions{}); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}

	args := []string{
		"--cert-dir=/tmp",
		"--secure-port=4443",
		"--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname",
		"--kubelet-use-node-status-port",
		"--metric-resolution=15s",
	}
	if insecureTLS {
		args = append(args, "--kubelet-insecure-tls")
	}

	replicas := int32(1)
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "metrics-server", Namespace: "kube-system", Labels: map[string]string{"k8s-app": "metrics-server"}},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"k8s-app": "metrics-server"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"k8s-app": "metrics-server"}},
				Spec: corev1.PodSpec{
					ServiceAccountName: "metrics-server",
					Containers: []corev1.Container{{
						Name:         "metrics-server",
						Image:        image,
						Args:         args,
						Ports:        []corev1.ContainerPort{{ContainerPort: 4443, Name: "https", Protocol: corev1.ProtocolTCP}},
						VolumeMounts: []corev1.VolumeMount{{Name: "tmp-dir", MountPath: "/tmp"}},
						Resources: corev1.ResourceRequirements{Requests: corev1.ResourceList{
							corev1.ResourceCPU:    resource.MustParse("100m"),
							corev1.ResourceMemory: resource.MustParse("200Mi"),
						}},
					}},
					Volumes: []corev1.Volume{{Name: "tmp-dir", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}}},
				},
			},
		},
	}

	if _, err := appsAPI.Deployments("kube-system").Create(ctx, deployment, metav1.CreateOptions{}); err != nil {
		if !apierrors.IsAlreadyExists(err) {
			return err
		}
		existing, gerr := appsAPI.Deployments("kube-system").Get(ctx, "metrics-server", metav1.GetOptions{})
		if gerr != nil {
			return gerr
		}
		deployment.ResourceVersion = existing.ResourceVersion
		if _, uerr := appsAPI.Deployments("kube-system").Update(ctx, deployment, metav1.UpdateOptions{}); uerr != nil {
			return uerr
		}
	}

	aggregatorClient, err := aggregatorclientset.NewForConfig(bundle.Config)
	if err != nil {
		return err
	}

	apiService := &aggregatorv1.APIService{
		ObjectMeta: metav1.ObjectMeta{Name: "v1beta1.metrics.k8s.io"},
		Spec: aggregatorv1.APIServiceSpec{
			Service:               &aggregatorv1.ServiceReference{Name: "metrics-server", Namespace: "kube-system"},
			Group:                 "metrics.k8s.io",
			Version:               "v1beta1",
			InsecureSkipTLSVerify: insecureTLS,
			GroupPriorityMinimum:  100,
			VersionPriority:       100,
		},
	}

	if _, err := aggregatorClient.ApiregistrationV1().APIServices().Create(ctx, apiService, metav1.CreateOptions{}); err != nil {
		if !apierrors.IsAlreadyExists(err) {
			return err
		}
		existing, gerr := aggregatorClient.ApiregistrationV1().APIServices().Get(ctx, apiService.Name, metav1.GetOptions{})
		if gerr != nil {
			return gerr
		}
		apiService.ResourceVersion = existing.ResourceVersion
		if _, uerr := aggregatorClient.ApiregistrationV1().APIServices().Update(ctx, apiService, metav1.UpdateOptions{}); uerr != nil {
			return uerr
		}
	}

	return nil
}

type nodeMetricItem struct {
	Name      string
	CPUCores  float64
	MemoryMi  int64
	Timestamp string
}

func checkMetricsAvailable(ctx context.Context, clientset *kubernetes.Clientset) bool {
	_, err := getNodeMetricsRaw(ctx, clientset)
	return err == nil
}

func getNodeMetricsRaw(ctx context.Context, clientset *kubernetes.Clientset) ([]nodeMetricItem, error) {
	raw, err := clientset.RESTClient().Get().AbsPath("/apis/metrics.k8s.io/v1beta1/nodes").DoRaw(ctx)
	if err != nil {
		return nil, err
	}

	payload := map[string]interface{}{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}

	itemsRaw, ok := payload["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid metrics response")
	}

	items := make([]nodeMetricItem, 0, len(itemsRaw))
	for _, itemRaw := range itemsRaw {
		item, ok := itemRaw.(map[string]interface{})
		if !ok {
			continue
		}
		metadata, _ := item["metadata"].(map[string]interface{})
		usage, _ := item["usage"].(map[string]interface{})

		name := strings.TrimSpace(fmt.Sprint(metadata["name"]))
		if name == "" {
			continue
		}

		cpu, _ := parseCPU(fmt.Sprint(usage["cpu"]))
		memoryMi, _ := parseMemoryMi(fmt.Sprint(usage["memory"]))
		items = append(items, nodeMetricItem{
			Name:      name,
			CPUCores:  cpu,
			MemoryMi:  memoryMi,
			Timestamp: strings.TrimSpace(fmt.Sprint(item["timestamp"])),
		})
	}

	return items, nil
}

func parseCPU(raw string) (float64, error) {
	q, err := resource.ParseQuantity(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	return q.AsApproximateFloat64(), nil
}

func parseMemoryMi(raw string) (int64, error) {
	q, err := resource.ParseQuantity(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	return q.Value() / (1024 * 1024), nil
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
