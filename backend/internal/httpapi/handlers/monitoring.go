package handlers

import (
	"net/http"

	"canvas/backend/internal/httpapi/response"
)

type MonitoringHandler struct{}

func NewMonitoringHandler() *MonitoringHandler {
	return &MonitoringHandler{}
}

func (h *MonitoringHandler) Stats(w http.ResponseWriter, r *http.Request) {
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"requests": map[string]interface{}{
			"enabled": false,
			"note":    "request metrics are not enabled in current Go runtime",
		},
		"cache": map[string]interface{}{
			"enabled": false,
		},
		"k8s_client_pool": map[string]interface{}{
			"enabled": false,
		},
		"websocket": map[string]interface{}{
			"connections": 0,
		},
	})
}
