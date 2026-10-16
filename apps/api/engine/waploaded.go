package engine

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gocolly/colly/v2"
	log "github.com/sirupsen/logrus"
)

// WaploadedEngine : An Engine for Waploaded (https://waploaded.com)
type WaploadedEngine struct {
	Props
	ListCategories  []string
	seasonCollector *colly.Collector
}

// waitDownloadProps flushes season-page fetches spawned while detail pages
// were being harvested (they run on their own async collector).
func (engine *WaploadedEngine) waitDownloadProps() {
	if engine.seasonCollector != nil {
		engine.seasonCollector.Wait()
	}
}

// NewWaploadedEngine : Constructor for Waploaded engine
func NewWaploadedEngine() *WaploadedEngine {
	base := "https://waploaded.com/"
	baseURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL.Path = "/search"

	listURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	listURL.Path = "/trending/movie"

	e := WaploadedEngine{}
	e.Name = "Waploaded"
	e.BaseURL = baseURL
	e.Description = `Waploaded entertainment forum for movies and series downloads.`
	e.SearchURL = searchURL
	e.ListURL = listURL
	e.ListCategories = []string{"/trending/movie", "/trending/series"}
	return &e
}

// String : pretty print engine
func (engine *WaploadedEngine) String() string {
	return fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
}

var (
	// "… [604.36MB]" rides inside the meta description of film pages.
	wpSizeRe   = regexp.MustCompile(`\[([\d.,]+\s?(?:MB|GB))\]`)
	wpSeasonRe = regexp.MustCompile(`(?i)\bseason\s*\d+`)
	wpPageRe   = regexp.MustCompile(`/page/(\d+)`)
	wpPageCap  = 5
)

func (engine *WaploadedEngine) getParseAttrs() (string, string, error) {
	// Verified 2026-09-06: results are div.file_card inside div.file_item.
	// Title: h1.file_title a, cover: .file_card_item_header img, meta: .file_cat_strip
	switch engine.mode {
	case SearchMode:
		return "body", "div.file_card", nil
	case ListMode:
		return "body", "div.file_card", nil
	default:
		return "", "", fmt.Errorf("Invalid mode %v", engine.mode)
	}
}

func (engine *WaploadedEngine) parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error) {
	movie := Movie{
		Index:    index,
		IsSeries: false,
		Source:   engine.Name,
	}
	title := strings.TrimSpace(el.ChildText("h1.file_title a"))
	if title == "" {
		title = strings.TrimSpace(el.ChildText(".file_card_item_content a"))
	}
	movie.Title = cleanMovieTitle(title)
	movie.CoverPhotoLink = el.ChildAttr(".file_card_item_header img", "src")
	if movie.CoverPhotoLink == "" {
		movie.CoverPhotoLink = el.ChildAttr("img", "src")
	}
	movie.UploadDate = strings.TrimSpace(el.ChildText(".file_cat_strip"))

	link := el.ChildAttr("h1.file_title a", "href")
	if link == "" {
		link = el.ChildAttr(".file_card_item_content a", "href")
	}
	if link == "" {
		link = el.ChildAttr("a", "href")
	}
	downloadLink, err := url.Parse(el.Request.AbsoluteURL(link))
	if err != nil {
		return movie, err
	}
	movie.DownloadLink = downloadLink
	// Series live on shows.waploaded.com under /series/<id>/<slug>.
	if looksLikeSeries(movie.Title) || looksLikeSeries(downloadLink.Path) ||
		strings.Contains(downloadLink.Hostname(), "shows.waploaded.com") {
		movie.IsSeries = true
	}

	movie.Year = movieYear(movie.Title)
	if movie.Title == "" || movie.DownloadLink.String() == "" {
		return movie, fmt.Errorf("empty title/link, selector likely stale for %s", el.Request.URL)
	}
	return movie, nil
}

