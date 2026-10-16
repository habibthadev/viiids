package api

import (
	"fmt"
	"html"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"sort"
	"strconv"
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

	// fzmovies keeps its download keys in the page markup and binds them to
	// the session cookie; walking the chain (movie -> download1 -> download
	// -> dlink) in one cookie jar yields the final CDN file URL.
	fzKeyRe   = regexp.MustCompile(`(?i)["'](download1\.php\?downloadoptionskey=[^"']+)["']`)
	fzDl2Re   = regexp.MustCompile(`(?i)(?:window\.location\.href|location\.href)\s*=\s*["'](download\.php\?[^"']+)["']`)
	fzDlinkRe = regexp.MustCompile(`(?i)["'](dlink\.php\?id=[^"']+)["']`)
	fzInputRe = regexp.MustCompile(`(?i)<input[^>]+value\s*=\s*['"](https?://[^'"]+)['"]`)

	// loadedfiles.net binds each page view to a session cookie and hands out
	// single-use ?pt= tokens: file page -> session pt link -> "generating"
	// page whose Alpine x-data carries the final pt link -> 302 to the CDN.
	lfPtRe      = regexp.MustCompile(`(?i)href="(https?://[^"]+[?&]pt=[^"]+)"`)
	lfLinkRe    = regexp.MustCompile(`(?i)\blink:\s*(?:'([^']+)'|"([^"]+)")`)
	jsUEscapeRe = regexp.MustCompile(`\\u([0-9a-fA-F]{4})`)
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
	base, baseErr := url.Parse(pageURL)
	if len(cands) == 0 && baseErr == nil {
		seeds, pages := discoverLinks(base, body)
		for _, abs := range seeds {
			add(abs)
		}
		if len(cands) == 0 {
			host := base.Hostname()
			switch {
			case unlockHost(host):
				for _, abs := range unlockXFS(pageURL, body) {
					add(abs)
				}
			case isFzHost(host):
				for _, abs := range unlockFzmovies(pageURL) {
					add(abs)
				}
			case isLoadedfilesHost(host):
				for _, abs := range unlockLoadedfiles(pageURL) {
					add(abs)
				}
			default:
				for _, abs := range followPages(pages, pageURL) {
					add(abs)
				}
			}
		}
	}
	if got := verifyFiles(cands, pageURL); len(got) > 0 {
		return got[0]
	}
	return ""
}

