package engine

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/gocolly/colly/v2"
	log "github.com/sirupsen/logrus"
)

// NetNaijaEngine : An Engine for  NetNaija
type NetNaijaEngine struct {
	Props
}

// NewNetNaijaEngine : A Movie Engine Constructor for NetNaija
func NewNetNaijaEngine() *NetNaijaEngine {
	base := "https://thenetnaija.ng/"
	baseURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	// Search URL — WordPress: /?s=<query>
	searchURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL.Path = "/"

	// List URL — WordPress homepage with pagination /page/<n>/
	listURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	listURL.Path = "/"

	netNaijaEngine := NetNaijaEngine{}
	netNaijaEngine.Name = "NetNaija"
	netNaijaEngine.BaseURL = baseURL
	netNaijaEngine.Description = `
			Nigerian forum and media download center.
			Developed and owned by Analike Emmanuel Bridge`
	netNaijaEngine.SearchURL = searchURL
	netNaijaEngine.ListURL = listURL
	return &netNaijaEngine
}

// Engine Interface Methods

func (engine *NetNaijaEngine) String() string {
	return fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
}

func (engine *NetNaijaEngine) getParseAttrs() (string, string, error) {
	// Verified 2026-09-06 on thenetnaija.ng (magsoul theme):
	// cards are div.magsoul-grid-post, title h3.magsoul-grid-post-title a
	switch engine.mode {
	case SearchMode:
		return "body", "div.magsoul-grid-post", nil
	case ListMode:
		return "body", "div.magsoul-grid-post", nil
	default:
		return "", "", fmt.Errorf("Invalid mode %v", engine.mode)
	}
}

func (engine *NetNaijaEngine) parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error) {
	movie := Movie{
		Index:    index,
		IsSeries: false,
		Source:   engine.Name,
	}

	// Covers are lazy-loaded: src is a placeholder gif, the real image
	// sits in data-src.
	movie.CoverPhotoLink = bestImgURL(el, "img")
	movie.Title = strings.TrimSpace(el.ChildText("h3.magsoul-grid-post-title a"))
	if movie.Title == "" {
		movie.Title = strings.TrimSpace(el.ChildText("h3 a"))
	}
	// Remove Video:/Movie: prefixes if present, then strip source suffixes
	// ("Khalifa (2026) Movie Download" -> "Khalifa (2026)").
	movie.Title = strings.TrimSpace(
		strings.TrimPrefix(
			strings.TrimPrefix(movie.Title, "Movie:"),
			"Video:"))
	movie.Title = cleanMovieTitle(movie.Title)
	movie.UploadDate = strings.TrimSpace(el.ChildText(".magsoul-grid-post-meta, .magsoul-post-date"))
	movie.Description = strings.TrimSpace(el.ChildText("p"))
	downloadLink, err := url.Parse(el.Request.AbsoluteURL(el.ChildAttr("h3.magsoul-grid-post-title a", "href")))

	if err != nil {
		return movie, err
	}
	if downloadLink.String() == "" || el.Request.AbsoluteURL("") == downloadLink.String() {
		downloadLink, err = url.Parse(el.Request.AbsoluteURL(el.ChildAttr("a", "href")))
		if err != nil {
			return movie, err
		}
	}

	if strings.Contains(strings.ToLower(downloadLink.Path), "series") || looksLikeSeries(movie.Title) || looksLikeSeries(downloadLink.Path) {
		movie.IsSeries = true
	}
	movie.DownloadLink = downloadLink
	if movie.Title != "" {
		movie.Year = movieYear(movie.Title)
	}
	if movie.Title == "" {
		return movie, fmt.Errorf("empty title, selector stale for %s", el.Request.URL)
	}
	return movie, nil
}

func (engine *NetNaijaEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	// New thenetnaija.ng detail pages host download buttons pointing to
	// meetdownload.com / direct .mkv/.mp4. Series posts list one anchor per
	// episode ("SEASON 1 EPISODE 2 DOWNLOAD") — those become episode entries.
	downloadCollector.OnHTML("a", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		lower := strings.ToLower(href)
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		if key, isEp := episodeKey(strings.TrimSpace(e.Text), href); isEp && looksLikeFileLink(href) {
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				if movie.SDownloadLink == nil {
					movie.SDownloadLink = map[string]*url.URL{}
				}
				movie.SDownloadLink[key] = u
				movie.IsSeries = true
			}
			return
		}
		if strings.Contains(lower, "meetdownload") ||
			strings.Contains(lower, "downloadwella") ||
			strings.Contains(lower, "download") && (strings.Contains(lower, ".mkv") || strings.Contains(lower, ".mp4")) ||
			strings.HasSuffix(lower, ".mkv") ||
			strings.HasSuffix(lower, ".mp4") {
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				cur := strings.ToLower(movie.DownloadLink.String())
				if !strings.Contains(cur, "meetdownload") && !strings.Contains(cur, "downloadwella") &&
					!strings.HasSuffix(cur, ".mkv") && !strings.HasSuffix(cur, ".mp4") {
					movie.DownloadLink = u
				}
			}
		}
	})
	downloadCollector.OnHTML("p", func(e *colly.HTMLElement) {
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		if movie.Description == "" {
			if txt := strings.TrimSpace(e.Text); len(txt) > 40 {
				movie.Description = txt
			}
		}
	})
}

// List : list all the movies on a page (WordPress /page/<n>/)
func (engine *NetNaijaEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	base := "https://thenetnaija.ng/"
	u, _ := url.Parse(base)
	if page > 1 {
		u.Path = fmt.Sprintf("/page/%d/", page)
	} else {
		u.Path = "/"
	}
	engine.ListURL = u
	movies, err := Scrape(engine)
	if err != nil {
		log.Errorf("scrape failed: %v", err)
		result.Error = err.Error()
	}
	result.Movies = movies
	return result
}

// Search : Searches netnaija (WordPress ?s=<query>) and returns movies
func (engine *NetNaijaEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	base := "https://thenetnaija.ng/"
	u, _ := url.Parse(base)
	engine.SearchURL = u
	q := engine.SearchURL.Query()
	q.Set("s", query)
	engine.SearchURL.RawQuery = q.Encode()
	movies, err := Scrape(engine)
	if err != nil {
		log.Errorf("scrape failed: %v", err)
		result.Error = err.Error()
	}
	result.Movies = movies
	return result
}
