package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"canvas/backend/internal/config"
	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"canvas/backend/internal/security"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB     *gorm.DB
	Config config.Settings
}

func NewAuthHandler(db *gorm.DB, cfg config.Settings) *AuthHandler {
	return &AuthHandler{DB: db, Config: cfg}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type registerRequest struct {
	Username string  `json:"username"`
	Email    *string `json:"email"`
	Password string  `json:"password"`
}

type refreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Username) < 3 {
		response.Error(w, r, http.StatusBadRequest, "username must be at least 3 characters")
		return
	}
	if strings.EqualFold(req.Username, "admin") {
		response.Error(w, r, http.StatusBadRequest, "username admin is reserved")
		return
	}
	if len(req.Password) < 6 {
		response.Error(w, r, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	if exists, err := h.userExistsByUsername(req.Username); err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	} else if exists {
		response.Error(w, r, http.StatusBadRequest, "username already exists")
		return
	}

	if req.Email != nil && strings.TrimSpace(*req.Email) != "" {
		if exists, err := h.userExistsByEmail(strings.TrimSpace(*req.Email), 0); err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		} else if exists {
			response.Error(w, r, http.StatusBadRequest, "email already exists")
			return
		}
		normalized := strings.TrimSpace(*req.Email)
		req.Email = &normalized
	}

	hash, err := security.HashPassword(req.Password)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user := models.User{
		Username:       req.Username,
		Email:          req.Email,
		HashedPassword: hash,
		Role:           "viewer",
		IsActive:       true,
	}
	if err := h.DB.Create(&user).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to create user")
		return
	}

	response.Success(w, r, http.StatusCreated, sanitizeUser(user))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		response.Error(w, r, http.StatusBadRequest, "username and password are required")
		return
	}

	h.handleLogin(w, r, req.Username, req.Password)
}

func (h *AuthHandler) TokenLogin(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid form body")
		return
	}

	username := strings.TrimSpace(r.FormValue("username"))
	password := r.FormValue("password")
	if username == "" || password == "" {
		response.Error(w, r, http.StatusBadRequest, "username and password are required")
		return
	}

	h.handleLogin(w, r, username, password)
}

func (h *AuthHandler) handleLogin(w http.ResponseWriter, r *http.Request, username string, password string) {

	var user models.User
	if err := h.DB.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusUnauthorized, "invalid username or password")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if !user.IsActive {
		response.Error(w, r, http.StatusForbidden, "user is inactive")
		return
	}
	if !security.VerifyPassword(password, user.HashedPassword) {
		response.Error(w, r, http.StatusUnauthorized, "invalid username or password")
		return
	}

	accessToken, err := security.CreateAccessToken(user.Username, h.Config.JWTSecretKey, h.Config.AccessTokenExpireMinute)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to generate access token")
		return
	}

	refreshToken := uuid.NewString()
	refreshRow := models.RefreshToken{
		UserID:    user.ID,
		Token:     refreshToken,
		ExpiresAt: time.Now().UTC().Add(time.Duration(h.Config.RefreshTokenExpireDays) * 24 * time.Hour),
		IsRevoked: false,
	}
	if err := h.DB.Create(&refreshRow).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to generate refresh token")
		return
	}

	now := time.Now().UTC()
	user.LastLogin = &now
	_ = h.DB.Model(&user).Update("last_login", now).Error

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"access_token":  accessToken,
		"token_type":    "bearer",
		"refresh_token": refreshToken,
		"expires_in":    h.Config.AccessTokenExpireMinute * 60,
	})
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshTokenRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		response.Error(w, r, http.StatusBadRequest, "refresh_token is required")
		return
	}

	var refreshRow models.RefreshToken
	err := h.DB.Where("token = ? AND is_revoked = ?", req.RefreshToken, false).First(&refreshRow).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusUnauthorized, "invalid refresh token")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}
	if refreshRow.ExpiresAt.Before(time.Now().UTC()) {
		response.Error(w, r, http.StatusUnauthorized, "refresh token expired")
		return
	}

	var user models.User
	if err := h.DB.First(&user, refreshRow.UserID).Error; err != nil {
		response.Error(w, r, http.StatusUnauthorized, "user not found")
		return
	}
	if !user.IsActive {
		response.Error(w, r, http.StatusForbidden, "user is inactive")
		return
	}

	accessToken, err := security.CreateAccessToken(user.Username, h.Config.JWTSecretKey, h.Config.AccessTokenExpireMinute)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to generate access token")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"access_token": accessToken,
		"token_type":   "bearer",
		"expires_in":   h.Config.AccessTokenExpireMinute * 60,
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req refreshTokenRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		response.Error(w, r, http.StatusBadRequest, "refresh_token is required")
		return
	}

	updates := map[string]interface{}{
		"is_revoked": true,
		"revoked_at": time.Now().UTC(),
	}
	if err := h.DB.Model(&models.RefreshToken{}).Where("token = ?", req.RefreshToken).Updates(updates).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"message": "logout success"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"id":        user.ID,
		"username":  user.Username,
		"email":     user.Email,
		"role":      user.Role,
		"is_active": user.IsActive,
	})
}

func (h *AuthHandler) VerifyToken(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}
	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"valid":     true,
		"id":        user.ID,
		"username":  user.Username,
		"email":     user.Email,
		"role":      user.Role,
		"is_active": user.IsActive,
	})
}

func (h *AuthHandler) userExistsByUsername(username string) (bool, error) {
	var count int64
	err := h.DB.Model(&models.User{}).Where("username = ?", username).Count(&count).Error
	return count > 0, err
}

func (h *AuthHandler) userExistsByEmail(email string, excludeID uint) (bool, error) {
	query := h.DB.Model(&models.User{}).Where("email = ?", email)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	var count int64
	err := query.Count(&count).Error
	return count > 0, err
}

func sanitizeUser(user models.User) map[string]interface{} {
	payload := map[string]interface{}{
		"id":         user.ID,
		"username":   user.Username,
		"role":       user.Role,
		"is_active":  user.IsActive,
		"created_at": user.CreatedAt,
	}
	if user.Email != nil {
		payload["email"] = *user.Email
	}
	if user.UpdatedAt != nil {
		payload["updated_at"] = *user.UpdatedAt
	}
	if user.LastLogin != nil {
		payload["last_login"] = *user.LastLogin
	}
	return payload
}
