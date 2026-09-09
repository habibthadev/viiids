package api

import "testing"

func TestSafeFilenameKeepsExtension(t *testing.T) {
	cases := []struct {
		target, override, ct, want string
	}{
		// Bare titles gain the file extension from the URL.
		{"https://dwbe01.downloadwella.com/d/abc/Film.2024.720p.BluRay.mkv", "Jumanji__Welcome_to_the_Jungle_(2017)", "video/x-matroska", "Jumanji__Welcome_to_the_Jungle_(2017).mkv"},
		// Titles that already carry one are untouched.
		{"https://x.test/f.mkv", "Film (2024).mp4", "video/mp4", "Film (2024).mp4"},
		// No usable URL extension: fall back to content type.
		{"https://7up.kissorgrab.com/dl/token123", "Some Film", "video/mp4", "Some Film.mp4"},
		// Nothing known at all: last-resort default.
		{"https://7up.kissorgrab.com/dl/token123", "", "application/octet-stream", "viiids-download.mp4"},
		// Dangerous characters are stripped; extension still comes from the URL.
		{"https://x.test/f.mkv", "a/b\\c\"d", "video/mp4", "a-b-cd.mkv"},
	}
	for _, c := range cases {
		if got := safeFilename(c.target, c.override, c.ct); got != c.want {
			t.Errorf("safeFilename(%q, %q, %q) = %q, want %q", c.target, c.override, c.ct, got, c.want)
		}
	}
}
