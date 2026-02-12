package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"canvas/backend/internal/httpapi/middleware"
	"canvas/backend/internal/httpapi/response"
	"canvas/backend/internal/models"
	"canvas/backend/internal/security"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type UserHandler struct {
	DB *gorm.DB
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{DB: db}
}

type userCreateRequest struct {
	Username string  `json:"username"`
	Email    *string `json:"email"`
	Password string  `json:"password"`
	Role     string  `json:"role"`
}

type userUpdateRequest struct {
	Email    *string `json:"email"`
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
	Password *string `json:"password"`
}

type passwordChangeRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	page := parseIntWithDefault(r.URL.Query().Get("page"), 1)
	if page < 1 {
		page = 1
	}
	pageSize := parseIntWithDefault(r.URL.Query().Get("page_size"), 50)
	if pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 200 {
		pageSize = 200
	}

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	role := strings.TrimSpace(r.URL.Query().Get("role"))
	isActiveRaw := strings.TrimSpace(r.URL.Query().Get("is_active"))

	query := h.DB.Model(&models.User{})
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("username LIKE ? OR email LIKE ?", like, like)
	}
	if role != "" {
		query = query.Where("role = ?", role)
	}
	if isActiveRaw != "" {
		v, err := strconv.ParseBool(isActiveRaw)
		if err != nil {
			response.Error(w, r, http.StatusBadRequest, "is_active must be a boolean")
			return
		}
		query = query.Where("is_active = ?", v)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	var users []models.User
	if err := query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&users).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	items := make([]map[string]interface{}, 0, len(users))
	for _, user := range users {
		items = append(items, sanitizeUser(user))
	}

	response.Success(w, r, http.StatusOK, map[string]interface{}{
		"total": total,
		"users": items,
	})
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	var user models.User
	if err := h.DB.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "user not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	response.Success(w, r, http.StatusOK, sanitizeUser(user))
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req userCreateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Role = strings.TrimSpace(req.Role)
	if req.Username == "" {
		response.Error(w, r, http.StatusBadRequest, "username is required")
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
	if !isValidRole(req.Role) {
		response.Error(w, r, http.StatusBadRequest, "role must be one of admin, user, viewer")
		return
	}

	if exists, err := usernameExists(h.DB, req.Username, 0); err != nil {
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	} else if exists {
		response.Error(w, r, http.StatusBadRequest, "username already exists")
		return
	}

	if req.Email != nil && strings.TrimSpace(*req.Email) != "" {
		normalized := strings.TrimSpace(*req.Email)
		req.Email = &normalized
		if exists, err := emailExists(h.DB, normalized, 0); err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		} else if exists {
			response.Error(w, r, http.StatusBadRequest, "email already exists")
			return
		}
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
		Role:           req.Role,
		IsActive:       true,
	}
	if err := h.DB.Create(&user).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to create user")
		return
	}

	response.Success(w, r, http.StatusCreated, sanitizeUser(user))
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	var req userUpdateRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}

	var user models.User
	if err := h.DB.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "user not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if user.Username == "admin" {
		if req.Role != nil && *req.Role != "admin" {
			response.Error(w, r, http.StatusBadRequest, "admin user role cannot be changed")
			return
		}
		if req.IsActive != nil && !*req.IsActive {
			response.Error(w, r, http.StatusBadRequest, "admin user cannot be disabled")
			return
		}
	}

	if req.Role != nil {
		role := strings.TrimSpace(*req.Role)
		if !isValidRole(role) {
			response.Error(w, r, http.StatusBadRequest, "role must be one of admin, user, viewer")
			return
		}
		if user.Role == "admin" && role != "admin" {
			count, err := activeAdminCount(h.DB)
			if err != nil {
				response.Error(w, r, http.StatusInternalServerError, "database error")
				return
			}
			if count <= 1 {
				response.Error(w, r, http.StatusBadRequest, "cannot modify the last active admin")
				return
			}
		}
		user.Role = role
	}

	if req.IsActive != nil {
		if user.Role == "admin" && !*req.IsActive {
			count, err := activeAdminCount(h.DB)
			if err != nil {
				response.Error(w, r, http.StatusInternalServerError, "database error")
				return
			}
			if count <= 1 {
				response.Error(w, r, http.StatusBadRequest, "cannot disable the last active admin")
				return
			}
		}
		user.IsActive = *req.IsActive
	}

	if req.Email != nil {
		email := strings.TrimSpace(*req.Email)
		if email == "" {
			user.Email = nil
		} else {
			if exists, err := emailExists(h.DB, email, user.ID); err != nil {
				response.Error(w, r, http.StatusInternalServerError, "database error")
				return
			} else if exists {
				response.Error(w, r, http.StatusBadRequest, "email already exists")
				return
			}
			user.Email = &email
		}
	}

	if req.Password != nil {
		password := strings.TrimSpace(*req.Password)
		if len(password) < 6 {
			response.Error(w, r, http.StatusBadRequest, "password must be at least 6 characters")
			return
		}
		hash, err := security.HashPassword(password)
		if err != nil {
			response.Error(w, r, http.StatusInternalServerError, "failed to hash password")
			return
		}
		user.HashedPassword = hash
	}

	now := time.Now().UTC()
	user.UpdatedAt = &now
	if err := h.DB.Save(&user).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update user")
		return
	}

	response.Success(w, r, http.StatusOK, sanitizeUser(user))
}

