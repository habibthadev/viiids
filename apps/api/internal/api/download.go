package api

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strings"
	"time"
)

const (
	maxResolveBytes = 4 << 20 // 4MB cap on pages we scan for links
	maxURLLen       = 2048
)

var (
	mediaExts = map[string]bool{
		".mp4": true, ".mkv": true, ".avi": true, ".webm": true,
		".mov": true, ".m4v": true, ".mp3": true, ".flv": true,
	}
	hrefRe  = regexp.MustCompile(`(?i)(?:href|src)\s*=\s*["']([^"'#]+)["']`)
	titleRe = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)

	httpClientNoTimeout = &http.Client{
		Timeout: 0,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			if err := guardURL(req.URL.String()); err != nil {
				return err
			}
			setUpstreamHeaders(req)
			return nil
		},
	}
	httpClientShort = &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			if err := guardURL(req.URL.String()); err != nil {
				return err
			}
			setUpstreamHeaders(req)
			return nil
		},
	}
)

func allowPrivateHosts() bool {
	return os.Getenv("DL_ALLOW_PRIVATE") == "1"
}

func setUpstreamHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,video/*;q=0.8,*/*;q=0.5")
	if req.URL.Host != "" {
		req.Header.Set("Referer", "https://"+req.URL.Host+"/")
	}
}

// guardURL rejects non-http(s) URLs and non-public hosts (SSRF protection).
func guardURL(raw string) error {
	if raw == "" || len(raw) > maxURLLen {
		return fmt.Errorf("bad url")
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("url must be absolute http(s)")
	}
	if u.User != nil {
		return fmt.Errorf("url must not contain credentials")
	}
	host := u.Hostname()
	if strings.EqualFold(host, "localhost") {
		return fmt.Errorf("host not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if allowPrivateHosts() {
			return nil
		}
		if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsMulticast() {
			return fmt.Errorf("host not allowed")
		}
		return nil
	}
	if allowPrivateHosts() {
		return nil
	}
	dnsCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("could not resolve host")
	}
	for _, ip := range ips {
		addr := ip.IP
		if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() || addr.IsMulticast() {
			return fmt.Errorf("host not allowed")
		}
	}
	return nil
}

func extOf(u *url.URL) string {
	return strings.ToLower(path.Ext(strings.Split(u.Path, "?")[0]))
}

func isMediaContentType(ct string) bool {
	ct = strings.ToLower(strings.Split(ct, ";")[0])
	ct = strings.TrimSpace(ct)
	return strings.HasPrefix(ct, "video/") ||
		strings.HasPrefix(ct, "audio/") ||
		ct == "application/octet-stream" ||
		ct == "binary/octet-stream"
}

func sniffHeaders(target, referer string) (contentType string, contentLen string, acceptRanges string, err error) {
	req, err := http.NewRequest(http.MethodHead, target, nil)
	if err != nil {
		return "", "", "", err
	}
	setUpstreamHeaders(req)
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	resp, err := httpClientShort.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		if resp != nil {
			resp.Body.Close()
		}
		// Some hosts reject HEAD; retry as ranged GET for headers only.
		greq, gerr := http.NewRequest(http.MethodGet, target, nil)
		if gerr != nil {
			return "", "", "", gerr
		}
		setUpstreamHeaders(greq)
		if referer != "" {
			greq.Header.Set("Referer", referer)
		}
		greq.Header.Set("Range", "bytes=0-0")
		gresp, gerr := httpClientShort.Do(greq)
		if gerr != nil {
			return "", "", "", gerr
		}
		defer gresp.Body.Close()
		if gresp.StatusCode >= 400 && gresp.StatusCode != http.StatusPartialContent {
			return "", "", "", fmt.Errorf("upstream status %d", gresp.StatusCode)
		}
		return gresp.Header.Get("Content-Type"), gresp.Header.Get("Content-Length"), gresp.Header.Get("Accept-Ranges"), nil
	}
	defer resp.Body.Close()
	return resp.Header.Get("Content-Type"), resp.Header.Get("Content-Length"), resp.Header.Get("Accept-Ranges"), nil
}

var mediaExtByType = map[string]string{
	"video/mp4":        ".mp4",
	"video/x-matroska": ".mkv",
	"video/webm":       ".webm",
	"video/x-msvideo":  ".avi",
	"video/quicktime":  ".mov",
	"video/x-flv":      ".flv",
	"audio/mpeg":       ".mp3",
}

