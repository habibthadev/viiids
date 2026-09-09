package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"viiids-api/engine"
)

type envelope struct {
	OK       bool        `json:"ok"`
	Data     interface{} `json:"data,omitempty"`
	Error    string      `json:"error,omitempty"`
	Platform string      `json:"platform,omitempty"`
	Query    string      `json:"query,omitempty"`
	Page     int         `json:"page,omitempty"`
	Kind     string      `json:"kind,omitempty"`
	Count    int         `json:"count,omitempty"`
}

type cacheEntry struct {
	body    []byte
	expires time.Time
}

var (
	cache = sync.Map{} // key -> cacheEntry
	ttl   = 5 * time.Minute
)

func cacheGet(key string) ([]byte, bool) {
	v, ok := cache.Load(key)
	if !ok {
		return nil, false
	}
	e := v.(cacheEntry)
	if time.Now().After(e.expires) {
		cache.Delete(key)
		return nil, false
	}
	return e.body, true
}

func cacheSet(key string, body []byte) {
	cacheSetTTL(key, body, ttl)
}

// flightGroup de-duplicates concurrent identical scrapes: latecomers wait
// on the in-flight call instead of hammering the source site again.
type flightGroup struct {
	mu sync.Mutex
	m  map[string]*flightCall
}

type flightCall struct {
	done chan struct{}
	body []byte
}

var flights = flightGroup{m: map[string]*flightCall{}}

func (g *flightGroup) Do(key string, fn func() []byte) []byte {
	g.mu.Lock()
	if c, ok := g.m[key]; ok {
		g.mu.Unlock()
		<-c.done
		return c.body
	}
	c := &flightCall{done: make(chan struct{})}
	g.m[key] = c
	g.mu.Unlock()
	c.body = fn()
	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()
	close(c.done)
	return c.body
}

// scrapeTimeout bounds a full scrape; throttled sources fail fast-ish.
const scrapeTimeout = 150 * time.Second

func cacheSetTTL(key string, body []byte, d time.Duration) {
	cache.Store(key, cacheEntry{body: body, expires: time.Now().Add(d)})
}

func writeJSON(w http.ResponseWriter, status int, v envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func validPlatform(p string) (string, bool) {
	p = strings.ToLower(strings.TrimSpace(p))
	switch p {
	case "netnaija", "thenetnaija":
		return "netnaija", true
	case "thenkiri", "nkiri":
		return "nkiri", true
	case "waploaded":
		return "waploaded", true
	case "fzmovies":
		return "fzmovies", true
	case "o2tvseries", "02tvseries":
		return "o2tvseries", true
	}
	return "", false
}

func validKind(k string) (string, bool) {
	k = strings.ToLower(strings.TrimSpace(k))
	switch k {
	case "", "all":
		return "all", true
	case "movie", "movies":
		return "movie", true
	case "series", "serie", "shows":
		return "series", true
	}
	return "", false
}

func filterKind(movies []engine.Movie, kind string) []engine.Movie {
	if kind == "all" {
		return movies
	}
	out := make([]engine.Movie, 0, len(movies))
	for _, m := range movies {
		if kind == "series" && m.IsSeries {
			out = append(out, m)
		}
		if kind == "movie" && !m.IsSeries {
			out = append(out, m)
		}
	}
	return out
}

// ServeJSONEnvelope writes a cached-or-fresh envelope body with the right
// status. Shared by the local server and the Vercel handlers.
func writeProbed(w http.ResponseWriter, body []byte) {
	var probe struct {
		OK bool `json:"ok"`
	}
	status := http.StatusOK
	if json.Unmarshal(body, &probe) == nil && !probe.OK {
		status = http.StatusBadGateway
	}
	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, envelope{OK: true, Data: map[string]string{"status": "up"}})
}

func HandlePlatforms(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, envelope{OK: true, Data: engine.GetPlatforms(), Count: 5})
}

func HandleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		writeJSON(w, http.StatusNotFound, envelope{OK: false, Error: "not found"})
		return
	}
	writeJSON(w, http.StatusOK, envelope{OK: true, Data: map[string]interface{}{
		"name":      "viiids",
		"platforms": engine.CanonicalPlatformIDs(),
		"endpoints": []string{"/api/health", "/api/platforms", "/api/search?platform=&q=&kind=all|movie|series", "/api/list?platform=&page=&kind=all|movie|series", "/api/resolve?url=", "/api/download?url="},
	}})
}

func HandleSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(r.URL.Query().Get("query"))
	}
	plat, ok := validPlatform(r.URL.Query().Get("platform"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "platform must be one of: netnaija, nkiri, waploaded, fzmovies, o2tvseries"})
		return
	}
	if q == "" || len(q) > 120 {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "q must be 1..120 chars"})
		return
	}
	kind, ok := validKind(r.URL.Query().Get("kind"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "kind must be one of: all, movie, series"})
		return
	}
	key := "search:" + plat + ":" + kind + ":" + strings.ToLower(q)
	if body, hit := cacheGet(key); hit {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
		return
	}
	e, err := engine.GetEngine(plat)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: err.Error()})
		return
	}
	ch := make(chan []byte, 1)
	go func() {
		ch <- flights.Do(key, func() []byte {
			if body, hit := cacheGet(key); hit {
				return body
			}
			res := e.Search(q)
			if res.Error != "" && len(res.Movies) == 0 {
				body, _ := json.Marshal(envelope{OK: false, Error: res.Error})
				return body
			}
			movies := filterKind(res.Movies, kind)
			body, _ := json.Marshal(envelope{OK: true, Data: movies, Platform: plat, Query: q, Kind: kind, Count: len(movies)})
			cacheSet(key, body)
			return body
		})
	}()
	select {
	case body := <-ch:
		writeProbed(w, body)
	case <-time.After(scrapeTimeout):
		writeJSON(w, http.StatusGatewayTimeout, envelope{OK: false, Error: "source slow, try again shortly"})
	}
}

func HandleList(w http.ResponseWriter, r *http.Request) {
	plat, ok := validPlatform(r.URL.Query().Get("platform"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "platform must be one of: netnaija, nkiri, waploaded, fzmovies, o2tvseries"})
		return
	}
	page := 1
	if s := r.URL.Query().Get("page"); s != "" {
		p, err := strconv.Atoi(s)
		if err != nil || p < 1 || p > 20 {
			writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "page must be 1..20"})
			return
		}
		page = p
	}
	kind, ok := validKind(r.URL.Query().Get("kind"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "kind must be one of: all, movie, series"})
		return
	}
	key := "list:" + plat + ":" + kind + ":" + strconv.Itoa(page)
	if body, hit := cacheGet(key); hit {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
		return
	}
	e, err := engine.GetEngine(plat)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: err.Error()})
		return
	}
	ch := make(chan []byte, 1)
	go func() {
		ch <- flights.Do(key, func() []byte {
			if body, hit := cacheGet(key); hit {
				return body
			}
			res := e.List(page)
			if res.Error != "" && len(res.Movies) == 0 {
				body, _ := json.Marshal(envelope{OK: false, Error: res.Error})
				return body
			}
			movies := filterKind(res.Movies, kind)
			body, _ := json.Marshal(envelope{OK: true, Data: movies, Platform: plat, Page: page, Kind: kind, Count: len(movies)})
			cacheSet(key, body)
			return body
		})
	}()
	select {
	case body := <-ch:
		writeProbed(w, body)
	case <-time.After(scrapeTimeout):
		writeJSON(w, http.StatusGatewayTimeout, envelope{OK: false, Error: "source slow, try again shortly"})
	}
}

// StartCacheSweep evicts expired entries every minute. The local server
// calls it on boot; serverless instances skip it (per-request expiry applies).
func StartCacheSweep() {
	go func() {
		for range time.Tick(time.Minute) {
			now := time.Now()
			cache.Range(func(k, v interface{}) bool {
				if now.After(v.(cacheEntry).expires) {
					cache.Delete(k)
				}
				return true
			})
		}
	}()
}
