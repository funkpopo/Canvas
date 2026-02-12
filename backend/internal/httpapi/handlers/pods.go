package handlers

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	"canvas/backend/internal/models"
	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type PodHandler struct {
	Resolver *K8sResolver
}

func NewPodHandler(resolver *K8sResolver) *PodHandler {
	return &PodHandler{Resolver: resolver}
}

func (h *PodHandler) List(w http.ResponseWriter, r *http.Request) {
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

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	opts := metav1.ListOptions{
		Limit:         limit,
		Continue:      continueToken,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
	}

	var pods *corev1.PodList
	if namespace != "" {
		pods, err = clientset.CoreV1().Pods(namespace).List(ctx, opts)
	} else {
		pods, err = clientset.CoreV1().Pods("").List(ctx, opts)
	}
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(pods.Items))
	for _, pod := range pods.Items {
		items = append(items, mapPodSummary(pod, cluster.ID, cluster.Name))
	}

	nextToken := pods.Continue
	if nextToken == "" {
		nextToken = ""
	}
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"items":          items,
		"continue_token": nullIfEmpty(nextToken),
	})
}

func (h *PodHandler) Get(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	podName := strings.TrimSpace(chi.URLParam(r, "podName"))
	if namespace == "" || podName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and pod name are required")
		return
	}

	_, cluster, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		response.Error(w, r, http.StatusNotFound, err.Error())
		return
	}

	events, _ := clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{FieldSelector: "involvedObject.name=" + podName})

	response.Success(w, r, http.StatusOK, mapPodDetails(*pod, events, cluster.ID, cluster.Name))
}

func (h *PodHandler) Logs(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	podName := strings.TrimSpace(chi.URLParam(r, "podName"))
	if namespace == "" || podName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and pod name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	containerName := strings.TrimSpace(r.URL.Query().Get("container"))
	tailLinesRaw := strings.TrimSpace(r.URL.Query().Get("tail_lines"))
	previousRaw := strings.TrimSpace(r.URL.Query().Get("previous"))

	var tailLines *int64
	if tailLinesRaw != "" {
		parsed, err := strconv.ParseInt(tailLinesRaw, 10, 64)
		if err != nil || parsed <= 0 {
			response.Error(w, r, http.StatusBadRequest, "tail_lines must be a positive integer")
			return
		}
		tailLines = &parsed
	}

	var previous bool
	if previousRaw != "" {
		parsed, err := strconv.ParseBool(previousRaw)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "previous must be true or false")
			return
		}
		previous = parsed
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	// 未显式指定容器时，默认选择第一个容器，避免多容器 Pod 返回 400。
	if containerName == "" {
		pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				response.Error(w, r, http.StatusNotFound, "pod not found")
				return
			}
			response.Error(w, r, http.StatusBadGateway, err.Error())
			return
		}
		if len(pod.Spec.Containers) > 0 {
			containerName = pod.Spec.Containers[0].Name
		}
	}

	req := clientset.CoreV1().Pods(namespace).GetLogs(podName, &corev1.PodLogOptions{
		Container: containerName,
		TailLines: tailLines,
		Previous:  previous,
	})
	stream, err := req.Stream(ctx)
	if err != nil {
		switch {
		case apierrors.IsNotFound(err):
			response.Error(w, r, http.StatusNotFound, "pod logs not found")
		case apierrors.IsForbidden(err):
			response.Error(w, r, http.StatusForbidden, "permission denied to read pod logs")
		default:
			response.Error(w, r, http.StatusBadGateway, err.Error())
		}
		return
	}
	defer stream.Close()

	content, err := io.ReadAll(stream)
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, "failed to read log stream")
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func (h *PodHandler) Delete(w http.ResponseWriter, r *http.Request) {
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	podName := strings.TrimSpace(chi.URLParam(r, "podName"))
	if namespace == "" || podName == "" {
		response.Error(w, r, http.StatusBadRequest, "namespace and pod name are required")
		return
	}

	_, _, clientset, err := h.Resolver.ResolveClient(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := clientset.CoreV1().Pods(namespace).Delete(ctx, podName, metav1.DeleteOptions{}); err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}
	response.NoContent(w)
}

type podRef struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

type batchPodRequest struct {
	ClusterID uint     `json:"cluster_id"`
	Pods      []podRef `json:"pods"`
}

func (h *PodHandler) BatchDelete(w http.ResponseWriter, r *http.Request) {
	h.handleBatchPodAction(w, r, false)
}

func (h *PodHandler) BatchRestart(w http.ResponseWriter, r *http.Request) {
	h.handleBatchPodAction(w, r, true)
}

