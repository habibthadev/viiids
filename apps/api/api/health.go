package handler

import (
	"net/http"

	"viiids-api/internal/api"
)

// GET /api/health
func Handler(w http.ResponseWriter, r *http.Request) {
	api.HandleHealth(w, r)
}
