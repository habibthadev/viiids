package engine

import "testing"

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
}

func TestEpisodeKey(t *testing.T) {
	cases := []struct {
		text, href, want string
	}{
		{"SEASON 1 EPISODE 2 DOWNLOAD", "https://meetdownload.com/abc/gen-v-s01e02-x-mkv", "S01E02"},
		{"SEASON 2 EPISODE 10 DOWNLOAD", "https://x.test/y", "S02E10"},
		{"Download Episode", "https://downloadwella.com/a/Virgin.The.Series.S01E08.(NKIRI.COM).mkv.html", "S01E08"},
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
