package handler

import (
	"net/http"

	"viiids-api/internal/api"
)

// GET /api/resolve?url=
func Handler(w http.ResponseWriter, r *http.Request) {
	api.HandleResolve(w, r)
}