func (h *PodHandler) handleBatchPodAction(w http.ResponseWriter, r *http.Request, restart bool) {
	var req batchPodRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ClusterID == 0 {
		response.Error(w, r, http.StatusBadRequest, "cluster_id is required")
		return
	}

	user, ok := currentUserRequired(w, r)
	if !ok {
		return
	}
	cluster, err := h.Resolver.Service.GetClusterForUser(req.ClusterID, user)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	cfg, err := k8s.BuildConfig(cluster)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error())
		return
	}
	clientset, err := k8s.NewClientset(cfg)
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	result := map[string]bool{}
	for _, pod := range req.Pods {
		ns := strings.TrimSpace(pod.Namespace)
		name := strings.TrimSpace(pod.Name)
		if ns == "" || name == "" {
			continue
		}
		key := ns + "/" + name
		err := clientset.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
		result[key] = err == nil
		_ = restart // restart maps to delete-and-recreate by controllers
	}
	response.Success(w, r, http.StatusOK, result)
}

func mapPodSummary(pod corev1.Pod, clusterID uint, clusterName string) map[string]interface{} {
	ready := 0
	total := len(pod.Status.ContainerStatuses)
	restarts := int32(0)
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Ready {
			ready++
		}
		restarts += cs.RestartCount
	}

	podIP := pod.Status.PodIP
	nodeName := pod.Spec.NodeName
	return map[string]interface{}{
		"name":         pod.Name,
		"namespace":    pod.Namespace,
		"status":       string(pod.Status.Phase),
		"ready":        strconv.Itoa(ready) + "/" + strconv.Itoa(total),
		"restarts":     restarts,
		"age":          k8s.CalculateAgeFromTime(pod.CreationTimestamp.Time),
		"ip":           podIP,
		"node":         nodeName,
		"labels":       pod.Labels,
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
	}
}

func mapPodDetails(pod corev1.Pod, events *corev1.EventList, clusterID uint, clusterName string) map[string]interface{} {
	containers := make([]map[string]interface{}, 0, len(pod.Status.ContainerStatuses))
	restarts := int32(0)
	ready := 0
	total := len(pod.Status.ContainerStatuses)
	for _, cs := range pod.Status.ContainerStatuses {
		state := "Unknown"
		switch {
		case cs.State.Running != nil:
			state = "Running"
		case cs.State.Waiting != nil:
			state = cs.State.Waiting.Reason
		case cs.State.Terminated != nil:
			state = cs.State.Terminated.Reason
		}
		if cs.Ready {
			ready++
		}
		restarts += cs.RestartCount
		containers = append(containers, map[string]interface{}{
			"name":          cs.Name,
			"image":         cs.Image,
			"ready":         cs.Ready,
			"restart_count": cs.RestartCount,
			"state":         state,
			"status":        state,
		})
	}

	volumes := make([]map[string]interface{}, 0, len(pod.Spec.Volumes))
	for _, v := range pod.Spec.Volumes {
		vType := "Unknown"
		source := ""
		switch {
		case v.ConfigMap != nil:
			vType = "ConfigMap"
			source = v.ConfigMap.Name
		case v.Secret != nil:
			vType = "Secret"
			source = v.Secret.SecretName
		case v.PersistentVolumeClaim != nil:
			vType = "PVC"
			source = v.PersistentVolumeClaim.ClaimName
		}
		volumes = append(volumes, map[string]interface{}{"name": v.Name, "type": vType, "source": source})
	}

	eventItems := make([]map[string]interface{}, 0)
	if events != nil {
		for _, e := range events.Items {
			eventItems = append(eventItems, map[string]interface{}{
				"type":      e.Type,
				"reason":    e.Reason,
				"message":   e.Message,
				"timestamp": e.LastTimestamp,
			})
		}
	}

	return map[string]interface{}{
		"name":             pod.Name,
		"namespace":        pod.Namespace,
		"status":           string(pod.Status.Phase),
		"node_name":        pod.Spec.NodeName,
		"age":              k8s.CalculateAgeFromTime(pod.CreationTimestamp.Time),
		"restarts":         restarts,
		"ready_containers": strconv.Itoa(ready) + "/" + strconv.Itoa(total),
		"labels":           pod.Labels,
		"annotations":      pod.Annotations,
		"containers":       containers,
		"volumes":          volumes,
		"events":           eventItems,
		"cluster_id":       clusterID,
		"cluster_name":     clusterName,
	}
}

func nullIfEmpty(v string) interface{} {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return v
}

func currentUserRequired(w http.ResponseWriter, r *http.Request) (*models.User, bool) {
	user, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return nil, false
	}
	return user, true
}
