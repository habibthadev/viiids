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

// WaploadedEngine : An Engine for Waploaded (https://waploaded.com)
type WaploadedEngine struct {
	Props
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
	e.Description = `Waploaded entertainment forum for movies, music and series downloads.`
	e.SearchURL = searchURL
	e.ListURL = listURL
	return &e
}

// String : pretty print engine
func (engine *WaploadedEngine) String() string {
	return fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
}

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
	movie.Title = title
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
	if looksLikeSeries(movie.Title) || looksLikeSeries(downloadLink.Path) {
		movie.IsSeries = true
	}

	// Year extraction e.g. "Movie Title (2023)"
	if re := regexp.MustCompile(`\((\d{4})\)`); movie.Title != "" {
		if m := re.FindStringSubmatch(movie.Title); len(m) > 1 {
			if y, err := strconv.Atoi(m[1]); err == nil {
				movie.Year = y
			}
		}
	}
	if movie.Title == "" || movie.DownloadLink.String() == "" {
		return movie, fmt.Errorf("empty title/link, selector likely stale for %s", el.Request.URL)
	}
	return movie, nil
}

func (engine *WaploadedEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	// Generic download-link harvesting: <a href="...download...">, .mp4/.mkv links
	downloadCollector.OnHTML("a", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		lower := strings.ToLower(href)
		if strings.Contains(lower, "download") ||
			strings.HasSuffix(lower, ".mp4") ||
			strings.HasSuffix(lower, ".mkv") ||
			strings.HasSuffix(lower, ".avi") {
			movie, ok := movieForRequest(movies, e.Request)
			if !ok {
				return
			}
			// Prefer first direct media link; keep page link otherwise
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				// Only overwrite if current link looks like a listing page
				cur := strings.ToLower(movie.DownloadLink.String())
				if !strings.HasSuffix(cur, ".mp4") && !strings.HasSuffix(cur, ".mkv") {
					movie.DownloadLink = u
				}
			}
		}
	})

	downloadCollector.OnHTML("img", func(e *colly.HTMLElement) {
		// Fill cover if missing from list page
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		if movie.CoverPhotoLink == "" {
			movie.CoverPhotoLink = e.Request.AbsoluteURL(e.Attr("src"))
		}
	})
}

// List : list trending movies
func (engine *WaploadedEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	// /trending/movie holds real film cards; keep path stable across calls
	base := "https://waploaded.com/trending/movie"
	u, _ := url.Parse(base)
	engine.ListURL = u
	movies, err := Scrape(engine)
	if err != nil {
		log.Errorf("scrape failed: %v", err)
		result.Error = err.Error()
	}
	result.Movies = movies
	return result
}

// Search : search waploaded for query (form: GET /search?q=<query>)
func (engine *WaploadedEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	// Reset path each call (Scrape mutates URLs on reuse)
	base := "https://waploaded.com/search"
	u, _ := url.Parse(base)
	engine.SearchURL = u
	q := engine.SearchURL.Query()
	q.Set("q", query)
	engine.SearchURL.RawQuery = q.Encode()
	movies, err := Scrape(engine)
	if err != nil {
		log.Errorf("scrape failed: %v", err)
		result.Error = err.Error()
	}
	result.Movies = movies
	return result
}
