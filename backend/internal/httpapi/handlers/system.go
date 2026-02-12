package handlers

import (
	"net/http"

	"canvas/backend/internal/httpapi/response"
)

type SystemHandler struct{}

func NewSystemHandler() *SystemHandler {
	return &SystemHandler{}
}

func (h *SystemHandler) Root(w http.ResponseWriter, r *http.Request) {
	response.Success(w, r, http.StatusOK, map[string]string{"message": "Canvas Kubernetes Management API (Go)"})
}

func (h *SystemHandler) Health(w http.ResponseWriter, r *http.Request) {
	response.Success(w, r, http.StatusOK, map[string]string{"status": "healthy"})
}
