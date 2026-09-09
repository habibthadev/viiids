package api

import (
	"html"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/publicsuffix"
)

var (
	jsLocRe    = regexp.MustCompile(`(?i)(?:location\.href|currentTabUrl)\s*=\s*['"](https?://[^'"]+)['"]`)
	subFileRe  = regexp.MustCompile(`(?i)([-_.](srt|sub|idx|ssa|ass|vtt|sup|mpl|txt|smi)|/subs?/|subtitle)`)
	jsFileRe   = regexp.MustCompile(`(?i)https?://[^\s"'<>\\)\[\]]+\.(mkv|mp4|avi|webm|mov|m4v|mp3)(\?[^\s"'<>\\)\[\]]*)?`)
	ogVideoRe  = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']`)
	videoSrcRe = regexp.MustCompile(`(?i)<(?:video|source|audio)[^>]+src=["']([^"']+)["']`)
	xfsFormRe  = regexp.MustCompile(`(?is)<form[^>]*>.*?name="op"\s+value="download2".*?</form>`)
	xfsInputRe = regexp.MustCompile(`(?i)<input[^>]*name="([^"]+)"[^>]*>`)
	xfsValRe   = regexp.MustCompile(`(?i)value="([^"]*)"`)
)

// verifyFiles keeps only candidates that actually behave like media files
// (media content-type on HEAD, or a ranged GET that is not an error page).
// Probes run in parallel with a short timeout; referer helps hotlink hosts.
func verifyFiles(candidates []string, referer string) []string {
	if len(candidates) > 4 {
		candidates = candidates[:4]
	}
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: httpClientShort.CheckRedirect}
	var mu sync.Mutex
	kept := []string{}
	var wg sync.WaitGroup
	sem := make(chan struct{}, 2)
	for _, target := range candidates {
		target := target
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if !probeFile(client, target, referer) {
				return
			}
			mu.Lock()
			kept = append(kept, target)
			mu.Unlock()
		}()
	}
	wg.Wait()
	// Restore input order.
	order := map[string]int{}
	for i, c := range candidates {
		order[c] = i
	}
	for i := 1; i < len(kept); i++ {
		for j := i; j > 0 && order[kept[j]] < order[kept[j-1]]; j-- {
			kept[j], kept[j-1] = kept[j-1], kept[j]
		}
	}
	return kept
}

func probeFile(client *http.Client, target, referer string) bool {
	mkReq := func(method string) *http.Request {
		req, err := http.NewRequest(method, target, nil)
		if err != nil {
			return nil
		}
		setUpstreamHeaders(req)
		if referer != "" {
			req.Header.Set("Referer", referer)
		}
		if method == http.MethodGet {
			req.Header.Set("Range", "bytes=0-0")
		}
		return req
	}
	if req := mkReq(http.MethodHead); req != nil {
		if resp, err := client.Do(req); err == nil {
			ct := resp.Header.Get("Content-Type")
			code := resp.StatusCode
			resp.Body.Close()
			if code < 400 && isMediaContentType(ct) {
				return true
			}
		}
	}
	req := mkReq(http.MethodGet)
	if req == nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusPartialContent {
		return false
	}
	ct := resp.Header.Get("Content-Type")
	if isMediaContentType(ct) {
		return true
	}
	// No content-type proof: trust a media extension on a live URL.
	u, err := url.Parse(target)
	if err != nil {
		return false
	}
	if mediaExts[extOf(u)] && !strings.Contains(strings.ToLower(ct), "text/html") {
		return true
	}
	return false
}

// refreshFile re-opens a gated file-host page and returns the first verified
// direct file URL. Used to heal expired tokens at download time.
func refreshFile(pageURL string) string {
	if err := guardURL(pageURL); err != nil {
		return ""
	}
	req, err := http.NewRequest(http.MethodGet, pageURL, nil)
	if err != nil {
		return ""
	}
	setUpstreamHeaders(req)
	resp, err := httpClientShort.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
	resp.Body.Close()
	if err != nil {
		return ""
	}
	var cands []string
	seen := map[string]bool{}
	add := func(abs string) {
		if len(cands) >= 8 || seen[abs] {
			return
		}
		seen[abs] = true
		cands = append(cands, abs)
	}
	extractEmbeddedFiles(pageURL, body, add)
	if len(cands) == 0 {
		if u, err := url.Parse(pageURL); err == nil && unlockHost(u.Hostname()) {
			for _, abs := range unlockXFS(pageURL, body) {
				add(abs)
			}
		}
	}
	if got := verifyFiles(cands, pageURL); len(got) > 0 {
		return got[0]
	}
	return ""
}

