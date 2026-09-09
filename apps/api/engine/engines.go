package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
	log "github.com/sirupsen/logrus"
)

// Mode : The mode of operation for scraping
type Mode int

const (
	// SearchMode : in this mode a query is searched for
	SearchMode Mode = iota
	// ListMode : in this mode a page is looked up
	ListMode
)

func (m Mode) String() string {
	return [...]string{"Search", "List"}[m]
}

var (
	seriesTitleRe = regexp.MustCompile(`(?i)(season|episodes?|tv series|\bS\d{1,2}E\d{1,2}\b|complete[^.]{0,20}series|series[^.]{0,20}complete|\bS\d{2}\b)`)
	epLabelRe     = regexp.MustCompile(`(?i)season\s*(\d+)\s*episode\s*(\d+)`)
	epHeadingRe   = regexp.MustCompile(`(?i)episode\s*(\d+)`)
	epSlugRe      = regexp.MustCompile(`(?i)[^a-z0-9]S(\d{1,2})E(\d{1,2})([^a-z0-9]|$)`)
)

// looksLikeSeries reports whether a listing title reads as a series/season pack.
func looksLikeSeries(title string) bool {
	return seriesTitleRe.MatchString(title)
}

// looksLikeFileLink reports whether href points at a file host or media file.
// Episode harvesting requires this so nav/sidebar anchors never flag a movie.
func looksLikeFileLink(href string) bool {
	lower := strings.ToLower(href)
	if strings.Contains(lower, "downloadwella") || strings.Contains(lower, "meetdownload") {
		return true
	}
	switch extOfHref(href) {
	case ".mp4", ".mkv", ".avi", ".webm", ".mov", ".m4v", ".mp3", ".flv":
		return true
	}
	return strings.Contains(lower, "/download") || strings.Contains(lower, "download.") || strings.HasSuffix(lower, "download")
}

func extOfHref(href string) string {
	parts := strings.Split(strings.Split(href, "?")[0], "/")
	last := parts[len(parts)-1]
	if i := strings.LastIndex(last, "."); i >= 0 {
		return strings.ToLower(last[i:])
	}
	return ""
}

// episodeKey derives a stable SxxEyy key from link text or URL slug.
// ok is false when neither carries an episode marker.
func episodeKey(text, href string) (key string, ok bool) {
	if m := epLabelRe.FindStringSubmatch(text); len(m) == 3 {
		return fmt.Sprintf("S%02sE%02s", pad2(m[1]), pad2(m[2])), true
	}
	if m := epSlugRe.FindStringSubmatch(href); len(m) == 4 {
		return fmt.Sprintf("S%02sE%02s", pad2(m[1]), pad2(m[2])), true
	}
	if m := epHeadingRe.FindStringSubmatch(text); len(m) == 2 {
		return "E" + pad2(m[1]), true
	}
	return "", false
}

func pad2(s string) string {
	if len(s) >= 2 {
		return s
	}
	return "0" + s
}

// Engine : interface for all engines
type Engine interface {
	getName() string
	getParseURL() *url.URL
	Search(param ...string) SearchResult
	List(page int) SearchResult
	String() string
	parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error)
	getParseAttrs() (string, string, error)
	updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie)
}

const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Scrape : Parse queries a url and return results (no disk cache, no chrome driver)
func Scrape(engine Engine) ([]Movie, error) {
	c := colly.NewCollector(
		colly.Async(false),
		colly.MaxDepth(2),
	)
	c.SetRequestTimeout(12 * time.Second)

	downloadLinkCollector := c.Clone()
	downloadLinkCollector.SetRequestTimeout(12 * time.Second)

	movieIndex := 0
	var movies []Movie

	engine.updateDownloadProps(downloadLinkCollector, &movies)

	main, article, err := engine.getParseAttrs()
	if err != nil {
		return nil, err
	}

	c.OnHTML(main, func(e *colly.HTMLElement) {
		e.ForEach(article, func(_ int, el *colly.HTMLElement) {
			movie, err := engine.parseSingleMovie(el, movieIndex)
			if err != nil {
				log.Debugf("%v could not be parsed: %v", movie, err)
			} else {
				movies = append(movies, movie)
				downloadLinkCollector.Visit(movie.DownloadLink.String())
				movieIndex++
			}
		})
	})

	applyHeaders := func(r *colly.Request) {
		r.Headers.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		r.Headers.Set("User-Agent", browserUA)
		if r.URL.Host != "" {
			r.Headers.Set("Referer", "https://"+r.URL.Host+"/")
		}
	}

	c.OnRequest(func(r *colly.Request) {
		applyHeaders(r)
		log.Debugf("Visiting %v", r.URL.String())
	})

	// Capture source-side failures (blocks, timeouts) so an empty result
	// can be reported honestly instead of looking like "no matches".
	var firstErr error
	c.OnError(func(r *colly.Response, err error) {
		if firstErr == nil {
			if r.StatusCode == 403 {
				firstErr = fmt.Errorf("source blocked this request (403), try again shortly")
			} else {
				firstErr = fmt.Errorf("source answered %d", r.StatusCode)
			}
			_ = err
		}
	})

	downloadLinkCollector.OnRequest(func(r *colly.Request) {
		applyHeaders(r)
		for i, movie := range movies {
			if movie.DownloadLink.String() == r.URL.String() {
				log.Debugf("Retrieving Download Link %v", movie.DownloadLink)
				r.Ctx.Put("movieIndex", strconv.Itoa(i))
			}
		}
	})

	downloadLinkCollector.OnResponseHeaders(func(r *colly.Response) {
		if !strings.Contains(r.Headers.Get("Content-Type"), "text") {
			r.Request.Abort()
		}
	})

	if err := c.Visit(engine.getParseURL().String()); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	}
	c.Wait()
	downloadLinkCollector.Wait()
	if len(movies) == 0 && firstErr != nil {
		return movies, firstErr
	}
	return movies, nil
}

