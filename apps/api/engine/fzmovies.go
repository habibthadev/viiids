package engine

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/gocolly/colly/v2"
	log "github.com/sirupsen/logrus"
)

// FzEngine : An Engine for FzMovies
type FzEngine struct {
	Props
}

// NewFzEngine : A Movie Engine Constructor for FzEngine
func NewFzEngine() *FzEngine {
	base := "https://fzmovies.ng/"
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

	// List URL — WordPress homepage
	listURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	listURL.Path = "/"

	fzEngine := FzEngine{}
	fzEngine.Name = "FzMovies"
	fzEngine.BaseURL = baseURL
	fzEngine.Description = `FzMovies is a site where you can find Bollywood, Hollywood and DHollywood Movies.`
	fzEngine.SearchURL = searchURL
	fzEngine.ListURL = listURL
	return &fzEngine
}

// Engine Interface Methods

func (engine *FzEngine) String() string {
	st := fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
	return st
}

func (engine *FzEngine) getParseAttrs() (string, string, error) {
	// Verified 2026-09-06 on fzmovies.ng (magsoul theme, same as thenetnaija.ng)
	return "body", "div.magsoul-grid-post", nil
}

func (engine *FzEngine) parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error) {
	movie := Movie{
		Index:    index,
		IsSeries: false,
		Source:   engine.Name,
	}
	cover, err := url.Parse(el.Request.AbsoluteURL(el.ChildAttr("img", "src")))
	if err != nil {
		return movie, err
	}
	movie.CoverPhotoLink = cover.String()
	movie.Title = strings.TrimSpace(el.ChildText("h3.magsoul-grid-post-title a"))
	if movie.Title == "" {
		movie.Title = strings.TrimSpace(el.ChildText("h3 a"))
	}
	movie.UploadDate = strings.TrimSpace(el.ChildText(".magsoul-grid-post-meta"))
	movie.Description = strings.TrimSpace(el.ChildText("p"))
	downloadLink, err := url.Parse(el.Request.AbsoluteURL(el.ChildAttr("h3.magsoul-grid-post-title a", "href")))
	if err != nil {
		return movie, err
	}
	if downloadLink.String() == "" {
		downloadLink, err = url.Parse(el.Request.AbsoluteURL(el.ChildAttr("a", "href")))
		if err != nil {
			return movie, err
		}
	}
	if looksLikeSeries(movie.Title) || looksLikeSeries(downloadLink.Path) {
		movie.IsSeries = true
	}
	movie.DownloadLink = downloadLink
	if movie.Title != "" {
		if yr := regexp.MustCompile(`\((\d{4})\)`).FindStringSubmatch(movie.Title); len(yr) > 1 {
			if y, err := strconv.Atoi(yr[1]); err == nil {
				movie.Year = y
			}
		}
	}
	if movie.Title == "" {
		return movie, fmt.Errorf("empty title, selector stale for %s", el.Request.URL)
	}
	return movie, nil
}

func (engine *FzEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	// New fzmovies.ng detail pages: harvest direct media / download links.
	downloadCollector.OnHTML("a", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		lower := strings.ToLower(href)
		if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") ||
			strings.Contains(lower, "download") && (strings.Contains(lower, ".mp4") || strings.Contains(lower, ".mkv")) {
			movie, ok := movieForRequest(movies, e.Request)
			if !ok {
				return
			}
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				cur := strings.ToLower(movie.DownloadLink.String())
				if !strings.HasSuffix(cur, ".mp4") && !strings.HasSuffix(cur, ".mkv") {
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
func (engine *FzEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	base := "https://fzmovies.ng/"
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

// Search : Searches fzmovies (WordPress ?s=<query>) for a particular query
func (engine *FzEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	base := "https://fzmovies.ng/"
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