// unlockHost reports whether a page host is a known gated file host we can
// open server-side (XFS-style form or embedded JS token link).
func unlockHost(host string) bool {
	host = strings.ToLower(host)
	for _, h := range []string{"downloadwella.com", "meetdownload.com"} {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

// isDirectFileURL reports whether abs looks like a file itself (media
// extension or file-host /d/ and /dl/ token paths) rather than a page.
// Subtitle and sidecar files are excluded: they are never the feature.
func isDirectFileURL(abs string) bool {
	u, err := url.Parse(abs)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	p := strings.ToLower(u.Path)
	if subFileRe.MatchString(p) {
		return false
	}
	if mediaExts[extOf(u)] {
		return true
	}
	return strings.Contains(p, "/d/") || strings.Contains(p, "/dl/")
}

// extractEmbeddedFiles pulls candidate file URLs out of inline JS, meta tags
// and media elements. base resolves relative URLs.
func extractEmbeddedFiles(pageURL string, page []byte, add func(string)) {
	base, err := url.Parse(pageURL)
	if err != nil {
		return
	}
	seen := map[string]bool{}
	emit := func(raw string) {
		raw = strings.TrimSpace(html.UnescapeString(raw))
		if raw == "" || strings.ContainsAny(raw, " \t\n<>") {
			return
		}
		u, err := base.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return
		}
		u.Fragment = ""
		abs := u.String()
		if len(abs) > maxURLLen || seen[abs] {
			return
		}
		// Only real files here — pages belong in the pages bucket.
		if !isDirectFileURL(abs) {
			return
		}
		seen[abs] = true
		add(abs)
	}
	for _, m := range jsLocRe.FindAllSubmatch(page, 20) {
		raw := strings.TrimSpace(string(m[1]))
		if raw == "" {
			continue
		}
		emit(raw)
	}
	for _, m := range ogVideoRe.FindAllSubmatch(page, 5) {
		emit(string(m[1]))
	}
	for _, m := range videoSrcRe.FindAllSubmatch(page, 10) {
		emit(string(m[1]))
	}
	for _, m := range jsFileRe.FindAll(page, 40) {
		emit(string(m))
	}
}

// unlockXFS performs the classic file-host form unlock: re-POST the hidden
// download form (op=download2) with the GET cookies and scrape the direct
// file links out of the answer. Returns absolute file URLs.
func unlockXFS(pageURL string, page []byte) []string {
	form := xfsFormRe.Find(page)
	if form == nil {
		return nil
	}
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	client := &http.Client{
		Timeout:       20 * time.Second,
		Jar:           jar,
		CheckRedirect: httpClientShort.CheckRedirect,
	}
	getReq, err := http.NewRequest(http.MethodGet, pageURL, nil)
	if err != nil {
		return nil
	}
	setUpstreamHeaders(getReq)
	if resp, err := client.Do(getReq); err == nil {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
	}
	values := url.Values{}
	for _, input := range xfsInputRe.FindAllSubmatch(form, 20) {
		name := string(input[1])
		val := ""
		if m := xfsValRe.FindSubmatch(input[0]); len(m) == 2 {
			val = string(m[1])
		}
		values.Set(name, val)
	}
	if values.Get("op") == "" {
		values.Set("op", "download2")
	}
	postReq, err := http.NewRequest(http.MethodPost, pageURL, strings.NewReader(values.Encode()))
	if err != nil {
		return nil
	}
	setUpstreamHeaders(postReq)
	postReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	postReq.Header.Set("Referer", pageURL)
	resp, err := client.Do(postReq)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
	if err != nil {
		return nil
	}
	base, _ := url.Parse(pageURL)
	out := []string{}
	seen := map[string]bool{}
	emit := func(abs string) {
		if len(abs) > maxURLLen || seen[abs] {
			return
		}
		seen[abs] = true
		out = append(out, abs)
	}
	for _, m := range hrefRe.FindAllSubmatch(body, 200) {
		u, err := base.Parse(strings.TrimSpace(string(m[1])))
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			continue
		}
		if mediaExts[extOf(u)] || strings.Contains(u.Path, "/d/") {
			emit(u.String())
		}
	}
	for _, m := range jsFileRe.FindAll(body, 40) {
		emit(string(m))
	}
	return out
}
