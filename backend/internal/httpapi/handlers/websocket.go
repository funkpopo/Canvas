package handlers

import (
	"net/http"

	"canvas/backend/internal/httpapi/response"
)

type WebsocketHandler struct{}

func NewWebsocketHandler() *WebsocketHandler {
	return &WebsocketHandler{}
}

func (h *WebsocketHandler) Stats(w http.ResponseWriter, r *http.Request) {
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"connections":         0,
		"authenticated_users": 0,
		"rooms":               0,
	})
}