// safeFilename builds a download filename that always carries a media
// extension. Titles arrive without one, so the extension is taken from the
// file URL first and the sniffed content type second.
func safeFilename(target, override, contentType string) string {
	name := ""
	if override != "" {
		clean := strings.TrimSpace(override)
		clean = strings.ReplaceAll(clean, "\"", "")
		clean = strings.ReplaceAll(clean, "\\", "-")
		clean = strings.ReplaceAll(clean, "/", "-")
		clean = strings.Map(func(r rune) rune {
			if r < 32 || r == 127 {
				return -1
			}
			return r
		}, clean)
		clean = strings.TrimSpace(clean)
		if clean != "" && clean != "." {
			name = clean
		}
	}
	if name == "" {
		if u, err := url.Parse(target); err == nil {
			if base := path.Base(u.Path); base != "" && base != "." && base != "/" && strings.Contains(base, ".") {
				name = base
			}
		}
	}
	if name == "" {
		name = "viiids-download"
	}
	if len(name) > 100 {
		name = strings.TrimSpace(name[:100])
	}
	if !hasMediaExt(name) {
		name += extForFile(target, contentType)
	}
	return name
}

func hasMediaExt(name string) bool {
	lower := strings.ToLower(name)
	for ext := range mediaExts {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

func extForFile(target, contentType string) string {
	if u, err := url.Parse(target); err == nil {
		if ext := strings.ToLower(path.Ext(u.Path)); ext != "" {
			if _, ok := mediaExts[ext]; ok {
				return ext
			}
		}
	}
	if ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0])); ct != "" {
		if ext, ok := mediaExtByType[ct]; ok {
			return ext
		}
	}
	return ".mp4"
}

type resolveResult struct {
	Title  string   `json:"title"`
	Direct []string `json:"direct"`
	Pages  []string `json:"pages"`
	Note   string   `json:"note,omitempty"`
}

func HandleResolve(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if err := guardURL(raw); err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "url not allowed"})
		return
	}
	key := "resolve:" + raw
	if body, hit := cacheGet(key); hit {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
		return
	}
	req, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "bad url"})
		return
	}
	setUpstreamHeaders(req)
	resp, err := httpClientShort.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, envelope{OK: false, Error: "upstream unreachable"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		writeJSON(w, http.StatusBadGateway, envelope{OK: false, Error: fmt.Sprintf("upstream status %d", resp.StatusCode)})
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, envelope{OK: false, Error: "could not read upstream page"})
		return
	}
	base, _ := url.Parse(raw)
	var seed []string
	seenSeed := map[string]bool{}
	pushSeed := func(abs string) {
		if len(seed) >= 20 || seenSeed[abs] {
			return
		}
		seenSeed[abs] = true
		seed = append(seed, abs)
	}
	var pages []string
	seenPage := map[string]bool{}
	pushPage := func(abs string) {
		if len(pages) >= 20 || seenPage[abs] {
			return
		}
		seenPage[abs] = true
		pages = append(pages, abs)
	}
	title := ""
	if m := titleRe.FindSubmatch(body); len(m) > 1 {
		title = strings.TrimSpace(html.UnescapeString(string(m[1])))
		if len(title) > 140 {
			title = title[:140]
		}
	}
	for _, m := range hrefRe.FindAllSubmatch(body, 400) {
		href := strings.TrimSpace(string(m[1]))
		if href == "" || strings.HasPrefix(href, "javascript:") || strings.HasPrefix(href, "mailto:") || strings.HasPrefix(href, "#") {
			continue
		}
		u, err := base.Parse(href)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			continue
		}
		u.Fragment = ""
		abs := u.String()
		if len(abs) > maxURLLen {
			continue
		}
		pathLower := strings.ToLower(u.Path)
		switch {
		case mediaExts[extOf(u)]:
			pushSeed(abs)
		case strings.Contains(pathLower, "download"):
			pushPage(abs)
		}
		if len(seed) >= 20 && len(pages) >= 20 {
			break
		}
	}
	// Gated file hosts (downloadwella, meetdownload) hide the file behind a
	// form post or an inline JS token link — open those server-side.
	if len(seed) < 20 {
		extractEmbeddedFiles(raw, body, pushSeed)
	}
	// Junk page links must not suppress the form unlock: only verified
	// file URLs count.
	verified := verifyFiles(seed, raw)
	if len(verified) == 0 {
		if u, err := url.Parse(raw); err == nil && unlockHost(u.Hostname()) {
			verified = verifyFiles(unlockXFS(raw, body), raw)
		}
	}
	res := resolveResult{Title: title}
	res.Direct = verified
	if res.Direct == nil {
		res.Direct = []string{}
	}
	seedSet := map[string]bool{}
	for _, u := range seed {
		seedSet[u] = true
	}
	for _, u := range pages {
		if !seedSet[u] {
			res.Pages = append(res.Pages, u)
		}
	}
	if res.Pages == nil {
		res.Pages = []string{}
	}
	ttl := 60 * time.Second
	if len(res.Direct) == 0 && (len(seed) > 0) {
		// Links existed but none answered: host is throttling us. Say so,
		// and cache briefly so hammering Scan does not extend the throttle.
		res.Note = "file links found but the host is not answering, wait a minute and scan again"
		ttl = 30 * time.Second
	}
	out, _ := json.Marshal(envelope{OK: true, Data: res, Count: len(res.Direct)})
	// File-host tokens die fast — keep resolve entries fresh.
	cacheSetTTL(key, out, ttl)
	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out)
}

