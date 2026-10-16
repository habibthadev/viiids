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

// FzEngine : An Engine for FzMovies (https://fzmovies.host)
type FzEngine struct {
	Props
	ListCategories []string
}

// NewFzEngine : A Movie Engine Constructor for FzEngine
func NewFzEngine() *FzEngine {
	base := "https://fzmovies.host/"
	baseURL, err := url.Parse(base)
	if err != nil {
		log.Fatal(err)
	}
	searchURL, err := url.Parse("https://fzmovies.host/csearch.php")
	if err != nil {
		log.Fatal(err)
	}
	listURL, err := url.Parse("https://fzmovies.host/movieslist.php")
	if err != nil {
		log.Fatal(err)
	}

	fzEngine := FzEngine{}
	fzEngine.Name = "FzMovies"
	fzEngine.BaseURL = baseURL
	fzEngine.Description = `FzMovies archives Bollywood, Hollywood and dubbed movies with a download option per quality.`
	fzEngine.SearchURL = searchURL
	fzEngine.ListURL = listURL
	// 1 = Bollywood, 2 = Hollywood, 3 = Dubbed
	fzEngine.ListCategories = []string{"1", "2", "3"}
	return &fzEngine
}

// Engine Interface Methods

func (engine *FzEngine) String() string {
	return fmt.Sprintf("%s (%s)", engine.Name, engine.BaseURL)
}

// requestTimeout : fzmovies.host routinely answers in 8-12s.
func (engine *FzEngine) requestTimeout() time.Duration {
	return 35 * time.Second
}

var (
	fzYearTagRe    = regexp.MustCompile(`^\(((?:19|20)\d{2})\)$`)
	fzQualityTagRe = regexp.MustCompile(`^\(([A-Za-z][^)]{0,20})\)$`)
	fzQualityRe    = regexp.MustCompile(`(?i)\b(\d{3,4}p)\b`)
	fzSizeRe       = regexp.MustCompile(`\((\d[\d.,]*\s?(?:MB|GB))\)`)
	fzTagsRe       = regexp.MustCompile(`(?i)Tags\s*:\s*([^<]{2,80})`)
)

func (engine *FzEngine) getParseAttrs() (string, string, error) {
	// Verified 2026-10-16 on fzmovies.host: cards are div.mainbox holding a
	// table with the poster, a small-tag meta line (year), the download
	// quality and a blurb. csearch.php results use the same card.
	return "body", "div.mainbox", nil
}

func (engine *FzEngine) parseSingleMovie(el *colly.HTMLElement, index int) (Movie, error) {
	movie := Movie{
		Index:    index,
		IsSeries: false,
		Source:   engine.Name,
	}
	movie.CoverPhotoLink = el.Request.AbsoluteURL(el.ChildAttr("img", "src"))
	title := strings.TrimSpace(el.ChildText("a small b"))
	if title == "" {
		title = strings.TrimSpace(el.ChildText("small b"))
	}
	if title == "" {
		title = strings.TrimSpace(el.ChildText("a"))
	}
	movie.Title = cleanMovieTitle(title)
	el.ForEach("small", func(_ int, s *colly.HTMLElement) {
		t := strings.TrimSpace(s.Text)
		if m := fzYearTagRe.FindStringSubmatch(t); len(m) == 2 {
			if movie.Year == 0 {
				if y, err := strconv.Atoi(m[1]); err == nil {
					movie.Year = y
				}
			}
			return
		}
		if m := fzQualityTagRe.FindStringSubmatch(t); len(m) == 2 && len(t) <= 22 {
			if movie.Quality == "" {
				movie.Quality = m[1]
			}
			return
		}
		if movie.Description == "" && len(t) > 120 {
			desc := t
			if cut := strings.Index(desc, "Tags :"); cut > 0 {
				desc = desc[:cut]
			}
			desc = strings.TrimSpace(strings.ReplaceAll(desc, "<more>", ""))
			movie.Description = desc
		}
	})
	if m := fzTagsRe.FindStringSubmatch(el.Text); len(m) == 2 {
		movie.Tags = strings.TrimSpace(m[1])
	}
	movie.UploadDate = strings.TrimSpace(el.ChildAttr(`meta[itemprop="datePublished"]`, "content"))
	link := el.ChildAttr("a", "href")
	downloadLink, err := url.Parse(el.Request.AbsoluteURL(link))
	if err != nil {
		return movie, err
	}
	movie.DownloadLink = downloadLink
	if movie.Year == 0 {
		movie.Year = movieYear(movie.Title)
	}
	if looksLikeSeries(movie.Title) || looksLikeSeries(downloadLink.Path) {
		movie.IsSeries = true
	}
	if movie.Title == "" || movie.DownloadLink.String() == "" {
		return movie, fmt.Errorf("empty title/link, selector stale for %s", el.Request.URL)
	}
	return movie, nil
}

