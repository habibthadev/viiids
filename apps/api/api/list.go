package handler

import (
	"net/http"

	"viiids-api/internal/api"
)

// GET /api/list?platform=&page=&kind=
func Handler(w http.ResponseWriter, r *http.Request) {
	api.HandleList(w, r)
}
