package handler

import (
	"net/http"

	"viiids-api/internal/api"
)

// GET /api/download?url=&filename=&referer=&page=
func Handler(w http.ResponseWriter, r *http.Request) {
	api.HandleDownload(w, r)
}
