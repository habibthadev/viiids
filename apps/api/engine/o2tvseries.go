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

// O2TVSeriesEngine : An Engine for O2TVSeries (https://o2tvseries.xyz)
type O2TVSeriesEngine struct {
	Props
}

// NewO2TVSeriesEngine : Constructor for O2TVSeries engine
func NewO2TVSeriesEngine() *O2TVSeriesEngine {
	base := "https://o2tvseries.xyz/"
	baseURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL.Path = "/"
	listURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	listURL.Path = "/"
	e := O2TVSeriesEngine{}
	e.Name = "O2TVSeries"
	e.BaseURL = baseURL
	e.Description = `O2TVSeries download site for movies and series.`
	e.SearchURL = searchURL
	e.ListURL = listURL
	return &e
}

// String : pretty print engine
func (engine *O2TVSeriesEngine) String() string {
	return fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
}

func (engine *O2TVSeriesEngine) getParseAttrs() (string, string, error) {
	// Verified 2026-09-06: cards are article.mh-loop-item,
	// title h3.entry-title a, cover figure img
	return "body", "article.mh-loop-item", nil
}

func (engine *O2TVSeriesEngine) parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error) {
	movie := Movie{
		Index:    index,
		IsSeries: false,
		Source:   engine.Name,
	}
	movie.Title = strings.TrimSpace(el.ChildText("h3.entry-title a"))
	if movie.Title == "" {
		movie.Title = strings.TrimSpace(el.ChildText("h3 a"))
	}
	movie.CoverPhotoLink = el.Request.AbsoluteURL(el.ChildAttr("figure img", "src"))
	if movie.CoverPhotoLink == "" {
		movie.CoverPhotoLink = el.Request.AbsoluteURL(el.ChildAttr("img", "src"))
	}
	movie.UploadDate = strings.TrimSpace(el.ChildText(".mh-meta-date"))
	movie.Description = strings.TrimSpace(el.ChildText(".mh-loop-excerpt p"))
	link := el.ChildAttr("h3.entry-title a", "href")
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
	if movie.Title != "" {
		if m := regexp.MustCompile(`\((\d{4})\)`).FindStringSubmatch(movie.Title); len(m) > 1 {
			if y, err := strconv.Atoi(m[1]); err == nil {
				movie.Year = y
			}
		}
	}
	if movie.Title == "" {
		return movie, fmt.Errorf("empty title, selector stale for %s", el.Request.URL)
	}
	return movie, nil
}

func (engine *O2TVSeriesEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	downloadCollector.OnHTML("a", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		lower := strings.ToLower(href)
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		// Series posts link one downloadwella file per episode
		// (slugs like Virgin.The.Series.S01E01...mkv.html).
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
		if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") ||
			strings.Contains(lower, "download") && (strings.Contains(lower, ".mp4") || strings.Contains(lower, ".mkv")) {
			if u, err := url.Parse(e.Request.AbsoluteURL(href)); err == nil {
				cur := strings.ToLower(movie.DownloadLink.String())
				if !strings.HasSuffix(cur, ".mp4") && !strings.HasSuffix(cur, ".mkv") {
					movie.DownloadLink = u
				}
			}
		}
	})
}

// List : list recent uploads (WordPress /page/<n>/)
func (engine *O2TVSeriesEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	base := "https://o2tvseries.xyz/"
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

// Search : search o2tvseries (WordPress ?s=<query>)
func (engine *O2TVSeriesEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	base := "https://o2tvseries.xyz/"
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
