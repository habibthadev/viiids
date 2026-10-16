package engine

import (
	"net/url"
	"testing"
)

func TestLooksLikeSeries(t *testing.T) {
	series := []string{
		"Gen V (2023 TV Series) Download",
		"Mr. Robot S04 (Complete) | TV Series",
		"Virgin The Series (2022) Complete Season 1",
		"Power Book II Ghost Season 1 Complete Series Download",
		"Into the Badlands Season 3 Complete Series Download",
		"Show S01E02 Something",
		"Beauty in Black (2024)",
	}
	for _, title := range series[:6] {
		if !looksLikeSeries(title) {
			t.Errorf("expected series: %q", title)
		}
	}
	if looksLikeSeries(series[6]) {
		t.Errorf("false positive: %q", series[6])
	}
	if looksLikeSeries("Jumanji: Welcome to the Jungle (2017)") {
		t.Errorf("false positive: jumanji movie")
	}
	// Nkiri normalizes titles with underscores — markers must still be caught.
	normalized := []string{
		"Crystal_Lake_S01_(Complete)",
		"The_Lowdown_S02_(Episode_1_2_Added)",
		"Inside_the_Circle_S01_(Complete)",
		"Some_Show_S01E02_Something",
		"Gen_V_(2023_TV_Series)_Download",
	}
	for _, title := range normalized {
		if !looksLikeSeries(title) {
			t.Errorf("expected series (normalized): %q", title)
		}
	}
	for _, title := range []string{"Rise_of_the_Footsoldier__Retribution_(2026)", "Practical_Magic_(1998)"} {
		if looksLikeSeries(title) {
			t.Errorf("false positive (normalized): %q", title)
		}
	}
}

func TestEpisodeKey(t *testing.T) {
	cases := []struct {
		text, href, want string
	}{
		{"SEASON 1 EPISODE 2 DOWNLOAD", "https://meetdownload.com/abc/gen-v-s01e02-x-mkv", "S01E02"},
		{"SEASON 2 EPISODE 10 DOWNLOAD", "https://x.test/y", "S02E10"},
		{"Download Episode", "https://downloadwella.com/a/Virgin.The.Series.S01E08.(NKIRI.COM).mkv.html", "S01E08"},
		{"Black Trick The Lawyer Who Controls Justice S01 E11", "https://shows.waploaded.com/series/923717/black-trick", "S01E11"},
		{"Show S02 E03 Something", "https://shows.waploaded.com/series/1/x", "S02E03"},
		{"Beyond the Gates S02 E188", "https://shows.waploaded.com/series/923565/beyond-the-gates-s02-e188", "S02E188"},
		{"", "https://shows.waploaded.com/series/999/show-s01-e123", "S01E123"},
		{"Episode 4", "https://thenkiri.com/some-post/", "E04"},
		{"Download Movie", "https://thenkiri.com/film/", ""},
		{"Jumanji: Welcome to the Jungle", "https://films.waploaded.com/movie/1/x", ""},
	}
	for _, c := range cases {
		got, ok := episodeKey(c.text, c.href)
		if c.want == "" && ok {
			t.Errorf("episodeKey(%q) = %q, want none", c.text, got)
		}
		if c.want != "" && (!ok || got != c.want) {
			t.Errorf("episodeKey(%q) = %q,%v want %q", c.text, got, ok, c.want)
		}
	}
}

func TestCleanMovieTitle(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Khalifa (2026) Movie Download", "Khalifa (2026)"},
		{"Avatar: The Way Of Water Movie 2022", "Avatar: The Way Of Water (2022)"},
		{"Ed Gein: The House of Horrors (2026) MOVIE", "Ed Gein: The House of Horrors (2026)"},
		{"Dhamaal 4", "Dhamaal 4"},
		{"Scary Movie", "Scary Movie"},
		{"Virgin The Series (2022) Complete Season 1", "Virgin The Series (2022) Complete Season 1"},
		{"Trail of Ashes (2020) Movie Free Mp4 Download", "Trail of Ashes (2020)"},
		{"Murmur (2020) Movie Download Mp4", "Murmur (2020)"},
		{"Voice Season 2 Episode 1-12 Download", "Voice Season 2 Episode 1-12"},
		{"The Other Lamb 2020 Download", "The Other Lamb (2020)"},
		{"The India Story 2026", "The India Story (2026)"},
		{"Lust Stories 3 2026", "Lust Stories 3 (2026)"},
		{"Tracker (2024 TV series)", "Tracker (2024)"},
		{"Tyler Perrys The Oval (2019 TV Series)", "Tyler Perrys The Oval (2019)"},
		{"Some Show (TV series)", "Some Show"},
		{"Clarksons Farm (2021 Web Series) Download", "Clarksons Farm (2021)"},
	}
	for _, c := range cases {
		if got := cleanMovieTitle(c.in); got != c.want {
			t.Errorf("cleanMovieTitle(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestMovieYear(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"Khalifa (2026)", 2026},
		{"Ed Gein: The House of Horrors 2026", 2026},
		{"Virgin The Series (2022) Complete Season 1", 2022},
		{"Dhamaal 4", 0},
	}
	for _, c := range cases {
		if got := movieYear(c.in); got != c.want {
			t.Errorf("movieYear(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestNormalizeSearch(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Spider-Man: No Way Home (2026)", "spider man no way home 2026"},
		{"  [REC]  ", "rec"},
		{"Black Trick The Lawyer Who Controls Justice (2026)", "black trick the lawyer who controls justice 2026"},
	}
	for _, c := range cases {
		if got := normalizeSearch(c.in); got != c.want {
			t.Errorf("normalizeSearch(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestRankWaploaded(t *testing.T) {
	u := func(s string) *url.URL { p, _ := url.Parse("https://films.waploaded.com/movie/1/" + s); return p }
	items := []Movie{
		{Title: "The Sacrifice Game (2026)", DownloadLink: u("a")},
		{Title: "Sacrifice (2026)", DownloadLink: u("b")},
		{Title: "Tenzing (2026)", DownloadLink: u("c")},
		{Title: "Spider-Man: No Way Home (2021)", DownloadLink: u("d")},
		{Title: "No Country for Old Men (2007)", DownloadLink: u("e")},
	}

	got := rankWaploaded(items, "sacrifice", 10)
	if len(got) != 2 {
		t.Fatalf("sacrifice matched %d items, want 2", len(got))
	}
	if got[0].Title != "Sacrifice (2026)" {
		t.Errorf("first hit = %q, want the shortest exact-word match", got[0].Title)
	}

	got = rankWaploaded(items, "spider man", 10)
	if len(got) != 1 || got[0].Title != "Spider-Man: No Way Home (2021)" {
		t.Fatalf("token match failed: %+v", got)
	}

	if got := rankWaploaded(items, "no way", 1); len(got) != 1 || got[0].Title != "Spider-Man: No Way Home (2021)" {
		t.Fatalf("limit or multi-token match failed: %+v", got)
	}

	if got := rankWaploaded(items, "no", 10); len(got) != 2 {
		t.Fatalf("substring token should hit both titles: %+v", got)
	}

	if got := rankWaploaded(items, "  ", 10); got != nil {
		t.Fatalf("blank query must match nothing, got %+v", got)
	}
}
