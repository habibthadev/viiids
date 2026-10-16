package engine

import (
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/gocolly/colly/v2"
	log "github.com/sirupsen/logrus"
)

// Nkiri : An Engine for  Nkiri
type NkiriEngine struct {
	Props
	ListCategories []string
}

// NewNkiriEngine : A Movie Engine Constructor for Nkiri
func NewNkiriEngine() *NkiriEngine {
	base := "https://thenkiri.com/"
	baseURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	// Search URL
	searchURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL.Path = ""
	// List URL
	listURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	listURL.Path = "/category/"
	nkiriEngine := NkiriEngine{}
	nkiriEngine.Name = "Nkiri"
	nkiriEngine.BaseURL = baseURL
	nkiriEngine.Description = `Nkiri is an entertainment website where you can download Hollywood, Korean, Chinese and other movies, TV Series and Dramas freely and easily.`
	nkiriEngine.SearchURL = searchURL
	nkiriEngine.ListURL = listURL
	nkiriEngine.ListCategories = []string{
		"international",
		"tv-series",
		"download-k-drama",
		"asian-movies/download-bollywood-movies",
		"asian-movies/download-korean-movies",
		"asian-movies/download-philippine-movies",
		"asian-movies/chinese-dramas",
	}
	return &nkiriEngine
}

// Engine Interface Methods
func (engine *NkiriEngine) String() string {
	return fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
}

func (engine *NkiriEngine) getParseAttrs() (string, string, error) {
	var (
		article string
		main    string
	)
	switch engine.mode {
	case SearchMode:
		article = "article"
		main = "div.site-content"
	case ListMode:
		main = "div.entries"
		article = "article.blog-entry"
	default:
		return "", "", fmt.Errorf("Invalid mode %v", engine.mode)
	}
	return main, article, nil
}

func (engine *NkiriEngine) parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error) {
	// movie title identifier
	yearRe := regexp.MustCompile(`\((.*)\)`)
	removeCaratRe, err := regexp.Compile(`[^\w()]`)
	if err != nil {
		return Movie{}, err
	}
	movie := Movie{
		Index:    index,
		IsSeries: false,
		Source:   engine.Name,
	}
	movie.CoverPhotoLink = el.ChildAttr("img", "src")
	// Split with '|': Title at Index 0
	titleSplit := strings.Split(el.ChildText("h2"), " | ")
	if len(titleSplit) >= 1 {
		movie.Title = removeCaratRe.ReplaceAllString(titleSplit[0], "_")
	}
	if len(titleSplit) >= 2 {
		movie.Category = strings.TrimSuffix(strings.TrimPrefix(titleSplit[1], "Download"), "Movie")
	}
	if looksLikeSeries(movie.Title) {
		movie.IsSeries = true
	}
	//Fetch UploadDate for ListMode Items
	if engine.mode == ListMode {
		movie.UploadDate = strings.TrimSpace(el.ChildText("div.blog-entry-date"))
	}
	//Fetch DownloadLink
	downloadLink, err := url.Parse(el.ChildAttr("a", "href"))
	if err != nil {
		return movie, err
	}
	movie.DownloadLink = downloadLink
	if movie.Title != "" {
		year := yearRe.FindStringSubmatch(movie.Title)
		if len(year) > 1 {
			intYear, err := strconv.Atoi(year[1])
			if err == nil {
				movie.Year = intYear
			}
		}
	}
	return movie, nil
}

func (engine *NkiriEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	sizeRe := regexp.MustCompile(`(\d.*)`)
	epNumRe := regexp.MustCompile(`(?i)episode\s*(\d+)`)
	// Detail pages render Elementor sections inside div[data-elementor-type="wp-post"]
	// (older theme used div.elementor-section-wrap — kept as fallback).
	downloadCollector.OnHTML(`div[data-elementor-type="wp-post"], div.elementor-section-wrap`, func(e *colly.HTMLElement) {
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		seriesMap := map[string]*url.URL{}
		nextSection := false
		e.ForEach("section.elementor-section", func(n int, inner *colly.HTMLElement) {
			btnText := inner.ChildText("span.elementor-button-text")
			btnHref := inner.ChildAttr("div.elementor-button-wrapper > a", "href")
			switch {
			//Fetch Download Link For Series
			case strings.HasPrefix(btnText, "Download Episode"):
				// Prefer the "Episode N" heading in the same section for a stable key.
				key := ""
				if m := epNumRe.FindStringSubmatch(inner.ChildText("h2")); len(m) == 2 {
					key = "E" + pad2(m[1])
				} else if k, ok := episodeKey(btnText, btnHref); ok {
					key = k
				} else {
					key = strconv.Itoa(len(seriesMap) + 1)
				}
				downloadLink, err := url.Parse(btnHref)
				if err != nil {
					log.Debugf("skipping bad episode link: %v", err)
					return
				}
				seriesMap[key] = downloadLink
			//Fetch DownloadLink For Movies
			case strings.HasPrefix(btnText, "Download Movie"):
				downloadLink, err := url.Parse(btnHref)
				if err != nil {
					log.Debugf("skipping bad movie link: %v", err)
					return
				}
				movie.DownloadLink = downloadLink
			}
			//Update movie size
			if strings.HasPrefix(inner.ChildText("span.elementor-alert-title"), "Download Size") {
				sizeMatch := sizeRe.FindStringSubmatch(
					strings.TrimSpace(
						inner.ChildText("span.elementor-alert-description")))
				if len(sizeMatch) >= 1 {
					movie.Size = strings.TrimSpace(sizeMatch[0])
				}
			}
			//Fetch Movie Description
			if strings.HasPrefix(inner.ChildText("div.elementor-container"), "Synopsis") {
				nextSection = true
			} else if nextSection {
				movie.Description = inner.ChildText("p")
				nextSection = false
			}
		})
		if len(seriesMap) > 0 {
			movie.IsSeries = true
			movie.SDownloadLink = seriesMap
		}
	})
}

// List : list all the movies on a page
func (engine *NkiriEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	pageParam := fmt.Sprintf("page/%v", strconv.Itoa(page))
	listCategoryPath := engine.ListURL.Path
	out := make([][]Movie, len(engine.ListCategories))
	errs := make([]error, len(engine.ListCategories))
	var wg sync.WaitGroup
	for i, category := range engine.ListCategories {
		wg.Add(1)
		go func(i int, category string) {
			defer wg.Done()
			eng := NewNkiriEngine()
			eng.mode = ListMode
			eng.ListURL.Path = path.Join(listCategoryPath, category, pageParam)
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

// Search : Searches nkiri for a particular query and return an array of movies
func (engine *NkiriEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	q := engine.SearchURL.Query()
	q.Set("s", query)
	q.Set("post_type", "post")
	engine.SearchURL.RawQuery = q.Encode()
	movies, err := Scrape(engine)
	if err != nil {
		log.Errorf("scrape failed: %v", err)
		result.Error = err.Error()
	}
	result.Movies = movies
	return result
}
