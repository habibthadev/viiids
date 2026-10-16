package api

import (
	"strings"
	"testing"
)

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

func TestJsGateLinksFindsTokenLink(t *testing.T) {
	// A JS-gated page (meetdownload-style): the download button sets
	// location.href from inline script, no form anywhere.
	page := []byte(`<html><body>
<a rel="nofollow" id="downloadButton"><span>Download Video (102.02MB)</span></a>
<script>
document.getElementById('downloadButton').onclick = function() { location.href = 'https://ol3.kissorgrab.com/dl/b8dd9cbc12da67904938941.fb5ef75c63832696d3da68/tracker-2024-s01e01-51556-mkv'; };
</script>
</body></html>`)
	got := jsGateLinks("https://meetdownload.com/f19b01dfb9be4b738ff430deee48755b/x", page)
	if len(got) != 1 || !strings.Contains(got[0], "ol3.kissorgrab.com/dl/") {
		t.Fatalf("jsGateLinks = %v, want the kissorgrab /dl/ token URL", got)
	}
}

func TestJsGateLinksIgnoresPlainPages(t *testing.T) {
	// No JS redirect and no media URLs: nothing to hand to the verifier.
	page := []byte(`<html><body><a href="/about">About</a></body></html>`)
	if got := jsGateLinks("https://example.com/page", page); len(got) != 0 {
		t.Fatalf("jsGateLinks = %v, want empty", got)
	}
}

func TestDecodeJSString(t *testing.T) {
	// loadedfiles embeds its final pt link in Alpine x-data, HTML-escaped and
	// JS-escaped (\uXXXX for : ? =, \/ for slashes).
	raw := `https:\/\/loadedfiles.net\/66e9117fe80fb721\u003Fpt\u003DSWtnNUtXeGR5\u00253D`
	want := "https://loadedfiles.net/66e9117fe80fb721?pt=SWtnNUtXeGR5%3D"
	if got := decodeJSString(raw); got != want {
		t.Fatalf("decodeJSString = %q, want %q", got, want)
	}
}

func TestLoadedfilesLinkRegex(t *testing.T) {
	page := []byte(`<div x-data="{ link: 'https:\/\/loadedfiles.net\/abc?pt=TOKEN\u00253D' }">`)
	m := lfLinkRe.FindSubmatch(page)
	if len(m) != 3 {
		t.Fatalf("lfLinkRe did not match the x-data link")
	}
	got := decodeJSString(lfLinkValue(m))
	if !strings.Contains(got, "?pt=TOKEN") {
		t.Fatalf("lfLinkValue = %q, want the pt token URL", got)
	}
}

func TestUnlockHostIncludesWetafiles(t *testing.T) {
	for host, want := range map[string]bool{
		"wetafiles.com":           true,
		"nkweta2.wetafiles.com":   true,
		"meetdownload.com":        true,
		"downloadwella.com":       true,
		"loadedfiles.net":         false,
		"wetafiles.com.evil.test": false,
	} {
		if got := unlockHost(host); got != want {
			t.Errorf("unlockHost(%q) = %v, want %v", host, got, want)
		}
	}
	if !isLoadedfilesHost("loadedfiles.net") || isLoadedfilesHost("wetafiles.com") {
		t.Fatalf("isLoadedfilesHost routing is wrong")
	}
}
