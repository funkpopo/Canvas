package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Settings holds runtime configuration loaded from environment variables.
type Settings struct {
	Host                    string
	Port                    int
	DatabaseType            string
	SQLiteDBPath            string
	DatabaseHost            string
	DatabasePort            int
	DatabaseName            string
	DatabaseUser            string
	DatabasePassword        string
	JWTSecretKey            string
	JWTAlgorithm            string
	AccessTokenExpireMinute int
	RefreshTokenExpireDays  int
	DefaultAdminPassword    string
	AllowedOrigins          []string
}

func Load() Settings {
	sqlitePath := firstExistingPath(
		strings.TrimSpace(os.Getenv("SQLITE_DB_PATH")),
		"backend/canvas.db",
		"../backend/canvas.db",
		"canvas.db",
	)

	return Settings{
		Host:                    envOr("HOST", "0.0.0.0"),
		Port:                    envAsInt(firstNonEmpty(os.Getenv("APP_PORT"), os.Getenv("BACKEND_PORT")), 8000),
		DatabaseType:            strings.ToLower(envOr("DATABASE_TYPE", "sqlite")),
		SQLiteDBPath:            sqlitePath,
		DatabaseHost:            envOr("DATABASE_HOST", "localhost"),
		DatabasePort:            envAsInt(os.Getenv("DATABASE_PORT"), 3306),
		DatabaseName:            envOr("DATABASE_NAME", "canvas"),
		DatabaseUser:            envOr("DATABASE_USER", "canvas"),
		DatabasePassword:        os.Getenv("DATABASE_PASSWORD"),
		JWTSecretKey:            firstNonEmpty(os.Getenv("JWT_SECRET_KEY"), os.Getenv("SECRET_KEY"), "your-secret-key-here-change-in-production"),
		JWTAlgorithm:            envOr("JWT_ALGORITHM", "HS256"),
		AccessTokenExpireMinute: envAsInt(firstNonEmpty(os.Getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES"), os.Getenv("ACCESS_TOKEN_EXPIRE_MINUTES")), 30),
		RefreshTokenExpireDays:  envAsInt(os.Getenv("REFRESH_TOKEN_EXPIRE_DAYS"), 30),
		DefaultAdminPassword:    envOr("DEFAULT_ADMIN_PASSWORD", "admin123"),
		AllowedOrigins:          loadAllowedOrigins(),
	}
}

func loadAllowedOrigins() []string {
	origins := []string{"http://localhost:3000", "http://frontend:3000", "http://127.0.0.1:3000"}
	extra := strings.TrimSpace(os.Getenv("CORS_ORIGINS"))
	if extra == "" {
		return origins
	}

	for _, item := range strings.Split(extra, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		origins = append(origins, item)
	}
	return origins
}

func firstExistingPath(paths ...string) string {
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	if len(paths) == 0 || strings.TrimSpace(paths[0]) == "" {
		return "canvas.db"
	}
	cleaned := strings.TrimSpace(paths[0])
	if cleaned == "" {
		return "canvas.db"
	}
	return filepath.Clean(cleaned)
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envAsInt(raw string, fallback int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
