package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"viiids-api/internal/api"
)

// statusRecorder captures the status and byte count for request logging.
// It passes Flush through so streamed downloads stay live.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += int64(n)
	return n, err
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// allowedOrigin reads the CORS origin from the environment. Hosted deploys
// set ALLOWED_ORIGIN to the web app; local dev falls back to any origin.
func allowedOrigin() string {
	if o := strings.TrimSpace(os.Getenv("ALLOWED_ORIGIN")); o != "" {
		return o
	}
	return "*"
}

func withCORS(next http.Handler) http.Handler {
	origin := allowedOrigin()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if origin != "*" {
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			slog.Error("panic recovered",
				"method", r.Method,
				"path", r.URL.Path,
				"err", rec,
				"stack", string(debug.Stack()),
			)
			// Answers already started streaming cannot take a new status.
			if sr, ok := w.(*statusRecorder); ok {
				if sr.status == 0 {
					sr.Header().Set("Content-Type", "application/json")
					sr.WriteHeader(http.StatusInternalServerError)
					_, _ = sr.Write([]byte(`{"ok":false,"error":"internal error"}`))
				}
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
		}()
		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		// Health probes are polled by hosts and load balancers; skip the noise.
		if r.URL.Path != "/api/health" {
			slog.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"bytes", rec.bytes,
				"dur", time.Since(start).Round(time.Millisecond).String(),
			)
		}
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

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: withCORS(withLogging(withRecovery(mux))),
		// Bounds slow-loris style clients; WriteTimeout stays unset because
		// /api/download streams whole files for as long as the client reads.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}

	api.StartCacheSweep()

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		slog.Info("shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("forced shutdown", "err", err)
		}
	}()

	slog.Info("viiids api listening", "port", port, "origin", allowedOrigin())
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server failed", "err", err)
		os.Exit(1)
	}
}
