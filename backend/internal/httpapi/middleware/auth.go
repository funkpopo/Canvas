package middleware

import (
	"context"
	"net/http"
	"strings"

	"canvas/backend/internal/config"
	"canvas/backend/internal/httpapi/contextkeys"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"canvas/backend/internal/security"
	"gorm.io/gorm"
)

type Auth struct {
	DB     *gorm.DB
	Config config.Settings
}

func (a Auth) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r.Header.Get("Authorization"))
		if token == "" {
			response.Error(w, r, http.StatusUnauthorized, "authentication required")
			return
		}

		username, err := security.ParseAccessToken(token, a.Config.JWTSecretKey)
		if err != nil {
			response.Error(w, r, http.StatusUnauthorized, "invalid token")
			return
		}

		var user models.User
		err = a.DB.Where("username = ?", username).First(&user).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				response.Error(w, r, http.StatusUnauthorized, "user not found")
				return
			}
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		}

		if !user.IsActive {
			response.Error(w, r, http.StatusForbidden, "user is inactive")
			return
		}

		ctx := context.WithValue(r.Context(), contextkeys.CurrentUser, &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func CurrentUser(r *http.Request) (*models.User, bool) {
	v := r.Context().Value(contextkeys.CurrentUser)
	if v == nil {
		return nil, false
	}
	user, ok := v.(*models.User)
	return user, ok && user != nil
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := CurrentUser(r)
		if !ok {
			response.Error(w, r, http.StatusUnauthorized, "authentication required")
			return
		}
		if user.Role != "admin" {
			response.Error(w, r, http.StatusForbidden, "admin role required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func bearerToken(raw string) string {
	if raw == "" {
		return ""
	}
	parts := strings.SplitN(strings.TrimSpace(raw), " ", 2)
	if len(parts) != 2 {
		return ""
	}
	if !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
