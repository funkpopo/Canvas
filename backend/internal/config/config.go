package config

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"sigs.k8s.io/yaml"
)

// Settings holds runtime configuration loaded from config file.
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

type fileSettings struct {
	Server struct {
		Host string `json:"host" yaml:"host"`
		Port *int   `json:"port" yaml:"port"`
	} `json:"server" yaml:"server"`
	Database struct {
		Type       string `json:"type" yaml:"type"`
		SQLitePath string `json:"sqlite_db_path" yaml:"sqlite_db_path"`
		Host       string `json:"host" yaml:"host"`
		Port       *int   `json:"port" yaml:"port"`
		Name       string `json:"name" yaml:"name"`
		User       string `json:"user" yaml:"user"`
		Password   string `json:"password" yaml:"password"`
	} `json:"database" yaml:"database"`
	Auth struct {
		JWTSecretKey            string `json:"jwt_secret_key" yaml:"jwt_secret_key"`
		JWTAlgorithm            string `json:"jwt_algorithm" yaml:"jwt_algorithm"`
		AccessTokenExpireMinute *int   `json:"access_token_expire_minutes" yaml:"access_token_expire_minutes"`
		RefreshTokenExpireDays  *int   `json:"refresh_token_expire_days" yaml:"refresh_token_expire_days"`
		DefaultAdminPassword    string `json:"default_admin_password" yaml:"default_admin_password"`
	} `json:"auth" yaml:"auth"`
	CORS struct {
		AllowedOrigins []string `json:"allowed_origins" yaml:"allowed_origins"`
	} `json:"cors" yaml:"cors"`
}

func Load() Settings {
	fileCfg := loadFileSettings()

	sqlitePath := firstExistingPath(
		strings.TrimSpace(fileCfg.Database.SQLitePath),
		"backend/canvas.db",
		"../backend/canvas.db",
		"canvas.db",
	)

	return Settings{
		Host:                    valueOrDefault(fileCfg.Server.Host, "0.0.0.0"),
		Port:                    intOrDefault(fileCfg.Server.Port, 8000),
		DatabaseType:            strings.ToLower(valueOrDefault(fileCfg.Database.Type, "sqlite")),
		SQLiteDBPath:            sqlitePath,
		DatabaseHost:            valueOrDefault(fileCfg.Database.Host, "localhost"),
		DatabasePort:            intOrDefault(fileCfg.Database.Port, 3306),
		DatabaseName:            valueOrDefault(fileCfg.Database.Name, "canvas"),
		DatabaseUser:            valueOrDefault(fileCfg.Database.User, "canvas"),
		DatabasePassword:        strings.TrimSpace(fileCfg.Database.Password),
		JWTSecretKey:            valueOrDefault(fileCfg.Auth.JWTSecretKey, "your-secret-key-here-change-in-production"),
		JWTAlgorithm:            valueOrDefault(fileCfg.Auth.JWTAlgorithm, "HS256"),
		AccessTokenExpireMinute: intOrDefault(fileCfg.Auth.AccessTokenExpireMinute, 30),
		RefreshTokenExpireDays:  intOrDefault(fileCfg.Auth.RefreshTokenExpireDays, 30),
		DefaultAdminPassword:    valueOrDefault(fileCfg.Auth.DefaultAdminPassword, "admin123"),
		AllowedOrigins:          loadAllowedOrigins(fileCfg.CORS.AllowedOrigins),
	}
}

func loadFileSettings() fileSettings {
	path := firstExistingFile(
		"config/settings.yaml",
		"config/settings.yml",
		"config/settings.json",
		"backend/config/settings.yaml",
		"backend/config/settings.yml",
		"backend/config/settings.json",
	)
	if path == "" {
		return fileSettings{}
	}

	content, err := os.ReadFile(path)
	if err != nil {
		log.Printf("failed to read config file %s: %v", path, err)
		return fileSettings{}
	}

	var cfg fileSettings
	if err := yaml.Unmarshal(content, &cfg); err != nil {
		log.Printf("failed to parse config file %s: %v", path, err)
		return fileSettings{}
	}
	return cfg
}

func loadAllowedOrigins(fileOrigins []string) []string {
	origins := sanitizeOrigins(fileOrigins)
	if len(origins) == 0 {
		origins = []string{"http://localhost:3000", "http://frontend:3000", "http://127.0.0.1:3000"}
	}
	return origins
}

func sanitizeOrigins(origins []string) []string {
	if len(origins) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(origins))
	out := make([]string, 0, len(origins))
	for _, item := range origins {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func valueOrDefault(raw, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	return raw
}

func intOrDefault(raw *int, fallback int) int {
	if raw == nil {
		return fallback
	}
	return *raw
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

func firstExistingFile(paths ...string) string {
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return filepath.Clean(path)
		}
	}
	return ""
}