func (engine *FzEngine) updateDownloadProps(downloadCollector *colly.Collector, movies *[]Movie) {
	// Movie pages list one row per quality inside ul.moviesfiles: the row
	// anchor text carries the label ("Dhamaal 4 WEB-DL 480p.mp4") and the
	// sibling dcounter the size ("(378 MB)"). The download keys themselves
	// are session-bound, so size/quality alone are harvested here — the API
	// re-walks the chain at download time.
	downloadCollector.OnHTML("ul.moviesfiles li", func(e *colly.HTMLElement) {
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		if movie.Size == "" {
			if m := fzSizeRe.FindStringSubmatch(e.Text); len(m) == 2 {
				movie.Size = m[1]
			}
		}
		if movie.Quality == "" {
			label := strings.TrimSpace(e.ChildText("a[href*='download1.php']"))
			if m := fzQualityRe.FindStringSubmatch(label); len(m) == 2 {
				movie.Quality = m[1]
			}
		}
	})
	downloadCollector.OnHTML("title", func(e *colly.HTMLElement) {
		movie, ok := movieForRequest(movies, e.Request)
		if !ok {
			return
		}
		if movie.Year == 0 {
			movie.Year = movieYear(strings.TrimSpace(e.Text))
		}
	})
}

// List : list the latest upload per category (movieslist.php has no
// pagination — page 1 is all there is, later pages answer empty).
func (engine *FzEngine) List(page int) SearchResult {
	engine.mode = ListMode
	result := SearchResult{
		Query: "List of Recent Uploads - Page " + strconv.Itoa(page),
	}
	if page > 1 {
		result.Movies = []Movie{}
		return result
	}
	out := make([][]Movie, len(engine.ListCategories))
	errs := make([]error, len(engine.ListCategories))
	var wg sync.WaitGroup
	for i, catID := range engine.ListCategories {
		wg.Add(1)
		go func(i int, catID string) {
			defer wg.Done()
			eng := NewFzEngine()
			eng.mode = ListMode
			u := *eng.ListURL
			q := u.Query()
			q.Set("catID", catID)
			q.Set("by", "latest")
			u.RawQuery = q.Encode()
			eng.ListURL = &u
			movies, err := Scrape(eng)
			if err != nil {
				log.Errorf("scrape failed: %v", err)
				errs[i] = err
				return
			}
			out[i] = movies
		}(i, catID)
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

// Search : searches fzmovies by name (GET csearch.php)
func (engine *FzEngine) Search(param ...string) SearchResult {
	query := param[0]
	engine.mode = SearchMode
	result := SearchResult{
		Query: query,
	}
	u := *engine.SearchURL
	q := u.Query()
	q.Set("searchname", query)
	q.Set("searchby", "Name")
	q.Set("category", "All")
	u.RawQuery = q.Encode()
	engine.SearchURL = &u
	movies, err := Scrape(engine)
	if err != nil {
		log.Errorf("scrape failed: %v", err)
		result.Error = err.Error()
	}
	result.Movies = movies
	return result
}