func (engine *WaploadedEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	// Episodes sit two hops deep: show page -> season page. A dedicated
	// collector follows the season links with the movie context attached so
	// episode URLs land in SDownloadLink as SxxEyy keys.
	// colly's Async option turns async on regardless of its argument; seasons
	// run on this collector in parallel and are awaited via waitDownloadProps.
	seasonCollector := colly.NewCollector(colly.Async(true))
	engine.seasonCollector = seasonCollector
	seasonCollector.SetRequestTimeout(12 * time.Second)
	seasonCollector.OnRequest(func(r *colly.Request) {
		r.Headers.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		r.Headers.Set("User-Agent", browserUA)
		if r.URL.Host != "" {
			r.Headers.Set("Referer", "https://"+r.URL.Host+"/")
		}
	})
	seasonCollector.OnResponseHeaders(func(r *colly.Response) {
		if !strings.Contains(r.Headers.Get("Content-Type"), "text") {
			r.Request.Abort()
		}
	})
	seasonCollector.OnError(func(r *colly.Response, err error) {
		log.Errorf("waploaded season fetch failed %v: %v status=%d", r.Request.URL, err, r.StatusCode)
	})

	// A show's seasons fetch in parallel and all write the same movie's
	// SDownloadLink map, so guard those writes.
	var sMu sync.Mutex
	addEpisode := func(movie *Movie, key string, u *url.URL) {
		sMu.Lock()
		defer sMu.Unlock()
		if movie.SDownloadLink == nil {
			movie.SDownloadLink = map[string]*url.URL{}
		}
		movie.SDownloadLink[key] = u
		movie.IsSeries = true
	}

	seasonCollector.OnHTML("a", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		text := strings.TrimSpace(e.Attr("title"))
		if text == "" {
			text = strings.TrimSpace(e.Text)
		}
		if key, ok := episodeKey(text, href); ok {
			if movie, ok := movieForRequest(movies, e.Request); ok {
				if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
					addEpisode(movie, key, u)
				}
			}
			return
		}
		// Season pages paginate 15 episodes at a time ("Next Page 2");
		// follow the remaining pages with the same movie context.
		if m := wpPageRe.FindStringSubmatch(href); m != nil {
			n, _ := strconv.Atoi(m[1])
			base := e.Request.URL.Path
			if i := strings.Index(base, "/page/"); i >= 0 {
				base = base[:i]
			}
			if n >= 2 && n <= wpPageCap {
				if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
					pageBase := u.Path
					if i := strings.Index(pageBase, "/page/"); i >= 0 {
						pageBase = pageBase[:i]
					}
					if pageBase == base {
						_ = seasonCollector.Request("GET", u.String(), nil, e.Request.Ctx, nil)
					}
				}
			}
		}
	})

	harvest := func(e *colly.HTMLElement) {
		href := e.Attr("href")
		lower := strings.ToLower(href)
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		text := strings.TrimSpace(e.Attr("title"))
		if text == "" {
			text = strings.TrimSpace(e.Text)
		}
		// Episode links can also sit directly on a show page.
		if strings.Contains(href, "/series/") {
			if key, isEp := episodeKey(text, href); isEp {
				if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
					addEpisode(movie, key, u)
				}
				return
			}
			// Season cards ("… Season 2") — follow them with the context.
			if wpSeasonRe.MatchString(text) {
				seasonURL := e.Request.AbsoluteURL(href)
				if seasonURL != "" && seasonURL != e.Request.URL.String() {
					ctx := colly.NewContext()
					ctx.Put("movieIndex", e.Request.Ctx.Get("movieIndex"))
					if err := seasonCollector.Request("GET", seasonURL, nil, ctx, nil); err != nil {
						log.Errorf("waploaded season request %v: %v", seasonURL, err)
					}
				}
				return
			}
		}
		// Direct download routes (/dl/<hash>/…) and gated file hosts.
		if strings.Contains(lower, "/dl/") ||
			strings.Contains(lower, "meetdownload.com") ||
			strings.Contains(lower, "downloadwella.com") {
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				movie.DownloadLink = u
			}
			return
		}
		// Generic fallback: direct media file links.
		if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") || strings.HasSuffix(lower, ".avi") {
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				movie.DownloadLink = u
			}
		}
	}
	downloadCollector.OnHTML("a", harvest)

	// Film pages carry size (and a description) in their meta tags.
	fromMeta := func(e *colly.HTMLElement) {
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		content := e.Attr("content")
		if movie.Size == "" {
			if m := wpSizeRe.FindStringSubmatch(content); len(m) == 2 {
				movie.Size = m[1]
			}
		}
		desc := strings.TrimSpace(wpSizeRe.ReplaceAllString(content, ""))
		if movie.Description == "" && len(desc) > 40 {
			movie.Description = desc
		}
	}
	downloadCollector.OnHTML(`meta[itemprop="description"]`, fromMeta)
	downloadCollector.OnHTML(`meta[property="og:description"]`, fromMeta)
	downloadCollector.OnHTML(`meta[name="description"]`, fromMeta)

	// The download button's data-url can expose the meetdownload target.
	downloadCollector.OnHTML("[data-url]", func(e *colly.HTMLElement) {
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		dataURL := e.Attr("data-url")
		if !strings.Contains(dataURL, "meetdownload.com") {
			return
		}
		cur := strings.ToLower(movie.DownloadLink.String())
		if strings.Contains(cur, "/dl/") || strings.Contains(cur, "meetdownload") {
			return
		}
		if u, err := url.Parse(e.Request.AbsoluteURL(dataURL)); err == nil {
			movie.DownloadLink = u
		}
	})
}

