package response

import (
	"encoding/json"
	"net/http"

	"canvas/backend/internal/httpapi/contextkeys"
)

type envelope struct {
	Success    bool        `json:"success"`
	Data       interface{} `json:"data,omitempty"`
	Error      *apiError   `json:"error,omitempty"`
	RequestID  string      `json:"request_id,omitempty"`
	StatusCode int         `json:"status_code,omitempty"`
}

type apiError struct {
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

func Success(w http.ResponseWriter, r *http.Request, status int, data interface{}) {
	writeJSON(w, status, envelope{
		Success:   true,
		Data:      data,
		RequestID: requestIDFromContext(r),
	})
}

func Error(w http.ResponseWriter, r *http.Request, status int, message string) {
	writeJSON(w, status, envelope{
		Success:    false,
		Error:      &apiError{Message: message},
		RequestID:  requestIDFromContext(r),
		StatusCode: status,
	})
}

func ErrorWithDetails(w http.ResponseWriter, r *http.Request, status int, message string, details interface{}) {
	writeJSON(w, status, envelope{
		Success: false,
		Error: &apiError{
			Message: message,
			Details: details,
		},
		RequestID:  requestIDFromContext(r),
		StatusCode: status,
	})
}

func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

func DecodeJSON(r *http.Request, dst interface{}) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func requestIDFromContext(r *http.Request) string {
	if v := r.Context().Value(contextkeys.RequestIDKey); v != nil {
		if id, ok := v.(string); ok {
			return id
		}
	}
	return ""
}