func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	target := models.User{}
	if err := h.DB.First(&target, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "user not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if target.Username == "admin" {
		response.Error(w, r, http.StatusBadRequest, "admin user cannot be deleted")
		return
	}

	current, ok := middleware.CurrentUser(r)
	if ok && current.ID == target.ID {
		response.Error(w, r, http.StatusBadRequest, "cannot delete current user")
		return
	}

	if target.Role == "admin" {
		count, err := activeAdminCount(h.DB)
		if err != nil {
			response.Error(w, r, http.StatusInternalServerError, "database error")
			return
		}
		if count <= 1 {
			response.Error(w, r, http.StatusBadRequest, "cannot delete the last active admin")
			return
		}
	}

	if err := h.DB.Delete(&target).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to delete user")
		return
	}

	response.NoContent(w)
}

func (h *UserHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathUint(chi.URLParam(r, "userID"))
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid user id")
		return
	}

	current, ok := middleware.CurrentUser(r)
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "authentication required")
		return
	}
	if current.Role != "admin" && current.ID != userID {
		response.Error(w, r, http.StatusForbidden, "cannot change another user's password")
		return
	}

	var req passwordChangeRequest
	if err := response.DecodeJSON(r, &req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(strings.TrimSpace(req.NewPassword)) < 6 {
		response.Error(w, r, http.StatusBadRequest, "new_password must be at least 6 characters")
		return
	}

	var target models.User
	if err := h.DB.First(&target, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(w, r, http.StatusNotFound, "user not found")
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "database error")
		return
	}

	if current.Role != "admin" || current.ID == userID {
		if !security.VerifyPassword(req.CurrentPassword, target.HashedPassword) {
			response.Error(w, r, http.StatusBadRequest, "current password is incorrect")
			return
		}
	}

	hash, err := security.HashPassword(strings.TrimSpace(req.NewPassword))
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to hash password")
		return
	}

	now := time.Now().UTC()
	target.HashedPassword = hash
	target.UpdatedAt = &now
	if err := h.DB.Save(&target).Error; err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to update password")
		return
	}

	response.Success(w, r, http.StatusOK, map[string]string{"message": "password updated"})
}

func parseIntWithDefault(raw string, fallback int) int {
	if strings.TrimSpace(raw) == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parsePathUint(raw string) (uint, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(value), nil
}

func isValidRole(role string) bool {
	switch role {
	case "admin", "user", "viewer":
		return true
	default:
		return false
	}
}

func activeAdminCount(db *gorm.DB) (int64, error) {
	var count int64
	err := db.Model(&models.User{}).Where("role = ? AND is_active = ?", "admin", true).Count(&count).Error
	return count, err
}

func usernameExists(db *gorm.DB, username string, excludeID uint) (bool, error) {
	query := db.Model(&models.User{}).Where("username = ?", username)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	var count int64
	err := query.Count(&count).Error
	return count > 0, err
}

func emailExists(db *gorm.DB, email string, excludeID uint) (bool, error) {
	query := db.Model(&models.User{}).Where("email = ?", email)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	var count int64
	err := query.Count(&count).Error
	return count > 0, err
}
