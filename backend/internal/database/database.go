package database

import (
	"fmt"
	"log"
	"time"

	"canvas/backend/internal/config"
	"canvas/backend/internal/models"
	"canvas/backend/internal/security"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(cfg config.Settings) (*gorm.DB, error) {
	var db *gorm.DB
	var err error

	gormCfg := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	}

	switch cfg.DatabaseType {
	case "mysql":
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseHost,
			cfg.DatabasePort,
			cfg.DatabaseName,
		)
		db, err = gorm.Open(mysql.Open(dsn), gormCfg)
	default:
		db, err = gorm.Open(sqlite.Open(cfg.SQLiteDBPath), gormCfg)
	}
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(30)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	if err := db.AutoMigrate(
		&models.User{},
		&models.RefreshToken{},
		&models.Cluster{},
		&models.AuditLog{},
		&models.UserClusterPermission{},
		&models.UserNamespacePermission{},
		&models.JobTemplate{},
		&models.JobHistory{},
		&models.AlertRule{},
		&models.AlertEvent{},
	); err != nil {
		return nil, err
	}

	if err := ensureDefaultAdmin(db, cfg.DefaultAdminPassword); err != nil {
		return nil, err
	}

	return db, nil
}

func ensureDefaultAdmin(db *gorm.DB, defaultPassword string) error {
	var admin models.User
	err := db.Where("username = ?", "admin").First(&admin).Error
	if err == nil {
		if admin.Role != "admin" {
			admin.Role = "admin"
			if err := db.Save(&admin).Error; err != nil {
				return err
			}
		}
		return nil
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}

	hash, err := security.HashPassword(defaultPassword)
	if err != nil {
		return err
	}

	admin = models.User{
		Username:       "admin",
		HashedPassword: hash,
		Role:           "admin",
		IsActive:       true,
	}

	if err := db.Create(&admin).Error; err != nil {
		return err
	}

	log.Printf("default user 'admin' was created by Go backend")
	return nil
}
