package handler

import (
	"net/http"

	"viiids-api/internal/api"
)

// GET /api/search?platform=&q=&kind=
func Handler(w http.ResponseWriter, r *http.Request) {
	api.HandleSearch(w, r)
}
