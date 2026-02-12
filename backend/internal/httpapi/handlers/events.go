package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/k8s"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type EventHandler struct {
	Resolver *K8sResolver
}

func NewEventHandler(resolver *K8sResolver) *EventHandler {
	return &EventHandler{Resolver: resolver}
}

func (h *EventHandler) List(w http.ResponseWriter, r *http.Request) {
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

	opts := metav1.ListOptions{
		Limit:         limit,
		Continue:      continueToken,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var list *corev1.EventList
	if namespace != "" {
		list, err = clientset.CoreV1().Events(namespace).List(ctx, opts)
	} else {
		list, err = clientset.CoreV1().Events(metav1.NamespaceAll).List(ctx, opts)
	}
	if err != nil {
		response.Error(w, r, http.StatusBadGateway, err.Error())
		return
	}

	items := make([]map[string]interface{}, 0, len(list.Items))
	for _, event := range list.Items {
		items = append(items, mapEvent(event, cluster.ID, cluster.Name))
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"items":          items,
		"continue_token": nullIfEmpty(list.Continue),
	})
}

func mapEvent(event corev1.Event, clusterID uint, clusterName string) map[string]interface{} {
	var source interface{}
	if strings.TrimSpace(event.Source.Component) != "" {
		source = event.Source.Component
	} else {
		source = nil
	}

	firstTimestamp := normalizeEventTime(event.FirstTimestamp.Time)
	lastTime := event.LastTimestamp.Time
	if lastTime.IsZero() {
		lastTime = event.EventTime.Time
	}
	lastTimestamp := normalizeEventTime(lastTime)

	var involved interface{}
	if strings.TrimSpace(event.InvolvedObject.Name) != "" {
		involved = map[string]interface{}{
			"kind":      event.InvolvedObject.Kind,
			"name":      event.InvolvedObject.Name,
			"namespace": event.InvolvedObject.Namespace,
		}
	} else {
		involved = nil
	}

	return map[string]interface{}{
		"name":            event.Name,
		"namespace":       event.Namespace,
		"type":            event.Type,
		"reason":          event.Reason,
		"message":         event.Message,
		"source":          source,
		"count":           event.Count,
		"first_timestamp": firstTimestamp,
		"last_timestamp":  lastTimestamp,
		"age":             k8s.CalculateAgeFromTime(event.CreationTimestamp.Time),
		"involved_object": involved,
		"cluster_id":      clusterID,
		"cluster_name":    clusterName,
	}
}

func normalizeEventTime(t time.Time) interface{} {
	if t.IsZero() {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}