// isFzHost reports whether a host serves fzmovies pages.
func isFzHost(host string) bool {
	host = strings.ToLower(host)
	for _, h := range []string{"fzmovies.host", "fzmovies.live", "fzmovies.net", "fzmovies.ng"} {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

// resolveRef turns a possibly-relative reference into an absolute URL.
func resolveRef(base, ref string) string {
	ref = strings.ReplaceAll(strings.TrimSpace(ref), "&amp;", "&")
	if strings.HasPrefix(ref, "http") {
		return ref
	}
	b, err := url.Parse(base)
	if err != nil {
		return ref
	}
	u, err := b.Parse(ref)
	if err != nil {
		return ref
	}
	return u.String()
}

// fzFinalFile digs the final media URL out of a dlink.php answer: either the
// JS redirect or the read-only input value.
func fzFinalFile(body []byte) string {
	for _, m := range jsLocRe.FindAllSubmatch(body, 10) {
		raw := strings.TrimSpace(html.UnescapeString(string(m[1])))
		if isDirectFileURL(raw) {
			return raw
		}
	}
	for _, m := range fzInputRe.FindAllSubmatch(body, 10) {
		raw := strings.TrimSpace(html.UnescapeString(string(m[1])))
		if isDirectFileURL(raw) {
			return raw
		}
	}
	return ""
}

// unlockFzmovies walks the session-bound fzmovies chain for up to three
// qualities and returns the final CDN file URLs.
func unlockFzmovies(pageURL string) []string {
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	client := &http.Client{
		Timeout:       25 * time.Second,
		Jar:           jar,
		CheckRedirect: httpClientShort.CheckRedirect,
	}
	fetch := func(target, referer string) ([]byte, string, bool) {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			return nil, "", false
		}
		setUpstreamHeaders(req)
		if referer != "" {
			req.Header.Set("Referer", referer)
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, "", false
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			return nil, "", false
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
		if err != nil {
			return nil, "", false
		}
		final := target
		if resp.Request != nil && resp.Request.URL != nil {
			final = resp.Request.URL.String()
		}
		return body, final, true
	}
	body, base, ok := fetch(pageURL, "")
	if !ok {
		return nil
	}
	var keys []string
	seen := map[string]bool{}
	for _, m := range fzKeyRe.FindAllSubmatch(body, 40) {
		key := strings.TrimSpace(string(m[1]))
		if seen[key] {
			continue
		}
		seen[key] = true
		keys = append(keys, key)
		if len(keys) >= 3 {
			break
		}
	}
	// Each key needs a serial multi-hop walk; walk the keys in parallel so a
	// slow host does not push one resolve past the request budget.
	finals := make([]string, len(keys))
	var wg sync.WaitGroup
	for i, key := range keys {
		wg.Add(1)
		go func(i int, key string) {
			defer wg.Done()
			dl1 := resolveRef(base, key)
			b1, u1, ok := fetch(dl1, base)
			if !ok {
				return
			}
			final := ""
			if m := fzDl2Re.FindSubmatch(b1); len(m) == 2 {
				dl2 := resolveRef(u1, string(m[1]))
				if b2, u2, ok2 := fetch(dl2, u1); ok2 {
					if m2 := fzDlinkRe.FindSubmatch(b2); len(m2) == 2 {
						dl3 := resolveRef(u2, string(m2[1]))
						if b3, _, ok3 := fetch(dl3, u2); ok3 {
							final = fzFinalFile(b3)
						}
					} else {
						final = fzFinalFile(b2)
					}
				}
			} else {
				final = fzFinalFile(b1)
			}
			finals[i] = final
		}(i, key)
	}
	wg.Wait()

	var out []string
	seenFinal := map[string]bool{}
	for _, f := range finals {
		if f != "" && !seenFinal[f] {
			seenFinal[f] = true
			out = append(out, f)
		}
	}
	return out
}

// pagePriority sorts followable pages: direct file routes and gate hosts
// first, generic "download"-ish pages last.
func pagePriority(abs string) int {
	if isDirectFileURL(abs) {
		return 0
	}
	u, err := url.Parse(abs)
	if err != nil {
		return 2
	}
	pl := strings.ToLower(u.Path)
	if strings.Contains(pl, "/dl/") || unlockHost(u.Hostname()) || isFzHost(u.Hostname()) {
		return 0
	}
	return 1
}

// jsGateLinks digs direct file URLs out of a JS-gated page: inline
// location.href / currentTabUrl redirects and media URLs inside scripts.
// Non-file JS targets get one follow hop before giving up.
func jsGateLinks(pageURL string, page []byte) []string {
	out := []string{}
	seen := map[string]bool{}
	emit := func(abs string) {
		if len(out) >= 8 || seen[abs] {
			return
		}
		seen[abs] = true
		out = append(out, abs)
	}
	var follow []string
	for _, m := range jsLocRe.FindAllSubmatch(page, 15) {
		raw := strings.TrimSpace(html.UnescapeString(string(m[1])))
		if len(raw) > maxURLLen {
			continue
		}
		if isDirectFileURL(raw) {
			emit(raw)
		} else if len(follow) < 3 {
			follow = append(follow, raw)
		}
	}
	for _, m := range jsFileRe.FindAll(page, 20) {
		emit(string(m))
	}
	if len(out) > 0 || len(follow) == 0 {
		return out
	}
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: httpClientShort.CheckRedirect}
	for _, target := range follow {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			continue
		}
		setUpstreamHeaders(req)
		req.Header.Set("Referer", pageURL)
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
		final := target
		if resp.Request != nil && resp.Request.URL != nil {
			final = resp.Request.URL.String()
		}
		resp.Body.Close()
		if err != nil || resp.StatusCode >= 400 {
			continue
		}
		if isDirectFileURL(final) {
			emit(final)
			continue
		}
		for _, m := range jsLocRe.FindAllSubmatch(body, 10) {
			raw := strings.TrimSpace(html.UnescapeString(string(m[1])))
			if isDirectFileURL(raw) {
				emit(raw)
			}
		}
		for _, m := range jsFileRe.FindAll(body, 20) {
			emit(string(m))
		}
	}
	return out
}

// isLoadedfilesHost reports whether host serves loadedfiles.net gate pages.
func isLoadedfilesHost(host string) bool {
	host = strings.ToLower(host)
	return host == "loadedfiles.net" || strings.HasSuffix(host, ".loadedfiles.net")
}

// lfLinkValue picks the populated group from lfLinkRe's quote alternatives.
func lfLinkValue(m [][]byte) string {
	if len(m[1]) > 0 {
		return string(m[1])
	}
	return string(m[2])
}

// decodeJSString unescapes the \uXXXX and \/ sequences JS embeds in strings
// (Alpine x-data attributes arrive HTML- and JS-escaped).
func decodeJSString(s string) string {
	s = jsUEscapeRe.ReplaceAllStringFunc(s, func(m string) string {
		n, err := strconv.ParseUint(m[2:], 16, 32)
		if err != nil {
			return m
		}
		return string(rune(n))
	})
	s = strings.ReplaceAll(s, `\/`, "/")
	return html.UnescapeString(s)
}