// List : list trending movies and series in one pass.
func (engine *WaploadedEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	out := make([][]Movie, len(engine.ListCategories))
	errs := make([]error, len(engine.ListCategories))
	var wg sync.WaitGroup
	for i, category := range engine.ListCategories {
		wg.Add(1)
		go func(i int, category string) {
			defer wg.Done()
			eng := NewWaploadedEngine()
			eng.mode = ListMode
			if u, err := url.Parse("https://waploaded.com" + category); err == nil {
				eng.ListURL = u
			}
			movies, err := Scrape(eng)
			if err != nil {
				log.Errorf("scrape failed: %v", err)
				errs[i] = err
				return
			}
			out[i] = movies
		}(i, category)
	}
	wg.Wait()
	movies := []Movie{}
	failed := 0
	for i, m := range out {
		movies = append(movies, m...)
		if len(m) == 0 && errs[i] != nil {
			failed++
		}
	}
	if len(movies) == 0 && failed > 0 {
		result.Error = "source unreachable, try again"
		for _, e := range errs {
			if e != nil {
				result.Error = e.Error()
				break
			}
		}
	}
	result.Movies = movies
	return result
}

// Search : search waploaded. The site's file search is currently broken
// (every type answers "No results found"); the canonical URLs are used so
// results appear the moment it recovers.
func (engine *WaploadedEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	types := []string{"movie", "series"}
	out := make([][]Movie, len(types))
	errs := make([]error, len(types))
	var wg sync.WaitGroup
	for i, typ := range types {
		wg.Add(1)
		go func(i int, typ string) {
			defer wg.Done()
			eng := NewWaploadedEngine()
			eng.mode = SearchMode
			u, err := url.Parse(fmt.Sprintf("https://waploaded.com/search/%s/page/1", url.PathEscape(query)))
			if err != nil {
				errs[i] = err
				return
			}
			q := u.Query()
			q.Set("type", typ)
			u.RawQuery = q.Encode()
			eng.SearchURL = u
			movies, err := Scrape(eng)
			if err != nil {
				log.Errorf("scrape failed: %v", err)
				errs[i] = err
				return
			}
			out[i] = movies
		}(i, typ)
	}
	wg.Wait()
	movies := []Movie{}
	for _, m := range out {
		movies = append(movies, m...)
	}
	if len(movies) == 0 {
		for _, e := range errs {
			if e != nil {
				result.Error = e.Error()
				break
			}
		}
	}
	result.Movies = movies
	return result
}