func HandleDownload(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if err := guardURL(raw); err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "url not allowed"})
		return
	}
	// Optional referer (usually the source/episode page) for hotlink-guarded hosts.
	referer := ""
	if ref := strings.TrimSpace(r.URL.Query().Get("referer")); ref != "" {
		if err := guardURL(ref); err == nil {
			referer = ref
		}
	}
	ct, length, acceptRanges, err := sniffHeaders(raw, referer)
	if err != nil {
		// File-host tokens expire fast: if the caller told us the source
		// page, re-open it for a fresh token and retry once.
		healed := false
		if page := strings.TrimSpace(r.URL.Query().Get("page")); page != "" {
			if fresh := refreshFile(page); fresh != "" {
				raw = fresh
				ct, length, acceptRanges, err = sniffHeaders(raw, referer)
				healed = err == nil
			}
		}
		if !healed {
			writeJSON(w, http.StatusBadGateway, envelope{OK: false, Error: "upstream unreachable"})
			return
		}
	}
	u, _ := url.Parse(raw)
	if !isMediaContentType(ct) && !mediaExts[extOf(u)] {
		writeJSON(w, http.StatusUnsupportedMediaType, envelope{OK: false, Error: "url is not a direct media file; use resolve first or open the source"})
		return
	}
	if ct == "" {
		switch extOf(u) {
		case ".mkv":
			ct = "video/x-matroska"
		case ".mp4", ".m4v":
			ct = "video/mp4"
		case ".webm":
			ct = "video/webm"
		case ".avi":
			ct = "video/x-msvideo"
		default:
			ct = "application/octet-stream"
		}
	}
	upReq, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{OK: false, Error: "bad url"})
		return
	}
	setUpstreamHeaders(upReq)
	if referer != "" {
		upReq.Header.Set("Referer", referer)
	}
	if rng := r.Header.Get("Range"); rng != "" {
		upReq.Header.Set("Range", rng)
	}
	upResp, err := httpClientNoTimeout.Do(upReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, envelope{OK: false, Error: "upstream unreachable"})
		return
	}
	defer upResp.Body.Close()
	if upResp.StatusCode >= 400 && upResp.StatusCode != http.StatusPartialContent {
		writeJSON(w, http.StatusBadGateway, envelope{OK: false, Error: fmt.Sprintf("upstream status %d", upResp.StatusCode)})
		return
	}
	h := w.Header()
	h.Set("Content-Type", ct)
	h.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", safeFilename(raw, r.URL.Query().Get("filename"), ct)))
	h.Set("Accept-Ranges", "bytes")
	if upResp.Header.Get("Content-Type") != "" && isMediaContentType(upResp.Header.Get("Content-Type")) {
		h.Set("Content-Type", strings.Split(upResp.Header.Get("Content-Type"), ";")[0])
	}
	if upResp.Header.Get("Content-Length") != "" {
		h.Set("Content-Length", upResp.Header.Get("Content-Length"))
	} else if length != "" && upResp.StatusCode == http.StatusOK {
		h.Set("Content-Length", length)
	}
	if upResp.Header.Get("Content-Range") != "" {
		h.Set("Content-Range", upResp.Header.Get("Content-Range"))
	} else if acceptRanges != "" {
		h.Set("Accept-Ranges", acceptRanges)
	}
	w.WriteHeader(upResp.StatusCode)
	_, _ = io.Copy(w, upResp.Body)
}