// unlockLoadedfiles walks the loadedfiles.net session-bound gate chain and
// returns the CDN file URL (or nothing when the gate is uncooperative).
func unlockLoadedfiles(pageURL string) []string {
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	client := &http.Client{
		Timeout: 25 * time.Second,
		Jar:     jar,
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
	// The last hop answers 302 with the CDN target: keep it, do not follow.
	rawClient := &http.Client{
		Timeout:       25 * time.Second,
		Jar:           jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse },
	}
	fetch := func(c *http.Client, target, referer string) ([]byte, string, bool) {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			return nil, "", false
		}
		setUpstreamHeaders(req)
		if referer != "" {
			req.Header.Set("Referer", referer)
		}
		resp, err := c.Do(req)
		if err != nil {
			return nil, "", false
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			return nil, "", false
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
		if err != nil {
			return nil, "", false
		}
		final := target
		if resp.Request != nil && resp.Request.URL != nil {
			final = resp.Request.URL.String()
		}
		return body, final, true
	}
	body, base, ok := fetch(client, pageURL, "")
	if !ok {
		return nil
	}
	// Hop 1: the gate page carries the session pt link. When we already land
	// on the generating page we go straight to the x-data link.
	var next string
	if m := lfLinkRe.FindSubmatch(body); len(m) == 3 {
		if cand := decodeJSString(lfLinkValue(m)); strings.Contains(cand, "?pt=") {
			next = cand
		}
	}
	if next == "" {
		if m := lfPtRe.FindSubmatch(body); len(m) == 2 {
			next = html.UnescapeString(string(m[1]))
		}
	}
	if next == "" {
		return nil
	}
	// Hop 2: the pt link answers with the "generating" page (cookie-bound).
	body2, base2, ok := fetch(client, resolveRef(base, next), base)
	if !ok {
		return nil
	}
	m := lfLinkRe.FindSubmatch(body2)
	if len(m) != 3 {
		return nil
	}
	finalURL := resolveRef(base2, decodeJSString(lfLinkValue(m)))
	if !strings.Contains(finalURL, "?pt=") {
		return nil
	}
	// Hop 3: this link 302s to the CDN file.
	req, err := http.NewRequest(http.MethodGet, finalURL, nil)
	if err != nil {
		return nil
	}
	setUpstreamHeaders(req)
	req.Header.Set("Referer", base2)
	resp, err := rawClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if loc := resp.Header.Get("Location"); resp.StatusCode >= 300 && resp.StatusCode < 400 && loc != "" {
		abs := resolveRef(finalURL, loc)
		if guardURL(abs) == nil {
			return []string{abs}
		}
		return nil
	}
	// Some sessions answer 200 with the file directly.
	if resp.StatusCode == 200 {
		ct := strings.ToLower(resp.Header.Get("Content-Type"))
		if isMediaContentType(ct) || (mediaExts[extOf(mustParseURL(finalURL))] && !strings.Contains(ct, "text/html")) {
			return []string{finalURL}
		}
	}
	return nil
}

// mustParseURL is a best-effort parse for extension checks.
func mustParseURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		return &url.URL{}
	}
	return u
}

// followPages opens discovered wrapper pages (/dl/ redirectors, gated hosts,
// download routes), unlocks them and returns verified direct files.
func followPages(pages []string, referer string) []string {
	if len(pages) == 0 {
		return nil
	}
	sorted := append([]string(nil), pages...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return pagePriority(sorted[i]) < pagePriority(sorted[j])
	})
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	client := &http.Client{
		Timeout:       20 * time.Second,
		Jar:           jar,
		CheckRedirect: httpClientShort.CheckRedirect,
	}
	var out []string
	for i, pageURL := range sorted {
		if i >= 3 || len(out) >= 4 {
			break
		}
		req, err := http.NewRequest(http.MethodGet, pageURL, nil)
		if err != nil {
			continue
		}
		setUpstreamHeaders(req)
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBytes))
		final := pageURL
		if resp.Request != nil && resp.Request.URL != nil {
			final = resp.Request.URL.String()
		}
		resp.Body.Close()
		if err != nil || resp.StatusCode >= 400 {
			continue
		}
		var cands []string
		seen := map[string]bool{}
		add := func(abs string) {
			if len(cands) >= 6 || seen[abs] {
				return
			}
			seen[abs] = true
			cands = append(cands, abs)
		}
		if u, err := url.Parse(final); err == nil {
			host := u.Hostname()
			switch {
			case unlockHost(host):
				for _, abs := range unlockXFS(final, body) {
					add(abs)
				}
			case isFzHost(host):
				for _, abs := range unlockFzmovies(final) {
					add(abs)
				}
			case isLoadedfilesHost(host):
				for _, abs := range unlockLoadedfiles(final) {
					add(abs)
				}
			}
		}
		extractEmbeddedFiles(final, body, add)
		out = append(out, verifyFiles(cands, referer)...)
	}
	return out
}

// unlockHost reports whether a page host is a known gated file host we can
// open server-side (XFS-style form or embedded JS token link).
func unlockHost(host string) bool {
	host = strings.ToLower(host)
	for _, h := range []string{"downloadwella.com", "meetdownload.com", "wetafiles.com"} {
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
		// No hidden form: gates like meetdownload expose the file through an
		// inline JS redirect (download button sets location.href).
		return jsGateLinks(pageURL, page)
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