// Movie : the structure of all downloadable movies
type Movie struct {
	Index          int
	Title          string
	CoverPhotoLink string
	Description    string
	Size           string
	DownloadLink   *url.URL
	Year           int
	IsSeries       bool
	SDownloadLink  map[string]*url.URL
	Quality        string
	Category       string
	Cast           string
	UploadDate     string
	Source         string
	SubtitleLink   *url.URL
	SubtitleLinks  map[string]*url.URL
	ImdbLink       string
	Tags           string
}

// MovieJSON : JSON structure of all downloadable movies
type MovieJSON struct {
	Movie
	DownloadLink  string
	SDownloadLink map[string]string
	SubtitleLinks map[string]string
}

func (m *Movie) String() string {
	return fmt.Sprintf("%s (%v)", m.Title, m.Year)
}

// MarshalJSON Json structure to return from api
func (m *Movie) MarshalJSON() ([]byte, error) {
	sDownloadLink := make(map[string]string)
	for key, val := range m.SDownloadLink {
		if val != nil {
			sDownloadLink[key] = val.String()
		}
	}
	subtitleLinks := make(map[string]string)
	for key, val := range m.SubtitleLinks {
		if val != nil {
			subtitleLinks[key] = val.String()
		}
	}
	dl := ""
	if m.DownloadLink != nil {
		dl = m.DownloadLink.String()
	}
	movie := MovieJSON{
		Movie:         *m,
		DownloadLink:  dl,
		SDownloadLink: sDownloadLink,
		SubtitleLinks: subtitleLinks,
	}
	return json.Marshal(movie)
}

// SearchResult : the results of search from engine
type SearchResult struct {
	Query  string
	Movies []Movie
	Error  string `json:"-"`
}

// Titles : Get a slice of the titles of movies
func (s *SearchResult) Titles() []string {
	var titles []string
	for _, movie := range s.Movies {
		titles = append(titles, movie.Title)
	}
	return titles
}

// GetMovieByTitle : Return a movie object from title passed
func (s *SearchResult) GetMovieByTitle(title string) (Movie, error) {
	for _, movie := range s.Movies {
		if movie.Title == title {
			return movie, nil
		}
	}
	return Movie{}, errors.New("Movie not Found")
}

// PlatformMeta describes one of the 5 supported platforms.
type PlatformMeta struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	BaseURL     string `json:"baseUrl"`
	Description string `json:"description"`
}

// GetEngines : Returns all the usable engines in the application
func GetEngines() map[string]Engine {
	engines := make(map[string]Engine)
	engines["netnaija"] = NewNetNaijaEngine()
	engines["nkiri"] = NewNkiriEngine()
	engines["thenkiri"] = NewNkiriEngine()
	engines["nkiri"] = NewNkiriEngine()
	engines["fzmovies"] = NewFzEngine()
	engines["waploaded"] = NewWaploadedEngine()
	engines["o2tvseries"] = NewO2TVSeriesEngine()
	return engines
}

// CanonicalPlatformIDs lists the 5 supported platforms in UI order.
func CanonicalPlatformIDs() []string {
	return []string{"netnaija", "nkiri", "waploaded", "fzmovies", "o2tvseries"}
}

// GetEngine : Return an engine (accepts nkiri alias too)
func GetEngine(name string) (Engine, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "thenkiri" {
		key = "nkiri"
	}
	if key == "02tvseries" {
		key = "o2tvseries"
	}
	e := GetEngines()[key]
	if e == nil {
		return nil, fmt.Errorf("platform %s does not exist", name)
	}
	return e, nil
}

// GetPlatforms returns metadata for the 5 canonical platforms.
func GetPlatforms() []PlatformMeta {
	out := []PlatformMeta{}
	for _, id := range CanonicalPlatformIDs() {
		if _, err := GetEngine(id); err != nil {
			continue
		}
		var name, base, desc string
		switch id {
		case "netnaija":
			n := NewNetNaijaEngine()
			name, base, desc = n.Name, n.BaseURL.String(), n.Description
		case "nkiri":
			n := NewNkiriEngine()
			name, base, desc = n.Name, n.BaseURL.String(), n.Description
		case "waploaded":
			n := NewWaploadedEngine()
			name, base, desc = n.Name, n.BaseURL.String(), n.Description
		case "fzmovies":
			n := NewFzEngine()
			name, base, desc = n.Name, n.BaseURL.String(), n.Description
		case "o2tvseries":
			n := NewO2TVSeriesEngine()
			name, base, desc = n.Name, n.BaseURL.String(), n.Description
		}
		out = append(out, PlatformMeta{ID: id, Name: name, BaseURL: base, Description: desc})
	}
	return out
}

// movieForRequest returns the movie a download-collector request belongs to.
// The second return is false when the context is missing or stale — callers
// must skip instead of touching movies[0] by accident.
func movieForRequest(movies *[]Movie, r *colly.Request) (*Movie, bool) {
	idx, err := strconv.Atoi(r.Ctx.Get("movieIndex"))
	if err != nil || idx < 0 || idx >= len(*movies) {
		return nil, false
	}
	return &(*movies)[idx], true
}

// getMovieIndexFromCtx returns the movie index stored in request context,
// or -1 when missing/stale. Prefer movieForRequest in new code.
func getMovieIndexFromCtx(r *colly.Request) int {
	movieIndex, err := strconv.Atoi(r.Ctx.Get("movieIndex"))
	if err != nil {
		return -1
	}
	return movieIndex
}
