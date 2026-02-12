package main

import (
	"fmt"
	"log"
	"net/http"

	"canvas/backend/internal/config"
	"canvas/backend/internal/database"
	"canvas/backend/internal/httpapi/router"
)

func main() {
	cfg := config.Load()

	db, err := database.Open(cfg)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}

	handler := router.New(db, cfg)
	address := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	log.Printf("Canvas Go backend listening on %s", address)
	if err := http.ListenAndServe(address, handler); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
