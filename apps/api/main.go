package main

import (
	"log"
	"net/http"
	"os"

	"viiids-api/internal/api"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", api.HandleHealth)
	mux.HandleFunc("/api/platforms", api.HandlePlatforms)
	mux.HandleFunc("/api/search", api.HandleSearch)
	mux.HandleFunc("/api/list", api.HandleList)
	mux.HandleFunc("/api/resolve", api.HandleResolve)
	mux.HandleFunc("/api/download", api.HandleDownload)
	mux.HandleFunc("/", api.HandleRoot)
	api.StartCacheSweep()
	log.Printf("viiids api listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, withCORS(mux)))
}
